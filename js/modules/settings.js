/**
 * Module Paramètres : nom de l'établissement, année scolaire, trimestre en cours,
 * réinitialisation des données de démonstration.
 */
const Settings = (() => {
  const PAGE_SIZE = 100;

  function render(container) {
    const user = Auth.getCurrentUser();
    const canManageSettings = Permissions.canEdit("settings");
    if (!user || !["ADMIN", "DIRECTEUR"].includes(user.role)) return;
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
      <div class="panel">
        <div class="toolbar">
          <h3 style="margin:0;">Historique des actions</h3>
          <span class="spacer"></span>
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
    async function loadHistory(page) {
      currentPage = page;
      const history = container.querySelector("#auditHistory");
      history.innerHTML = '<p class="text-muted">Chargement de l’historique…</p>';
      try {
        const result = await Storage.getAuditLogs(page, PAGE_SIZE);
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
              const [action = "", device = ""] = (entry.action || "").split(" | Appareil : ");
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
    container.querySelector("#refreshAudit").addEventListener("click", () => loadHistory(currentPage));
    container.querySelector("#auditPrevious").addEventListener("click", () => loadHistory(currentPage - 1));
    container.querySelector("#auditNext").addEventListener("click", () => loadHistory(currentPage + 1));
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
  return { render };
})();
