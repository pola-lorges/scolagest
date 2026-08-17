/**
 * Module Enseignants : profil, matières enseignées, classes affectées,
 * emploi du temps, absences/retards, notes saisies, historique.
 */
const Teachers = (() => {
  function genMatricule() {
    const count = Storage.all("teachers").length + 1;
    return "ENS-" + Utils.pad(count, 3);
  }

  function render(container) {
    const canEdit = Permissions.canEdit("teachers");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input type="text" id="teaSearch" placeholder="🔍 Rechercher un enseignant...">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddTeacher">+ Nouvel enseignant</button>` : ""}
        </div>
        <div class="table-wrap" id="teachersTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddTeacher")?.addEventListener("click", () => openForm());
    container.querySelector("#teaSearch").addEventListener("input", (e) => renderTable(e.target.value));
    renderTable("");
  }

  function renderTable(q = "") {
    const wrap = document.getElementById("teachersTableWrap");
    if (!wrap) return;
    q = q.trim().toLowerCase();
    const subjects = Storage.all("subjects");
    const classes = Storage.all("classes");
    const canEdit = Permissions.canEdit("teachers");
    const teachers = Storage.all("teachers").filter(
      (t) => !q || `${t.firstName} ${t.lastName} ${t.matricule}`.toLowerCase().includes(q)
    );
    if (teachers.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucun enseignant trouvé.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th></th><th>Matricule</th><th>Nom complet</th><th>Matières</th><th>Classes</th><th>Téléphone</th><th>Actions</th></tr></thead>
        <tbody>
          ${teachers
            .map((t) => {
              const subjNames = (t.subjects || []).map((sid) => subjects.find((s) => s.id === sid)?.name).filter(Boolean).join(", ");
              const clsNames = classes.filter((c) => c.mainTeacherId === t.id || (c.subjectTeachers || []).some((st) => st.teacherId === t.id)).map((c) => c.name).join(", ");
              return `
              <tr>
                <td><img class="avatar" src="${t.photo || Students.placeholderPhoto()}"></td>
                <td>${Utils.escapeHtml(t.matricule)}</td>
                <td>${Utils.escapeHtml(t.firstName)} ${Utils.escapeHtml(t.lastName)}</td>
                <td>${Utils.escapeHtml(subjNames || "-")}</td>
                <td>${Utils.escapeHtml(clsNames || "-")}</td>
                <td>${Utils.escapeHtml(t.phone || "-")}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-view="${t.id}">👁️</button>
                  ${canEdit ? `
                  <button class="btn btn-sm btn-secondary" data-edit="${t.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${t.id}">🗑️</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewTeacher(b.dataset.view)));
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer cet enseignant ?", () => {
          Storage.remove("teachers", b.dataset.del);
          Utils.toast("Enseignant supprimé", "success");
          renderTable();
        });
      })
    );
  }

  function viewTeacher(id) {
    const t = Storage.get("teachers", id);
    const subjects = Storage.all("subjects");
    const classes = Storage.all("classes");
    const timetable = Storage.all("timetable").filter((tt) => tt.teacherId === id);
    const attendance = Storage.all("attendance").filter((a) => a.personId === id && a.type === "teacher");
    Utils.openModal({
      title: `${t.firstName} ${t.lastName}`,
      width: "700px",
      bodyHtml: `
        <div style="display:flex;gap:14px;margin-bottom:14px;">
          <img class="avatar-lg" src="${t.photo || Students.placeholderPhoto()}">
          <div>
            <p class="text-muted" style="margin:2px 0;">Matricule: <strong>${Utils.escapeHtml(t.matricule)}</strong></p>
            <p class="text-muted" style="margin:2px 0;">Tél: ${Utils.escapeHtml(t.phone || "-")} — Email: ${Utils.escapeHtml(t.email || "-")}</p>
          </div>
        </div>
        <h4>Matières enseignées</h4>
        <p>${(t.subjects || []).map((sid) => subjects.find((s) => s.id === sid)?.name).filter(Boolean).join(", ") || "-"}</p>
        <h4>Classes affectées</h4>
        <p>${classes.filter((c) => c.mainTeacherId === t.id || (c.subjectTeachers || []).some((st) => st.teacherId === t.id)).map((c) => c.name).join(", ") || "-"}</p>
        <h4>Emploi du temps</h4>
        <table class="data-table">
          <thead><tr><th>Jour</th><th>Heure</th><th>Classe</th><th>Matière</th></tr></thead>
          <tbody>${timetable.map((tt) => `<tr><td>${tt.day}</td><td>${tt.start}-${tt.end}</td><td>${classes.find((c) => c.id === tt.classId)?.name || "-"}</td><td>${subjects.find((s) => s.id === tt.subjectId)?.name || "-"}</td></tr>`).join("") || `<tr><td colspan="4">Aucun cours</td></tr>`}</tbody>
        </table>
        <h4>Absences / Retards</h4>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Statut</th><th>Motif</th></tr></thead>
          <tbody>${attendance.map((a) => `<tr><td>${Utils.formatDate(a.date)}</td><td>${a.status}</td><td>${Utils.escapeHtml(a.motif || "-")}</td></tr>`).join("") || `<tr><td colspan="3">Aucune absence enregistrée</td></tr>`}</tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeBtn">Fermer</button>`,
      onMount: (overlay) => overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal),
    });
  }

  function openForm(id) {
    const editing = !!id;
    const t = editing ? Storage.get("teachers", id) : null;
    const subjects = Storage.all("subjects");

    Utils.openModal({
      title: editing ? "Modifier l'enseignant" : "Nouvel enseignant",
      width: "650px",
      bodyHtml: `
        <form id="teacherForm">
          <div class="form-grid">
            <div class="field full" style="display:flex;align-items:center;gap:14px;">
              <img id="photoPreview" class="avatar-lg" src="${t?.photo || Students.placeholderPhoto()}">
              <input type="file" id="photoInput" accept="image/*">
            </div>
            <div class="field"><label>Matricule *</label><input type="text" id="fMatricule" value="${Utils.escapeHtml(t?.matricule || genMatricule())}" required></div>
            <div class="field"><label>Téléphone</label><input type="text" id="fPhone" value="${Utils.escapeHtml(t?.phone || "")}"></div>
            <div class="field"><label>Prénom *</label><input type="text" id="fFirstName" value="${Utils.escapeHtml(t?.firstName || "")}" required></div>
            <div class="field"><label>Nom *</label><input type="text" id="fLastName" value="${Utils.escapeHtml(t?.lastName || "")}" required></div>
            <div class="field"><label>Email</label><input type="email" id="fEmail" value="${Utils.escapeHtml(t?.email || "")}"></div>
            <div class="field"><label>Adresse</label><input type="text" id="fAddress" value="${Utils.escapeHtml(t?.address || "")}"></div>
            <div class="field full"><label>Matières enseignées</label>
              <select id="fSubjects" multiple size="5">
                ${subjects.map((s) => `<option value="${s.id}" ${(t?.subjects || []).includes(s.id) ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("")}
              </select>
              <small class="text-muted">Maintenez Ctrl (ou Cmd) pour sélectionner plusieurs matières.</small>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveTeacher">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        let photoData = t?.photo || "";
        overlay.querySelector("#photoInput").addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          photoData = await Utils.readFileAsDataURL(file);
          overlay.querySelector("#photoPreview").src = photoData;
        });
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveTeacher").addEventListener("click", () => {
          const firstName = overlay.querySelector("#fFirstName").value.trim();
          const lastName = overlay.querySelector("#fLastName").value.trim();
          const matricule = overlay.querySelector("#fMatricule").value.trim();
          if (!firstName || !lastName || !matricule) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const dup = Storage.all("teachers").find((x) => x.matricule === matricule && x.id !== id);
          if (dup) {
            Utils.toast("Ce matricule est déjà utilisé", "error");
            return;
          }
          const selectedSubjects = Array.from(overlay.querySelector("#fSubjects").selectedOptions).map((o) => o.value);
          const data = {
            matricule,
            firstName,
            lastName,
            photo: photoData,
            phone: overlay.querySelector("#fPhone").value.trim(),
            email: overlay.querySelector("#fEmail").value.trim(),
            address: overlay.querySelector("#fAddress").value.trim(),
            subjects: selectedSubjects,
          };
          if (editing) {
            Storage.update("teachers", id, data);
            Utils.toast("Enseignant mis à jour", "success");
          } else {
            Storage.insert("teachers", data);
            Utils.toast("Enseignant créé", "success");
          }
          Utils.closeModal();
          renderTable();
        });
      },
    });
  }

  return { render };
})();
