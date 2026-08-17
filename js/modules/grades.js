/**
 * Module Notes : saisie des notes (devoirs, examens), calcul automatique
 * des moyennes pondérées par coefficient, classement, traçabilité des modifications.
 */
const Grades = (() => {
  const TERMS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
  let state = { classId: "", term: TERMS[0], subjectId: "" };

  function render(container) {
    const classes = Storage.all("classes");
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("grades");
    if (scoped) {
      const own = Storage.get("students", scoped[0]);
      if (own) state.classId = own.classId;
    } else if (!state.classId && classes[0]) {
      state.classId = classes[0].id;
    }
    const subjects = Storage.all("subjects");

    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="gClass" ${scoped ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}" ${state.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select>
          <select id="gTerm">${TERMS.map((t) => `<option value="${t}" ${state.term === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          <select id="gSubject"><option value="">Toutes les matières</option>${subjects.map((s) => `<option value="${s.id}" ${state.subjectId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("")}</select>
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddGrade">+ Saisir une note</button>` : ""}
        </div>
        <div id="gradesArea"></div>
      </div>
    `;
    container.querySelector("#gClass").addEventListener("change", (e) => { state.classId = e.target.value; renderArea(); });
    container.querySelector("#gTerm").addEventListener("change", (e) => { state.term = e.target.value; renderArea(); });
    container.querySelector("#gSubject").addEventListener("change", (e) => { state.subjectId = e.target.value; renderArea(); });
    container.querySelector("#btnAddGrade")?.addEventListener("click", () => openForm());
    renderArea();
  }

  function studentAverageForSubject(studentId, subjectId, term) {
    const grades = Storage.all("grades").filter((g) => g.studentId === studentId && g.subjectId === subjectId && g.term === term);
    if (grades.length === 0) return null;
    const sum = grades.reduce((acc, g) => acc + (g.value / g.max) * 20, 0);
    return sum / grades.length;
  }

  function studentGeneralAverage(studentId, classId, term) {
    const classObj = Storage.get("classes", classId);
    const subjectIds = (classObj?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((s) => subjectIds.includes(s.id));
    let totalPoints = 0, totalCoef = 0;
    subjects.forEach((s) => {
      const avg = studentAverageForSubject(studentId, s.id, term);
      if (avg !== null) {
        totalPoints += avg * s.coefficient;
        totalCoef += s.coefficient;
      }
    });
    return totalCoef ? totalPoints / totalCoef : null;
  }

  function classRanking(classId, term) {
    const students = Storage.all("students").filter((s) => s.classId === classId);
    const ranked = students
      .map((s) => ({ student: s, avg: studentGeneralAverage(s.id, classId, term) }))
      .filter((r) => r.avg !== null)
      .sort((a, b) => b.avg - a.avg);
    return ranked;
  }

  function renderArea() {
    const area = document.getElementById("gradesArea");
    if (!area) return;
    if (!state.classId) {
      area.innerHTML = `<div class="empty-state">Créez d'abord une classe.</div>`;
      return;
    }
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("grades");
    const students = Storage.all("students").filter((s) => s.classId === state.classId && (!scoped || scoped.includes(s.id)));
    const subjects = Storage.all("subjects");
    const grades = Storage.all("grades").filter(
      (g) => g.classId === state.classId && g.term === state.term && (!state.subjectId || g.subjectId === state.subjectId) && (!scoped || scoped.includes(g.studentId))
    );
    const ranking = classRanking(state.classId, state.term).filter((r) => !scoped || scoped.includes(r.student.id));

    area.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Élève</th><th>Matière</th><th>Type</th><th>Note</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${grades
              .map((g) => {
                const st = students.find((s) => s.id === g.studentId) || Storage.get("students", g.studentId);
                const subj = subjects.find((s) => s.id === g.subjectId);
                return `
                <tr>
                  <td>${st ? Utils.escapeHtml(st.firstName + " " + st.lastName) : "-"}</td>
                  <td>${Utils.escapeHtml(subj?.name || "-")}</td>
                  <td>${Utils.escapeHtml(g.type)}</td>
                  <td><strong>${g.value}</strong>/${g.max}</td>
                  <td>${Utils.formatDate(g.date)}</td>
                  <td class="table-actions">
                    ${canEdit ? `
                    <button class="btn btn-sm btn-secondary" data-edit="${g.id}">✏️</button>
                    <button class="btn btn-sm btn-danger" data-del="${g.id}">🗑️</button>` : ""}
                    ${g.history?.length ? `<button class="btn btn-sm btn-secondary" data-hist="${g.id}">🕓</button>` : ""}
                  </td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="6">Aucune note saisie pour ce filtre.</td></tr>`}
          </tbody>
        </table>
      </div>
      <hr class="sep">
      <h3>Classement et moyennes générales — ${Utils.escapeHtml(state.term)}</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Rang</th><th>Élève</th><th>Moyenne générale</th></tr></thead>
          <tbody>
            ${ranking
              .map((r, i) => `<tr><td>${i + 1}</td><td>${Utils.escapeHtml(r.student.firstName + " " + r.student.lastName)}</td><td><strong>${r.avg.toFixed(2)}</strong>/20</td></tr>`)
              .join("") || `<tr><td colspan="3">Aucune moyenne disponible.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    area.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    area.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer cette note ?", () => {
          Storage.remove("grades", b.dataset.del);
          Utils.toast("Note supprimée", "success");
          renderArea();
        });
      })
    );
    area.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", () => showHistory(b.dataset.hist)));
  }

  function showHistory(id) {
    const g = Storage.get("grades", id);
    Utils.openModal({
      title: "Historique des modifications",
      bodyHtml: `
        <table class="data-table">
          <thead><tr><th>Date</th><th>Ancienne valeur</th><th>Nouvelle valeur</th></tr></thead>
          <tbody>${(g.history || []).map((h) => `<tr><td>${Utils.formatDate(h.date)}</td><td>${h.oldValue}</td><td>${h.newValue}</td></tr>`).join("")}</tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeBtn">Fermer</button>`,
      onMount: (overlay) => overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal),
    });
  }

  function openForm(id) {
    const editing = !!id;
    const g = editing ? Storage.get("grades", id) : null;
    const students = Storage.all("students").filter((s) => s.classId === state.classId);
    const subjects = Storage.all("subjects");

    Utils.openModal({
      title: editing ? "Modifier la note" : "Saisir une note",
      bodyHtml: `
        <form id="gradeForm">
          <div class="form-grid">
            <div class="field full"><label>Élève *</label>
              <select id="fStudent" ${editing ? "disabled" : ""}>${students.map((s) => `<option value="${s.id}" ${g?.studentId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Matière *</label>
              <select id="fSubject">${subjects.map((s) => `<option value="${s.id}" ${g?.subjectId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Trimestre</label>
              <select id="fTerm">${TERMS.map((t) => `<option value="${t}" ${(g?.term || state.term) === t ? "selected" : ""}>${t}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Type *</label><input type="text" id="fType" value="${Utils.escapeHtml(g?.type || "Devoir")}" placeholder="Devoir 1, Examen..." required></div>
            <div class="field"><label>Note *</label><input type="number" step="0.25" min="0" id="fValue" value="${g?.value ?? ""}" required></div>
            <div class="field"><label>Barème</label><input type="number" id="fMax" value="${g?.max || 20}"></div>
            <div class="field"><label>Date</label><input type="date" id="fDate" value="${g?.date || Utils.today()}"></div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveGrade">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveGrade").addEventListener("click", () => {
          const value = Number(overlay.querySelector("#fValue").value);
          const max = Number(overlay.querySelector("#fMax").value) || 20;
          const type = overlay.querySelector("#fType").value.trim();
          if (isNaN(value) || !type) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const data = {
            subjectId: overlay.querySelector("#fSubject").value,
            classId: state.classId,
            term: overlay.querySelector("#fTerm").value,
            type,
            value,
            max,
            date: overlay.querySelector("#fDate").value,
          };
          if (editing) {
            const history = g.history || [];
            if (g.value !== value) {
              history.push({ date: Utils.today(), oldValue: g.value, newValue: value });
            }
            Storage.update("grades", id, { ...data, history });
            Utils.toast("Note mise à jour (traçabilité enregistrée)", "success");
          } else {
            data.studentId = overlay.querySelector("#fStudent").value;
            data.history = [];
            Storage.insert("grades", data);
            Utils.toast("Note enregistrée", "success");
          }
          Utils.closeModal();
          renderArea();
        });
      },
    });
  }

  return { render, studentAverageForSubject, studentGeneralAverage, classRanking, TERMS };
})();
