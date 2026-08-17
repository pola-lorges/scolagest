/**
 * Module Matières : création, coefficient, enseignant responsable,
 * niveau concerné, programme, association matière/classe.
 */
const Subjects = (() => {
  function render(container) {
    const canEdit = Permissions.canEdit("subjects");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddSubject">+ Nouvelle matière</button>` : ""}
        </div>
        <div class="table-wrap" id="subjectsTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddSubject")?.addEventListener("click", () => openForm());
    renderTable();
  }

  function renderTable() {
    const wrap = document.getElementById("subjectsTableWrap");
    if (!wrap) return;
    const subjects = Storage.all("subjects");
    const teachers = Storage.all("teachers");
    const classes = Storage.all("classes");
    const canEdit = Permissions.canEdit("subjects");
    if (subjects.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucune matière créée.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Matière</th><th>Coefficient</th><th>Niveau</th><th>Enseignant responsable</th><th>Classes associées</th><th>Actions</th></tr></thead>
        <tbody>
          ${subjects
            .map((s) => {
              const teacher = teachers.find((t) => t.id === s.teacherId);
              const assocClasses = classes.filter((c) => (c.subjectTeachers || []).some((st) => st.subjectId === s.id)).map((c) => c.name).join(", ");
              return `
              <tr>
                <td>${Utils.escapeHtml(s.name)}</td>
                <td>${s.coefficient}</td>
                <td>${Utils.escapeHtml(s.level || "-")}</td>
                <td>${teacher ? Utils.escapeHtml(teacher.firstName + " " + teacher.lastName) : "-"}</td>
                <td>${Utils.escapeHtml(assocClasses || "-")}</td>
                <td class="table-actions">
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
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer cette matière ?", () => {
          Storage.remove("subjects", b.dataset.del);
          Utils.toast("Matière supprimée", "success");
          renderTable();
        });
      })
    );
  }

  function openForm(id) {
    const editing = !!id;
    const s = editing ? Storage.get("subjects", id) : null;
    const teachers = Storage.all("teachers");

    Utils.openModal({
      title: editing ? "Modifier la matière" : "Nouvelle matière",
      bodyHtml: `
        <form id="subjectForm">
          <div class="form-grid">
            <div class="field full"><label>Nom de la matière *</label><input type="text" id="fName" value="${Utils.escapeHtml(s?.name || "")}" required></div>
            <div class="field"><label>Coefficient *</label><input type="number" min="1" id="fCoef" value="${s?.coefficient || 1}" required></div>
            <div class="field"><label>Niveau concerné</label><input type="text" id="fLevel" value="${Utils.escapeHtml(s?.level || "")}" placeholder="ex: 6e"></div>
            <div class="field full"><label>Enseignant responsable</label>
              <select id="fTeacher"><option value="">—</option>${teachers.map((t) => `<option value="${t.id}" ${s?.teacherId === t.id ? "selected" : ""}>${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field full"><label>Programme</label><textarea id="fProgram" rows="3">${Utils.escapeHtml(s?.program || "")}</textarea></div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveSubject">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveSubject").addEventListener("click", () => {
          const name = overlay.querySelector("#fName").value.trim();
          const coefficient = Number(overlay.querySelector("#fCoef").value);
          if (!name || !coefficient) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const data = {
            name,
            coefficient,
            level: overlay.querySelector("#fLevel").value.trim(),
            teacherId: overlay.querySelector("#fTeacher").value,
            program: overlay.querySelector("#fProgram").value.trim(),
          };
          if (editing) {
            Storage.update("subjects", id, data);
            Utils.toast("Matière mise à jour", "success");
          } else {
            Storage.insert("subjects", data);
            Utils.toast("Matière créée", "success");
          }
          Utils.closeModal();
          renderTable();
        });
      },
    });
  }

  return { render };
})();
