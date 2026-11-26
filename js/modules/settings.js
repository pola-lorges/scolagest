/**
 * Module Paramètres : nom de l'établissement, année scolaire, trimestre en cours,
 * réinitialisation des données de démonstration.
 */
const Settings = (() => {
  const PAGE_SIZE = 100;
  const SENSITIVE_FIELD = /password|passwd|mot.?de.?passe|secret|token|api.?key|access.?key|credential/i;

  function removeSecrets(value) {
    if (Array.isArray(value)) return value.map(removeSecrets);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_FIELD.test(key))
      .map(([key, child]) => [key, removeSecrets(child)]));
  }

  function buildExportPayload(database, accounts, school) {
    return {
      format: "ScolaGest backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      establishment: removeSecrets(school),
      accounts: removeSecrets(accounts),
      database: removeSecrets(database),
    };
  }

  function isCurrentAdmin() {
    return Auth.getCurrentUser()?.role === "ADMIN";
  }

  async function exportDatabase() {
    if (!isCurrentAdmin()) throw new Error("Seul un administrateur peut exporter les données.");
    if (Auth.isDemoSession()) throw new Error("L’export de la base est indisponible en mode démo.");
    const accounts = await Auth.listSchoolUsers();
    if (!isCurrentAdmin()) throw new Error("La session administrateur a expiré.");
    const payload = buildExportPayload(Storage.db(), accounts, Storage.getActiveSchool());
    const filename = `scolagest-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Utils.toast("Sauvegarde téléchargée. Les mots de passe et secrets ne sont pas exportés.", "success");
  }

  function render(container) {
    const user = Auth.getCurrentUser();
    const canManageSettings = Permissions.canEdit("settings");
    if (!user || !["ADMIN", "DIRECTEUR"].includes(user.role)) return;
    const canExportDatabase = user.role === "ADMIN" && !Auth.isDemoSession();
    const s = Storage.db().settings;
    container.innerHTML = `
      ${canManageSettings ? `
      <div class="panel">
        <h3>Informations de l'établissement</h3>
        <div class="form-grid">
          <div class="field full"><label>Nom de l'établissement *</label><input type="text" id="fSchoolName" value="${Utils.escapeHtml(s.schoolName)}" required></div>
          <div class="field full"><label>Logo de l'établissement</label><input type="file" id="fSchoolLogo" accept="image/png,image/jpeg,image/webp"><img id="schoolLogoPreview" class="school-logo-preview" src="${Utils.safeImageSrc(s.bulletin?.logo)}" alt="Aperçu du logo" style="${Utils.safeImageSrc(s.bulletin?.logo) ? "" : "display:none;"}"></div>
          <div class="field"><label>Année scolaire *</label><input type="text" id="fYear" value="${Utils.escapeHtml(s.currentYear)}" required></div>
          <div class="field"><label>Période en cours *</label>
            <select id="fTerm" required>${["Trimestre 1", "Trimestre 2", "Trimestre 3"].map((t) => `<option ${s.currentTerm === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
        </div>
        <button class="btn" id="saveSettings" style="margin-top:14px;">💾 Enregistrer</button>
      </div>` : ""}
      ${canExportDatabase ? `
      <div class="panel">
        <div class="toolbar">
          <div><h3 style="margin:0 0 4px;">Sauvegarde des données</h3><p class="text-muted" style="margin:0;">Export JSON des données et des comptes. Les mots de passe et secrets ne sont jamais inclus.</p></div>
          <span class="spacer"></span>
          <button class="btn btn-secondary" id="exportDatabase" type="button" title="Télécharger une sauvegarde JSON">⬇️ Exporter la base</button>
        </div>
      </div>` : ""}
      <div class="panel">
        <div class="toolbar">
          <h3 style="margin:0;">Historique des actions</h3>
          <span class="spacer"></span>
          <input type="search" id="auditSearch" placeholder="🔍 Rechercher dans l’historique..." aria-label="Rechercher dans l’historique" style="max-width:280px;">
          <button class="btn btn-secondary btn-sm" id="refreshAudit" type="button" title="Actualiser l’historique">↻ Actualiser</button>
        </div>
        <div id="auditHistory" aria-live="polite"><p class="text-muted">Chargement de l’historique…</p></div>
        <div class="toolbar" style="justify-content:flex-end;margin:12px 0 0;">
          <button class="btn btn-secondary btn-sm" id="auditPrevious" type="button" disabled>← Précédent</button>
          <span id="auditPageLabel" class="text-muted">Page 1</span>
          <button class="btn btn-secondary btn-sm" id="auditNext" type="button" disabled>Suivant →</button>
        </div>
      </div>
    `;

    let currentPage = 0;
    let searchQuery = "";
    let allEntries = null;
    const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    async function fetchAllEntries() {
      if (allEntries) return allEntries;
      const items = [];
      const batch = 200;
      for (let p = 0; p < 50; p++) {
        const res = await Storage.getAuditLogs(p, batch);
        items.push(...(res.items || []));
        if (items.length >= (Number(res.total) || 0) || !(res.items || []).length) break;
      }
      allEntries = items;
      return items;
    }
    async function loadHistory(page, refresh = false) {
      currentPage = page;
      if (refresh) allEntries = null;
      const history = container.querySelector("#auditHistory");
      history.innerHTML = '<p class="text-muted">Chargement de l’historique…</p>';
      try {
        let result;
        if (searchQuery.trim()) {
          const needle = normalize(searchQuery.trim());
          const matches = (await fetchAllEntries()).filter((entry) => normalize([
            entry.user_name || entry.userName, entry.user_role || entry.userRole, entry.action,
            entry.created_at || entry.createdAt,
          ].join(" ")).includes(needle));
          result = { items: matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), total: matches.length };
        } else {
          result = await Storage.getAuditLogs(page, PAGE_SIZE);
        }
        const entries = result.items || [];
        const total = Number(result.total) || 0;
        const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
        history.innerHTML = entries.length ? `
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Date et heure</th><th>Utilisateur</th><th>Rôle</th><th>Action et détails</th><th>Appareil</th></tr></thead>
            <tbody>${entries.map((entry) => {
              const date = entry.created_at || entry.createdAt;
              const userName = entry.user_name || entry.userName || "Utilisateur";
              const role = entry.user_role || entry.userRole || "";
              const [rawAction = "", device = ""] = (entry.action || "").split(" | Appareil : ");
              const action = rawAction.replace(/; ?[^;|]*(?:mot de passe|password|secret|token|jeton|photo|image|logo)[^;|]*(?=;|$)/gi, "").replace(/(\| Détails : )[^;|]*(?:mot de passe|password|secret|token|jeton|photo|image|logo)[^;|]*(?:; ?|$)/i, "$1").replace(/ \| Détails : $/, "");
              const dateLabel = date && !Number.isNaN(Date.parse(date))
                ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(date))
                : "Date inconnue";
              return `<tr><td>${Utils.escapeHtml(dateLabel)}</td><td>${Utils.escapeHtml(userName)}</td><td>${Utils.escapeHtml(ROLE_LABELS[role] || role)}</td><td style="white-space:normal;min-width:280px;">${Utils.escapeHtml(action)}</td><td>${Utils.escapeHtml(device || "Non renseigné")}</td></tr>`;
            }).join("")}</tbody>
          </table></div>` : '<p class="empty-state">Aucune action enregistrée.</p>';
        container.querySelector("#auditPageLabel").textContent = `Page ${page + 1} sur ${pageCount}`;
        container.querySelector("#auditPrevious").disabled = page <= 0;
        container.querySelector("#auditNext").disabled = page + 1 >= pageCount;
      } catch (error) {
        history.innerHTML = '<p class="login-error">Impossible de charger l’historique. Vérifiez le déploiement du schéma Supabase et réessayez.</p>';
        container.querySelector("#auditPageLabel").textContent = "Historique indisponible";
        container.querySelector("#auditPrevious").disabled = true;
        container.querySelector("#auditNext").disabled = true;
        console.error("Chargement de l’historique impossible", error);
      }
    }
    let searchTimer = null;
    container.querySelector("#auditSearch").addEventListener("input", (event) => {
      searchQuery = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadHistory(0), 250);
    });
    container.querySelector("#refreshAudit").addEventListener("click", () => loadHistory(currentPage, true));
    container.querySelector("#auditPrevious").addEventListener("click", () => loadHistory(currentPage - 1));
    container.querySelector("#auditNext").addEventListener("click", () => loadHistory(currentPage + 1));
    container.querySelector("#exportDatabase")?.addEventListener("click", async (event) => {
      if (!isCurrentAdmin()) return Utils.toast("Seul un administrateur peut exporter les données.", "error");
      if (Auth.isDemoSession()) return Utils.toast("L’export de la base est indisponible en mode démo.", "error");
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await exportDatabase();
      } catch (error) {
        Utils.toast(error.message || "Export de la base impossible.", "error");
      } finally {
        button.disabled = false;
      }
    });
    loadHistory(0);

    if (!canManageSettings) return;
    let logoData = s.bulletin?.logo || "";
    container.querySelector("#fSchoolLogo").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      logoData = await Utils.readImageAsDataURL(file, { maxSide: 400 });
      const preview = container.querySelector("#schoolLogoPreview");
      preview.src = Utils.safeImageSrc(logoData);
      preview.style.display = "block";
    });
    container.querySelector("#saveSettings").addEventListener("click", () => {
      if (!Utils.validateRequired(container)) return;
      Storage.setSettings({
        schoolName: container.querySelector("#fSchoolName").value.trim(),
        currentYear: container.querySelector("#fYear").value.trim(),
        currentTerm: container.querySelector("#fTerm").value,
        bulletin: { ...(s.bulletin || {}), logo: logoData },
      });
      Utils.toast("Paramètres enregistrés", "success");
      Router.updateYearBadge();
    });
  }
  return { render, buildExportPayload };
})();
