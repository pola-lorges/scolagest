/**
 * Module Élèves : CRUD, matricule unique, photo, historique de classes,
 * statut, import/export CSV, recherche et filtres.
 */
const Students = (() => {
  let filters = { q: "", classId: "", status: "", level: "" };

  function genMatricule() {
    const yr = Storage.db().settings.currentYear.split("-")[1] || new Date().getFullYear();
    const count = Storage.all("students").length + 1;
    return `ELV-${yr}-${Utils.pad(count, 3)}`;
  }

  function render(container) {
    const classes = Storage.all("classes");
    const canEdit = Permissions.canEdit("students");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input type="text" id="stuSearch" placeholder="🔍 Rechercher nom, matricule..." value="${Utils.escapeHtml(filters.q)}">
          <select id="stuClassFilter">
            <option value="">Toutes les classes</option>
            ${classes.map((c) => `<option value="${c.id}" ${filters.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("")}
          </select>
          <select id="stuStatusFilter">
            <option value="">Tous statuts</option>
            ${["actif", "transféré", "exclu", "diplômé"].map((s) => `<option value="${s}" ${filters.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
          <span class="spacer"></span>
          ${canEdit ? `
          <button class="btn btn-secondary" id="btnExportCsv">⬇️ Export CSV</button>
          <label class="btn btn-secondary" style="margin:0;">
            ⬆️ Import CSV
            <input type="file" id="importCsvInput" accept=".csv" style="display:none;">
          </label>
          <button class="btn" id="btnAddStudent">+ Nouvel élève</button>` : ""}
        </div>
        <div class="table-wrap" id="studentsTableWrap"></div>
      </div>
    `;

    container.querySelector("#stuSearch").addEventListener("input", (e) => {
      filters.q = e.target.value;
      renderTable();
    });
    container.querySelector("#stuClassFilter").addEventListener("change", (e) => {
      filters.classId = e.target.value;
      renderTable();
    });
    container.querySelector("#stuStatusFilter").addEventListener("change", (e) => {
      filters.status = e.target.value;
      renderTable();
    });
    container.querySelector("#btnAddStudent")?.addEventListener("click", () => openForm());
    container.querySelector("#btnExportCsv")?.addEventListener("click", exportCsv);
    container.querySelector("#importCsvInput")?.addEventListener("change", importCsv);

    renderTable();
  }

  function getFiltered() {
    const classes = Storage.all("classes");
    const scoped = Auth.scopedStudentIds();
    return Storage.all("students").filter((s) => {
      if (scoped && !scoped.includes(s.id)) return false;
      const cls = classes.find((c) => c.id === s.classId);
      const q = filters.q.trim().toLowerCase();
      const matchQ =
        !q ||
        `${s.firstName} ${s.lastName} ${s.matricule}`.toLowerCase().includes(q);
      const matchClass = !filters.classId || s.classId === filters.classId;
      const matchStatus = !filters.status || s.status === filters.status;
      return matchQ && matchClass && matchStatus;
    });
  }

  function statusBadge(status) {
    const map = { actif: "badge-success", "transféré": "badge-warning", exclu: "badge-danger", "diplômé": "badge-primary" };
    return `<span class="badge ${map[status] || "badge-muted"}">${Utils.escapeHtml(status || "-")}</span>`;
  }

  function renderTable() {
    const wrap = document.getElementById("studentsTableWrap");
    if (!wrap) return;
    const students = getFiltered();
    const classes = Storage.all("classes");
    const canEdit = Permissions.canEdit("students");
    if (students.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucun élève trouvé.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th></th><th>Matricule</th><th>Nom complet</th><th>Classe</th><th>Naissance</th>
            <th>Responsable</th><th>Statut</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${students
            .map((s) => {
              const cls = classes.find((c) => c.id === s.classId);
              return `
              <tr>
                <td><img class="avatar" src="${s.photo || placeholderPhoto()}" alt=""></td>
                <td>${Utils.escapeHtml(s.matricule)}</td>
                <td>${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</td>
                <td>${cls ? Utils.escapeHtml(cls.name) : "-"}</td>
                <td>${Utils.formatDate(s.dob)}</td>
                <td>${Utils.escapeHtml(s.parent?.name || "-")}</td>
                <td>${statusBadge(s.status)}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-view="${s.id}">👁️</button>
                  ${canEdit ? `
                  <button class="btn btn-sm btn-secondary" data-edit="${s.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${s.id}">🗑️</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewStudent(b.dataset.view)));
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer définitivement cet élève ?", () => {
          Storage.remove("students", b.dataset.del);
          Utils.toast("Élève supprimé", "success");
          renderTable();
        });
      })
    );
  }

  function placeholderPhoto() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='100%' height='100%' fill='%23dbe3ff'/><text x='50%' y='55%' font-size='18' text-anchor='middle' fill='%232f6fed'>👤</text></svg>`
    );
  }

  function viewStudent(id) {
    const s = Storage.get("students", id);
    if (!s) return;
    const cls = Storage.get("classes", s.classId);
    Utils.openModal({
      title: `Profil de ${s.firstName} ${s.lastName}`,
      width: "700px",
      bodyHtml: `
        <div style="display:flex;gap:18px;margin-bottom:16px;">
          <img class="avatar-lg" src="${s.photo || placeholderPhoto()}">
          <div>
            <h3 style="margin:0 0 4px;">${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</h3>
            <p class="text-muted" style="margin:2px 0;">Matricule : <strong>${Utils.escapeHtml(s.matricule)}</strong></p>
            <p class="text-muted" style="margin:2px 0;">Classe : <strong>${cls ? Utils.escapeHtml(cls.name) : "-"}</strong> — ${statusBadge(s.status)}</p>
          </div>
        </div>
        <hr class="sep">
        <div class="form-grid">
          <div><strong>Date de naissance :</strong> ${Utils.formatDate(s.dob)}</div>
          <div><strong>Lieu de naissance :</strong> ${Utils.escapeHtml(s.pob || "-")}</div>
          <div><strong>Genre :</strong> ${Utils.escapeHtml(s.gender || "-")}</div>
          <div><strong>Année scolaire :</strong> ${Utils.escapeHtml(s.year || "-")}</div>
          <div class="full"><strong>Adresse :</strong> ${Utils.escapeHtml(s.address || "-")}</div>
        </div>
        <hr class="sep">
        <h4>Responsable légal / Parent</h4>
        <div class="form-grid">
          <div><strong>Nom :</strong> ${Utils.escapeHtml(s.parent?.name || "-")}</div>
          <div><strong>Téléphone :</strong> ${Utils.escapeHtml(s.parent?.phone || "-")}</div>
          <div><strong>Email :</strong> ${Utils.escapeHtml(s.parent?.email || "-")}</div>
          <div><strong>Adresse :</strong> ${Utils.escapeHtml(s.parent?.address || "-")}</div>
        </div>
        <hr class="sep">
        <h4>Historique des classes</h4>
        <table class="data-table">
          <thead><tr><th>Année</th><th>Classe</th></tr></thead>
          <tbody>
            ${(s.classHistory || []).map((h) => `<tr><td>${Utils.escapeHtml(h.year)}</td><td>${Utils.escapeHtml(h.className)}</td></tr>`).join("") || `<tr><td colspan="2">Aucun historique</td></tr>`}
          </tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeViewBtn">Fermer</button>`,
      onMount: (overlay) => overlay.querySelector("#closeViewBtn").addEventListener("click", Utils.closeModal),
    });
  }

  function openForm(id) {
    const editing = !!id;
    const s = editing ? Storage.get("students", id) : null;
    const classes = Storage.all("classes");

    Utils.openModal({
      title: editing ? "Modifier l'élève" : "Nouvel élève",
      width: "700px",
      bodyHtml: `
        <form id="studentForm">
          <div class="form-grid">
            <div class="field full" style="display:flex;align-items:center;gap:14px;">
              <img id="photoPreview" class="avatar-lg" src="${s?.photo || placeholderPhoto()}">
              <input type="file" id="photoInput" accept="image/*">
            </div>
            <div class="field"><label>Matricule *</label><input type="text" id="fMatricule" value="${Utils.escapeHtml(s?.matricule || genMatricule())}" required></div>
            <div class="field"><label>Statut</label>
              <select id="fStatus">
                ${["actif", "transféré", "exclu", "diplômé"].map((st) => `<option value="${st}" ${s?.status === st ? "selected" : ""}>${st}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label>Prénom *</label><input type="text" id="fFirstName" value="${Utils.escapeHtml(s?.firstName || "")}" required></div>
            <div class="field"><label>Nom *</label><input type="text" id="fLastName" value="${Utils.escapeHtml(s?.lastName || "")}" required></div>
            <div class="field"><label>Genre</label>
              <select id="fGender"><option value="M" ${s?.gender==="M"?"selected":""}>Masculin</option><option value="F" ${s?.gender==="F"?"selected":""}>Féminin</option></select>
            </div>
            <div class="field"><label>Date de naissance</label><input type="date" id="fDob" value="${s?.dob || ""}"></div>
            <div class="field"><label>Lieu de naissance</label><input type="text" id="fPob" value="${Utils.escapeHtml(s?.pob || "")}"></div>
            <div class="field full"><label>Adresse</label><input type="text" id="fAddress" value="${Utils.escapeHtml(s?.address || "")}"></div>
            <div class="field"><label>Classe</label>
              <select id="fClass"><option value="">—</option>${classes.map((c) => `<option value="${c.id}" ${s?.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Année scolaire</label><input type="text" id="fYear" value="${Utils.escapeHtml(s?.year || Storage.db().settings.currentYear)}"></div>
            <div class="field full"><h4 style="margin:8px 0 0;">Responsable légal / Parent</h4></div>
            <div class="field"><label>Nom du parent</label><input type="text" id="fParentName" value="${Utils.escapeHtml(s?.parent?.name || "")}"></div>
            <div class="field"><label>Téléphone parent</label><input type="text" id="fParentPhone" value="${Utils.escapeHtml(s?.parent?.phone || "")}"></div>
            <div class="field"><label>Email parent</label><input type="email" id="fParentEmail" value="${Utils.escapeHtml(s?.parent?.email || "")}"></div>
            <div class="field"><label>Adresse parent</label><input type="text" id="fParentAddress" value="${Utils.escapeHtml(s?.parent?.address || "")}"></div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveStudent">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        let photoData = s?.photo || "";
        overlay.querySelector("#photoInput").addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          photoData = await Utils.readFileAsDataURL(file);
          overlay.querySelector("#photoPreview").src = photoData;
        });
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveStudent").addEventListener("click", () => {
          const firstName = overlay.querySelector("#fFirstName").value.trim();
          const lastName = overlay.querySelector("#fLastName").value.trim();
          const matricule = overlay.querySelector("#fMatricule").value.trim();
          if (!firstName || !lastName || !matricule) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const dup = Storage.all("students").find((x) => x.matricule === matricule && x.id !== id);
          if (dup) {
            Utils.toast("Ce matricule est déjà utilisé", "error");
            return;
          }
          const classId = overlay.querySelector("#fClass").value;
          const cls = classes.find((c) => c.id === classId);
          const year = overlay.querySelector("#fYear").value.trim();

          const data = {
            matricule,
            firstName,
            lastName,
            photo: photoData,
            status: overlay.querySelector("#fStatus").value,
            gender: overlay.querySelector("#fGender").value,
            dob: overlay.querySelector("#fDob").value,
            pob: overlay.querySelector("#fPob").value.trim(),
            address: overlay.querySelector("#fAddress").value.trim(),
            classId,
            year,
            parent: {
              name: overlay.querySelector("#fParentName").value.trim(),
              phone: overlay.querySelector("#fParentPhone").value.trim(),
              email: overlay.querySelector("#fParentEmail").value.trim(),
              address: overlay.querySelector("#fParentAddress").value.trim(),
            },
          };

          if (editing) {
            const history = s.classHistory || [];
            if (s.classId !== classId && classId) {
              history.push({ year, classId, className: cls?.name || "" });
            }
            Storage.update("students", id, { ...data, classHistory: history });
            Utils.toast("Élève mis à jour", "success");
          } else {
            data.classHistory = classId ? [{ year, classId, className: cls?.name || "" }] : [];
            Storage.insert("students", data);
            Utils.toast("Élève créé", "success");
          }
          Utils.closeModal();
          renderTable();
        });
      },
    });
  }

  function exportCsv() {
    const students = getFiltered();
    const classes = Storage.all("classes");
    const csv = Utils.toCSV(students, [
      { label: "Matricule", get: (s) => s.matricule },
      { label: "Prenom", get: (s) => s.firstName },
      { label: "Nom", get: (s) => s.lastName },
      { label: "Genre", get: (s) => s.gender },
      { label: "DateNaissance", get: (s) => s.dob },
      { label: "LieuNaissance", get: (s) => s.pob },
      { label: "Adresse", get: (s) => s.address },
      { label: "Classe", get: (s) => classes.find((c) => c.id === s.classId)?.name || "" },
      { label: "Annee", get: (s) => s.year },
      { label: "Statut", get: (s) => s.status },
      { label: "ParentNom", get: (s) => s.parent?.name },
      { label: "ParentTelephone", get: (s) => s.parent?.phone },
      { label: "ParentEmail", get: (s) => s.parent?.email },
    ]);
    Utils.downloadFile("eleves.csv", csv);
    Utils.toast("Export CSV effectué", "success");
  }

  async function importCsv(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await Utils.readFileAsText(file);
    const { header, rows } = Utils.parseCSV(text);
    const idx = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    const classes = Storage.all("classes");
    let count = 0;
    rows.forEach((row) => {
      const matricule = row[idx("Matricule")] || genMatricule();
      if (Storage.all("students").find((s) => s.matricule === matricule)) return;
      const className = row[idx("Classe")] || "";
      const cls = classes.find((c) => c.name === className);
      Storage.insert("students", {
        matricule,
        firstName: row[idx("Prenom")] || "",
        lastName: row[idx("Nom")] || "",
        photo: "",
        gender: row[idx("Genre")] || "M",
        dob: row[idx("DateNaissance")] || "",
        pob: row[idx("LieuNaissance")] || "",
        address: row[idx("Adresse")] || "",
        classId: cls?.id || "",
        year: row[idx("Annee")] || Storage.db().settings.currentYear,
        status: row[idx("Statut")] || "actif",
        parent: {
          name: row[idx("ParentNom")] || "",
          phone: row[idx("ParentTelephone")] || "",
          email: row[idx("ParentEmail")] || "",
          address: "",
        },
        classHistory: cls ? [{ year: Storage.db().settings.currentYear, classId: cls.id, className: cls.name }] : [],
      });
      count++;
    });
    Utils.toast(`${count} élève(s) importé(s)`, "success");
    renderTable();
    e.target.value = "";
  }

  return { render, placeholderPhoto };
})();
