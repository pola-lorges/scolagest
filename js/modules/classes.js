/**
 * Module Classes : création, affectation élèves/enseignants, niveaux,
 * capacité, année scolaire, historique, liste des élèves par classe.
 */
const Classes = (() => {
  function render(container) {
    const canEdit = Permissions.canEdit("classes");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddClass">+ Nouvelle classe</button>` : ""}
        </div>
        <div class="table-wrap" id="classesTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddClass")?.addEventListener("click", () => openForm());
    renderTable();
  }

  function renderTable() {
    const wrap = document.getElementById("classesTableWrap");
    if (!wrap) return;
    const classes = Storage.all("classes");
    const students = Storage.all("students");
    const teachers = Storage.all("teachers");
    const canEdit = Permissions.canEdit("classes");
    if (classes.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucune classe créée.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>Niveau</th><th>Effectif</th><th>Capacité</th><th>Prof. principal</th><th>Année</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${classes
            .map((c) => {
              const effectif = students.filter((s) => s.classId === c.id).length;
              const main = teachers.find((t) => t.id === c.mainTeacherId);
              const over = effectif > c.capacity;
              return `
              <tr>
                <td>${Utils.escapeHtml(c.name)}</td>
                <td>${Utils.escapeHtml(c.level)}</td>
                <td>${over ? `<span class="badge badge-danger">${effectif}</span>` : effectif}</td>
                <td>${c.capacity}</td>
                <td>${main ? Utils.escapeHtml(main.firstName + " " + main.lastName) : "-"}</td>
                <td>${Utils.escapeHtml(c.year)}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-view="${c.id}">👁️ Élèves</button>
                  ${canEdit ? `
                  <button class="btn btn-sm btn-secondary" data-edit="${c.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${c.id}">🗑️</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewClass(b.dataset.view)));
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer cette classe ? Les élèves resteront sans classe.", () => {
          Storage.remove("classes", b.dataset.del);
          Utils.toast("Classe supprimée", "success");
          renderTable();
        });
      })
    );
  }

  function viewClass(id) {
    const c = Storage.get("classes", id);
    const students = Storage.all("students").filter((s) => s.classId === id);
    const teachers = Storage.all("teachers");
    const subjects = Storage.all("subjects");
    Utils.openModal({
      title: `Classe ${c.name}`,
      width: "700px",
      bodyHtml: `
        <h4>Enseignants par matière</h4>
        <table class="data-table">
          <thead><tr><th>Matière</th><th>Enseignant</th></tr></thead>
          <tbody>
            ${(c.subjectTeachers || [])
              .map((st) => {
                const subj = subjects.find((s) => s.id === st.subjectId);
                const t = teachers.find((x) => x.id === st.teacherId);
                return `<tr><td>${Utils.escapeHtml(subj?.name || "-")}</td><td>${t ? Utils.escapeHtml(t.firstName + " " + t.lastName) : "-"}</td></tr>`;
              })
              .join("") || `<tr><td colspan="2">Aucune matière affectée</td></tr>`}
          </tbody>
        </table>
        <hr class="sep">
        <h4>Liste des élèves (${students.length})</h4>
        <table class="data-table">
          <thead><tr><th>Matricule</th><th>Nom complet</th><th>Statut</th></tr></thead>
          <tbody>
            ${students.map((s) => `<tr><td>${Utils.escapeHtml(s.matricule)}</td><td>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</td><td>${Utils.escapeHtml(s.status)}</td></tr>`).join("") || `<tr><td colspan="3">Aucun élève</td></tr>`}
          </tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeBtn">Fermer</button>`,
      onMount: (overlay) => overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal),
    });
  }

  function openForm(id) {
    const editing = !!id;
    const c = editing ? Storage.get("classes", id) : null;
    const teachers = Storage.all("teachers");
    const subjects = Storage.all("subjects");
    const existingST = c?.subjectTeachers || [];

    Utils.openModal({
      title: editing ? "Modifier la classe" : "Nouvelle classe",
      width: "700px",
      bodyHtml: `
        <form id="classForm">
          <div class="form-grid">
            <div class="field"><label>Nom de la classe *</label><input type="text" id="fName" value="${Utils.escapeHtml(c?.name || "")}" required></div>
            <div class="field"><label>Niveau *</label><input type="text" id="fLevel" value="${Utils.escapeHtml(c?.level || "")}" placeholder="ex: 6e" required></div>
            <div class="field"><label>Capacité maximale</label><input type="number" id="fCapacity" value="${c?.capacity || 40}"></div>
            <div class="field"><label>Année scolaire</label><input type="text" id="fYear" value="${Utils.escapeHtml(c?.year || Storage.db().settings.currentYear)}"></div>
            <div class="field full"><label>Professeur principal</label>
              <select id="fMainTeacher"><option value="">—</option>${teachers.map((t) => `<option value="${t.id}" ${c?.mainTeacherId === t.id ? "selected" : ""}>${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field full"><h4 style="margin:8px 0;">Enseignants par matière</h4>
              <div id="subjectTeacherRows"></div>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveClass">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        const rowsDiv = overlay.querySelector("#subjectTeacherRows");
        rowsDiv.innerHTML = subjects
          .map((subj) => {
            const found = existingST.find((st) => st.subjectId === subj.id);
            return `
            <div class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <label style="min-width:160px;margin:0;">${Utils.escapeHtml(subj.name)}</label>
              <select data-subject="${subj.id}" style="flex:1;">
                <option value="">— Aucun —</option>
                ${teachers.map((t) => `<option value="${t.id}" ${found?.teacherId === t.id ? "selected" : ""}>${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}
              </select>
            </div>`;
          })
          .join("");

        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveClass").addEventListener("click", () => {
          const name = overlay.querySelector("#fName").value.trim();
          const level = overlay.querySelector("#fLevel").value.trim();
          if (!name || !level) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const subjectTeachers = Array.from(rowsDiv.querySelectorAll("select[data-subject]"))
            .map((sel) => ({ subjectId: sel.dataset.subject, teacherId: sel.value }))
            .filter((st) => st.teacherId);

          const data = {
            name,
            level,
            capacity: Number(overlay.querySelector("#fCapacity").value) || 40,
            year: overlay.querySelector("#fYear").value.trim(),
            mainTeacherId: overlay.querySelector("#fMainTeacher").value,
            subjectTeachers,
          };
          if (editing) {
            Storage.update("classes", id, data);
            Utils.toast("Classe mise à jour", "success");
          } else {
            Storage.insert("classes", data);
            Utils.toast("Classe créée", "success");
          }
          Utils.closeModal();
          renderTable();
        });
      },
    });
  }

  return { render };
})();
