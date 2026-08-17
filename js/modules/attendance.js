/**
 * Module Absences & Retards : pour élèves et enseignants — présent, absent,
 * absence justifiée/non justifiée, retard, motif, justificatif, notification simulée aux parents.
 */
const Attendance = (() => {
  let state = { type: "student", classId: "", date: Utils.today() };

  function render(container) {
    const classes = Storage.all("classes");
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("attendance");
    if (scoped) {
      const own = Storage.get("students", scoped[0]);
      if (own) state.classId = own.classId;
      state.type = "student";
    } else if (!state.classId && classes[0]) {
      state.classId = classes[0].id;
    }
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="aType" ${scoped ? "disabled" : ""}>
            <option value="student" ${state.type === "student" ? "selected" : ""}>Élèves</option>
            <option value="teacher" ${state.type === "teacher" ? "selected" : ""}>Enseignants</option>
          </select>
          <select id="aClass" ${state.type === "teacher" ? "style=display:none" : ""} ${scoped ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}" ${state.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("")}</select>
          <input type="date" id="aDate" value="${state.date}">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnMarkAll">✅ Marquer tous présents</button>` : ""}
        </div>
        <div id="attendanceArea"></div>
      </div>
      <div class="panel">
        <h3>Historique récent</h3>
        <div id="attendanceHistory"></div>
      </div>
    `;
    container.querySelector("#aType").addEventListener("change", (e) => { state.type = e.target.value; render(container); });
    container.querySelector("#aClass").addEventListener("change", (e) => { state.classId = e.target.value; renderArea(); });
    container.querySelector("#aDate").addEventListener("change", (e) => { state.date = e.target.value; renderArea(); });
    container.querySelector("#btnMarkAll")?.addEventListener("click", markAllPresent);
    renderArea();
    renderHistory();
  }

  function getPeople() {
    const scoped = Auth.scopedStudentIds();
    if (state.type === "student") {
      return Storage.all("students")
        .filter((s) => s.classId === state.classId && (!scoped || scoped.includes(s.id)))
        .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }));
    }
    return Storage.all("teachers").map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}` }));
  }

  function getRecord(personId) {
    return Storage.all("attendance").find((a) => a.personId === personId && a.date === state.date && a.type === state.type);
  }

  function renderArea() {
    const area = document.getElementById("attendanceArea");
    if (!area) return;
    const canEdit = Permissions.canEdit("attendance");
    const people = getPeople();
    if (people.length === 0) {
      area.innerHTML = `<div class="empty-state">Aucune personne à afficher.</div>`;
      return;
    }
    area.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Statut</th><th>Motif</th><th>Justificatif</th>${canEdit ? "<th>Action</th>" : ""}</tr></thead>
        <tbody>
          ${people
            .map((p) => {
              const rec = getRecord(p.id);
              return `
              <tr>
                <td>${Utils.escapeHtml(p.name)}</td>
                <td>${statusBadge(rec?.status)}</td>
                <td>${Utils.escapeHtml(rec?.motif || "-")}</td>
                <td>${rec?.justified ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-muted">Non</span>'}</td>
                ${canEdit ? `<td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-mark="${p.id}">Marquer</button>
                </td>` : ""}
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    area.querySelectorAll("[data-mark]").forEach((b) => b.addEventListener("click", () => openMarkForm(b.dataset.mark)));
  }

  function statusBadge(status) {
    const map = { "Présent": "badge-success", "Absent": "badge-danger", "Retard": "badge-warning" };
    return `<span class="badge ${map[status] || "badge-muted"}">${status || "Non renseigné"}</span>`;
  }

  function openMarkForm(personId) {
    const person = state.type === "student" ? Storage.get("students", personId) : Storage.get("teachers", personId);
    const rec = getRecord(personId);
    Utils.openModal({
      title: `Présence — ${person.firstName} ${person.lastName}`,
      bodyHtml: `
        <form id="attForm">
          <div class="form-grid">
            <div class="field full"><label>Statut</label>
              <select id="fStatus">
                ${["Présent", "Absent", "Retard"].map((s) => `<option value="${s}" ${rec?.status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label>Justifiée ?</label>
              <select id="fJustified"><option value="0" ${!rec?.justified ? "selected" : ""}>Non</option><option value="1" ${rec?.justified ? "selected" : ""}>Oui</option></select>
            </div>
            <div class="field"><label>Motif</label><input type="text" id="fMotif" value="${Utils.escapeHtml(rec?.motif || "")}"></div>
            <div class="field full"><label>Justificatif (fichier)</label><input type="file" id="fJustifFile"></div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveAtt">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        let justifFile = rec?.justifFile || "";
        overlay.querySelector("#fJustifFile").addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (file) justifFile = await Utils.readFileAsDataURL(file);
        });
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveAtt").addEventListener("click", () => {
          const status = overlay.querySelector("#fStatus").value;
          const data = {
            type: state.type,
            personId,
            date: state.date,
            status,
            justified: overlay.querySelector("#fJustified").value === "1",
            motif: overlay.querySelector("#fMotif").value.trim(),
            justifFile,
          };
          if (rec) Storage.update("attendance", rec.id, data);
          else Storage.insert("attendance", data);

          if (state.type === "student" && status === "Absent") {
            notifyParent(person);
          }
          Utils.toast("Présence enregistrée", "success");
          Utils.closeModal();
          renderArea();
          renderHistory();
        });
      },
    });
  }

  function notifyParent(student) {
    const parentName = student.parent?.name || "le parent";
    Utils.toast(`📩 Notification envoyée à ${parentName} : absence de ${student.firstName} le ${Utils.formatDate(state.date)}`, "info");
  }

  function markAllPresent() {
    const people = getPeople();
    people.forEach((p) => {
      const rec = getRecord(p.id);
      const data = { type: state.type, personId: p.id, date: state.date, status: "Présent", justified: false, motif: "" };
      if (rec) Storage.update("attendance", rec.id, data);
      else Storage.insert("attendance", data);
    });
    Utils.toast("Tous marqués présents", "success");
    renderArea();
    renderHistory();
  }

  function renderHistory() {
    const hist = document.getElementById("attendanceHistory");
    if (!hist) return;
    const scoped = Auth.scopedStudentIds();
    const students = Storage.all("students");
    const teachers = Storage.all("teachers");
    const records = [...Storage.all("attendance")]
      .filter((r) => !scoped || (r.type === "student" && scoped.includes(r.personId)))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 30);
    hist.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Type</th><th>Nom</th><th>Statut</th><th>Justifiée</th></tr></thead>
        <tbody>
          ${records
            .map((r) => {
              const person = r.type === "student" ? students.find((s) => s.id === r.personId) : teachers.find((t) => t.id === r.personId);
              return `<tr><td>${Utils.formatDate(r.date)}</td><td>${r.type === "student" ? "Élève" : "Enseignant"}</td><td>${person ? Utils.escapeHtml(person.firstName + " " + person.lastName) : "-"}</td><td>${statusBadge(r.status)}</td><td>${r.justified ? "Oui" : "Non"}</td></tr>`;
            })
            .join("") || `<tr><td colspan="5">Aucun enregistrement</td></tr>`}
        </tbody>
      </table>
    `;
  }

  return { render };
})();
