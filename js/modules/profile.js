/**
 * Mon profil : consultation des informations personnelles (lecture seule)
 * et changement de son propre mot de passe uniquement.
 */
const Profile = (() => {
  function linkedRecords(user) {
    const students = Storage.all("students");
    const fullName = (item) => `${item.firstName || ""} ${item.lastName || ""}`.trim();
    if (user.role === "ENSEIGNANT" && user.teacherId) {
      const teacher = Storage.get("teachers", user.teacherId);
      return teacher ? [["Fiche enseignant", fullName(teacher)]] : [];
    }
    if (user.role === "ELEVE" && user.studentId) {
      const student = students.find((s) => s.id === user.studentId);
      return student ? [["Fiche élève", fullName(student)]] : [];
    }
    if (user.role === "PARENT") {
      const names = (user.studentIds || []).map((id) => students.find((s) => s.id === id)).filter(Boolean).map(fullName);
      return names.length ? [["Enfant(s) rattaché(s)", names.join(", ")]] : [];
    }
    return [];
  }

  function profilePhoto(user) {
    const record = user.role === "ENSEIGNANT" ? Storage.get("teachers", user.teacherId)
      : user.role === "ELEVE" ? Storage.get("students", user.studentId) : null;
    return Utils.safeImageSrc(record?.photo, Students.placeholderPhoto());
  }

  function open() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const rows = [
      ["Nom complet", user.fullName || "-"],
      ["Adresse e-mail", user.email || user.username || "-"],
      ["Rôle", ROLE_LABELS[user.role] || user.role],
      ["Établissement", Storage.getActiveSchool()?.name || "-"],
      ...linkedRecords(user),
    ];
    Utils.openModal({
      title: "Mon profil",
      bodyHtml: `
        <div style="text-align:center;margin-bottom:12px;"><img class="avatar-lg" src="${profilePhoto(user)}" alt="Photo de profil"></div>
        <div class="table-wrap"><table class="data-table"><tbody>
          ${rows.map(([label, value]) => `<tr><th scope="row" style="width:40%;text-align:left;">${Utils.escapeHtml(label)}</th><td>${Utils.escapeHtml(value)}</td></tr>`).join("")}
        </tbody></table></div>
        <form id="passwordForm" autocomplete="off" novalidate style="margin-top:12px;">
          <h4>Changer mon mot de passe</h4>
          <div class="field full"><label for="pwCurrent">Mot de passe actuel</label><input type="password" id="pwCurrent" autocomplete="current-password" required></div>
          <div class="field full"><label for="pwNew">Nouveau mot de passe</label><input type="password" id="pwNew" autocomplete="new-password" minlength="12" required><small>12 caractères minimum, avec majuscule, minuscule, chiffre et symbole.</small></div>
          <div class="field full"><label for="pwConfirm">Confirmer le nouveau mot de passe</label><input type="password" id="pwConfirm" autocomplete="new-password" required></div>
          <div id="pwError" class="login-error" style="display:none;" role="alert"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="profileClose">Fermer</button>
        <button class="btn" id="profileSavePassword">🔒 Changer le mot de passe</button>
      `,
      onMount: (overlay) => {
        const errBox = overlay.querySelector("#pwError");
        const showError = (message) => { errBox.textContent = message; errBox.style.display = "block"; };
        overlay.querySelector("#profileClose").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#profileSavePassword").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Modification du mot de passe…", async () => {
          errBox.style.display = "none";
          const current = overlay.querySelector("#pwCurrent").value;
          const next = overlay.querySelector("#pwNew").value;
          const confirmation = overlay.querySelector("#pwConfirm").value;
          if (!current || !next) return showError("Renseignez le mot de passe actuel et le nouveau mot de passe.");
          if (next !== confirmation) return showError("La confirmation ne correspond pas au nouveau mot de passe.");
          try {
            await Auth.changeOwnPassword(current, next);
            Utils.closeModal();
            Utils.toast("Mot de passe modifié", "success");
          } catch (error) {
            showError(error.message || "Modification du mot de passe impossible.");
          }
        }));
      },
    });
  }

  return { open };
})();
