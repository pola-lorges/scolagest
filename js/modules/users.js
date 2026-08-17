/**
 * Module Utilisateurs & droits : gestion des comptes et rôles
 * (ADMIN, DIRECTEUR, ADMINISTRATION, ENSEIGNANT, PARENT, ELEVE).
 */
const Users = (() => {
  function render(container) {
    const canEdit = Permissions.canEdit("users");
    container.innerHTML = `
      <div class="panel">
        <p class="text-muted">Chaque rôle dispose de droits différents sur les modules de l'application (voir tableau ci-dessous).</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Module</th>${ROLES.map((r) => `<th>${ROLE_LABELS[r]}</th>`).join("")}</tr></thead>
            <tbody>
              ${Object.keys(PERMISSIONS)
                .map(
                  (mod) => `<tr><td>${moduleLabel(mod)}</td>${ROLES.map((r) => `<td>${levelIcon(Permissions.levelForRole(mod, r))}</td>`).join("")}</tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="toolbar">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddUser">+ Nouveau compte</button>` : ""}
        </div>
        <div class="table-wrap" id="usersTableWrap"></div>
      </div>
    `;
    if (canEdit) container.querySelector("#btnAddUser").addEventListener("click", () => openForm());
    renderTable(canEdit);
  }

  function moduleLabel(mod) {
    const map = {
      dashboard: "Tableau de bord", students: "Élèves", classes: "Classes", teachers: "Enseignants",
      subjects: "Matières", grades: "Notes", bulletins: "Bulletins", attendance: "Absences",
      timetable: "Emploi du temps", payments: "Paiements", parents: "Portail parents",
      documents: "Documents", users: "Utilisateurs", settings: "Paramètres",
    };
    return map[mod] || mod;
  }

  function levelIcon(level) {
    if (level === "full") return '<span class="badge badge-success">✅</span>';
    if (level === "view") return '<span class="badge badge-warning">👁️</span>';
    return '<span class="badge badge-muted">❌</span>';
  }

  function renderTable(canEdit) {
    const wrap = document.getElementById("usersTableWrap");
    if (!wrap) return;
    const users = Storage.all("users");
    const teachers = Storage.all("teachers");
    const students = Storage.all("students");
    if (users.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucun compte utilisateur.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Utilisateur</th><th>Nom complet</th><th>Rôle</th><th>Lié à</th><th>Statut</th>${canEdit ? "<th>Actions</th>" : ""}</tr></thead>
        <tbody>
          ${users
            .map((u) => {
              let linked = "-";
              if (u.role === "ENSEIGNANT" && u.teacherId) {
                const t = teachers.find((x) => x.id === u.teacherId);
                linked = t ? Utils.escapeHtml(t.firstName + " " + t.lastName) : "-";
              } else if (u.role === "ELEVE" && u.studentId) {
                const s = students.find((x) => x.id === u.studentId);
                linked = s ? Utils.escapeHtml(s.firstName + " " + s.lastName) : "-";
              } else if (u.role === "PARENT" && u.studentIds?.length) {
                linked = u.studentIds.map((id) => students.find((s) => s.id === id)).filter(Boolean).map((s) => `${s.firstName} ${s.lastName}`).join(", ");
              }
              return `
              <tr>
                <td>${Utils.escapeHtml(u.username)}</td>
                <td>${Utils.escapeHtml(u.fullName || "-")}</td>
                <td><span class="badge badge-primary">${ROLE_LABELS[u.role] || u.role}</span></td>
                <td>${linked}</td>
                <td>${u.active !== false ? '<span class="badge badge-success">Actif</span>' : '<span class="badge badge-danger">Désactivé</span>'}</td>
                ${canEdit ? `<td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-edit="${u.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${u.id}">🗑️</button>
                </td>` : ""}
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    if (!canEdit) return;
    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        const current = Auth.getCurrentUser();
        if (b.dataset.del === current.id) {
          Utils.toast("Vous ne pouvez pas supprimer votre propre compte", "error");
          return;
        }
        Utils.confirmDialog("Supprimer ce compte utilisateur ?", () => {
          Storage.remove("users", b.dataset.del);
          Utils.toast("Compte supprimé", "success");
          renderTable(canEdit);
        });
      })
    );
  }

  function openForm(id) {
    const editing = !!id;
    const u = editing ? Storage.get("users", id) : null;
    const teachers = Storage.all("teachers");
    const students = Storage.all("students");

    Utils.openModal({
      title: editing ? "Modifier le compte" : "Nouveau compte utilisateur",
      bodyHtml: `
        <form id="userForm">
          <div class="form-grid">
            <div class="field"><label>Nom d'utilisateur *</label><input type="text" id="fUsername" value="${Utils.escapeHtml(u?.username || "")}" required></div>
            <div class="field"><label>Mot de passe *</label><input type="text" id="fPassword" value="${Utils.escapeHtml(u?.password || "")}" required></div>
            <div class="field full"><label>Nom complet</label><input type="text" id="fFullName" value="${Utils.escapeHtml(u?.fullName || "")}"></div>
            <div class="field"><label>Rôle *</label>
              <select id="fRole">${ROLES.map((r) => `<option value="${r}" ${u?.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Statut</label>
              <select id="fActive"><option value="1" ${u?.active !== false ? "selected" : ""}>Actif</option><option value="0" ${u?.active === false ? "selected" : ""}>Désactivé</option></select>
            </div>
            <div class="field full" id="linkTeacherField" style="display:none;"><label>Enseignant lié</label>
              <select id="fTeacher"><option value="">—</option>${teachers.map((t) => `<option value="${t.id}" ${u?.teacherId === t.id ? "selected" : ""}>${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field full" id="linkStudentField" style="display:none;"><label>Élève lié</label>
              <select id="fStudent"><option value="">—</option>${students.map((s) => `<option value="${s.id}" ${u?.studentId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field full" id="linkParentField" style="display:none;"><label>Enfant(s) lié(s) (parent)</label>
              <select id="fStudentsMulti" multiple size="4">${students.map((s) => `<option value="${s.id}" ${(u?.studentIds || []).includes(s.id) ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("")}</select>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveUser">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        const roleSel = overlay.querySelector("#fRole");
        const toggleLinkFields = () => {
          overlay.querySelector("#linkTeacherField").style.display = roleSel.value === "ENSEIGNANT" ? "" : "none";
          overlay.querySelector("#linkStudentField").style.display = roleSel.value === "ELEVE" ? "" : "none";
          overlay.querySelector("#linkParentField").style.display = roleSel.value === "PARENT" ? "" : "none";
        };
        roleSel.addEventListener("change", toggleLinkFields);
        toggleLinkFields();

        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveUser").addEventListener("click", () => {
          const username = overlay.querySelector("#fUsername").value.trim();
          const password = overlay.querySelector("#fPassword").value;
          if (!username || !password) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const dup = Storage.all("users").find((x) => x.username.toLowerCase() === username.toLowerCase() && x.id !== id);
          if (dup) {
            Utils.toast("Ce nom d'utilisateur est déjà utilisé", "error");
            return;
          }
          const role = roleSel.value;
          const data = {
            username,
            password,
            fullName: overlay.querySelector("#fFullName").value.trim(),
            role,
            active: overlay.querySelector("#fActive").value === "1",
            teacherId: role === "ENSEIGNANT" ? overlay.querySelector("#fTeacher").value : undefined,
            studentId: role === "ELEVE" ? overlay.querySelector("#fStudent").value : undefined,
            studentIds: role === "PARENT" ? Array.from(overlay.querySelector("#fStudentsMulti").selectedOptions).map((o) => o.value) : undefined,
          };
          if (editing) {
            Storage.update("users", id, data);
            Utils.toast("Compte mis à jour", "success");
          } else {
            Storage.insert("users", data);
            Utils.toast("Compte créé", "success");
          }
          Utils.closeModal();
          renderTable(true);
        });
      },
    });
  }

  return { render };
})();
