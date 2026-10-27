/**
 * Module Paramètres : nom de l'établissement, année scolaire, trimestre en cours,
 * réinitialisation des données de démonstration.
 */
const Settings = (() => {
  function render(container) {
    const s = Storage.db().settings;
    container.innerHTML = `
      <div class="panel">
        <h3>Informations de l'établissement</h3>
        <div class="form-grid">
          <div class="field full"><label>Nom de l'établissement *</label><input type="text" id="fSchoolName" value="${Utils.escapeHtml(s.schoolName)}" required></div>
          <div class="field full"><label>Logo de l'établissement</label><input type="file" id="fSchoolLogo" accept="image/png,image/jpeg,image/webp"><img id="schoolLogoPreview" class="school-logo-preview" src="${s.bulletin?.logo || ""}" alt="Aperçu du logo" style="${s.bulletin?.logo ? "" : "display:none;"}"></div>
          <div class="field"><label>Année scolaire *</label><input type="text" id="fYear" value="${Utils.escapeHtml(s.currentYear)}" required></div>
          <div class="field"><label>Période en cours *</label>
            <select id="fTerm" required>${["Trimestre 1", "Trimestre 2", "Trimestre 3"].map((t) => `<option ${s.currentTerm === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
        </div>
        <button class="btn" id="saveSettings" style="margin-top:14px;">💾 Enregistrer</button>
      </div>
    `;
    let logoData = s.bulletin?.logo || "";
    container.querySelector("#fSchoolLogo").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      logoData = await Utils.readFileAsDataURL(file);
      const preview = container.querySelector("#schoolLogoPreview");
      preview.src = logoData;
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
