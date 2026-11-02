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
        ${canEdit ? `<p class="text-muted">Un accès de connexion peut être créé pour chaque rôle. Seul l'administrateur peut modifier les données; les autres rôles restent en lecture seule.</p>` : ""}
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
      documents: "Documents", users: "Utilisateurs", settings: "Paramètres", help: "Aide & guide",
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
    const users = [...Storage.all("users")].sort((a, b) => Utils.compareFrenchNames(a.fullName || a.username, b.fullName || b.username));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const students = [...Storage.all("students")].sort(Utils.comparePeople);
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
                linked = Utils.escapeHtml(u.studentIds.map((id) => students.find((s) => s.id === id)).filter(Boolean).sort(Utils.comparePeople).map((s) => `${s.firstName} ${s.lastName}`).join(", "));
              }
              return `
              <tr>
                <td>${Utils.escapeHtml(u.username)}</td>
                <td>${Utils.escapeHtml(u.fullName || "-")}</td>
                <td><span class="badge badge-primary">${ROLE_LABELS[u.role] || u.role}</span></td>
                <td>${linked}</td>
                <td>${u.authManaged ? (u.active !== false ? '<span class="badge badge-success">Actif</span>' : '<span class="badge badge-danger">Désactivé</span>') : '<span class="badge badge-warning">Fiche sans connexion</span>'}</td>
                ${canEdit ? `<td class="table-actions">
                  ${u.authManaged ? `
                  <button class="btn btn-sm btn-secondary" data-edit="${u.id}">✏️</button>
                  <button class="btn btn-sm btn-danger" data-del="${u.id}">🗑️</button>` : ""}
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
        Utils.confirmDialog("Supprimer ce compte utilisateur et son accès à l'application ?", async () => {
          try {
            await Auth.managePortalUser({ action: "delete", userId: b.dataset.del });
            Storage.remove("users", b.dataset.del);
            Utils.closeModal();
            Utils.toast("Compte et accès supprimés", "success");
            Storage.flushRemoteSave().catch((error) => {
              console.error("Synchronisation du profil supprimé impossible", error);
              Utils.toast("Accès supprimé; la liste locale pourra nécessiter une nouvelle synchronisation.", "error");
            });
            renderTable(canEdit);
          } catch (error) {
            Utils.toast(error.message || "Suppression du compte impossible", "error");
          }
        });
      })
    );
  }

  function openForm(id) {
    const editing = !!id;
    const u = editing ? Storage.get("users", id) : null;
    if (editing && !u?.authManaged) {
      Utils.toast("Cette ancienne fiche n'a pas d'identifiant de connexion. Créez un nouveau compte sécurisé.", "error");
      return;
    }
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const students = [...Storage.all("students")].sort(Utils.comparePeople);

    Utils.openModal({
      title: editing ? "Modifier le compte portail" : "Créer un compte de connexion",
      bodyHtml: `
        <form id="userForm">
          <div class="form-grid">
            <div class="field full"><label>Adresse e-mail de connexion *</label><input type="email" id="fEmail" value="${Utils.escapeHtml(u?.email || u?.username || "")}" required autocomplete="email" ${editing ? "readonly" : ""}></div>
            <div class="field full"><label>${editing ? "Nouveau mot de passe temporaire (facultatif)" : "Mot de passe temporaire *"}</label><input type="password" id="fPassword" ${editing ? "" : "required"} minlength="12" autocomplete="new-password"><small>12 caractères minimum, avec majuscule, minuscule, chiffre et symbole. ${editing ? "Laissez vide pour ne pas le modifier." : "Transmettez-le au titulaire par un canal privé."}</small></div>
            <div class="field full"><label>Nom complet</label><input type="text" id="fFullName" value="${Utils.escapeHtml(u?.fullName || "")}"></div>
            <div class="field"><label>Rôle *</label>
              <select id="fRole" required>${ROLES.map((r) => `<option value="${r}" ${u?.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}</select>
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
        overlay.querySelector("#saveUser").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, editing ? "Mise à jour du compte…" : "Création du compte…", async () => {
          if (!Utils.validateRequired(overlay)) return;
          const email = overlay.querySelector("#fEmail").value.trim().toLowerCase();
          if (!email) {
            Utils.toast("Saisissez une adresse e-mail", "error");
            return;
          }
          const dup = Storage.all("users").find((x) => (x.email || x.username || "").toLowerCase() === email && x.id !== id);
          if (dup) {
            Utils.toast("Cette adresse est déjà associée à un compte", "error");
            return;
          }
          const role = roleSel.value;
          const teacherId = overlay.querySelector("#fTeacher").value;
          const studentId = overlay.querySelector("#fStudent").value;
          const studentIds = Array.from(overlay.querySelector("#fStudentsMulti").selectedOptions).map((o) => o.value);
          if (role === "ENSEIGNANT" && !teacherId) return Utils.toast("Sélectionnez l'enseignant lié à ce compte", "error");
          if (role === "ELEVE" && !studentId) return Utils.toast("Sélectionnez l'élève lié à ce compte", "error");
          if (role === "PARENT" && !studentIds.length) return Utils.toast("Sélectionnez au moins un élève pour ce compte parent", "error");
          const profile = {
            email,
            fullName: overlay.querySelector("#fFullName").value.trim(),
            role,
            active: overlay.querySelector("#fActive").value === "1",
            teacherId: role === "ENSEIGNANT" ? teacherId : undefined,
            studentId: role === "ELEVE" ? studentId : undefined,
            studentIds: role === "PARENT" ? studentIds : undefined,
          };
          try {
            const result = await Auth.managePortalUser({
              action: editing ? "update" : "create",
              ...(editing ? { userId: u.id, password: overlay.querySelector("#fPassword").value || undefined } : { email, password: overlay.querySelector("#fPassword").value }),
              fullName: profile.fullName,
              role,
              active: profile.active,
              teacherId: profile.teacherId,
              studentId: profile.studentId,
              studentIds: profile.studentIds,
            });
            if (editing) Storage.update("users", u.id, { ...profile, username: email, authManaged: true });
            else Storage.insert("users", result.user);
            Utils.closeModal();
            renderTable(true);
            const profileAction = Storage.flushRemoteSave().catch((error) => {
              console.error("Synchronisation du profil utilisateur impossible", error);
              Utils.toast("Accès créé/mis à jour; la liste des comptes sera resynchronisée plus tard.", "error");
            });
            Utils.toast(editing ? "Compte mis à jour" : "Compte créé : la personne peut se connecter avec son e-mail et son mot de passe temporaire", "success");
            await profileAction;
          } catch (error) {
            Utils.toast(error.message || "Création du compte impossible", "error");
          }
        }));
      },
    });
  }

  return { render };
})();
