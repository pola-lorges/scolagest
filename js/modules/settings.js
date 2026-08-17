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
          <div class="field full"><label>Nom de l'établissement</label><input type="text" id="fSchoolName" value="${Utils.escapeHtml(s.schoolName)}"></div>
          <div class="field"><label>Année scolaire</label><input type="text" id="fYear" value="${Utils.escapeHtml(s.currentYear)}"></div>
          <div class="field"><label>Période en cours</label>
            <select id="fTerm">${["Trimestre 1", "Trimestre 2", "Trimestre 3"].map((t) => `<option ${s.currentTerm === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
        </div>
        <button class="btn" id="saveSettings" style="margin-top:14px;">💾 Enregistrer</button>
      </div>
      <div class="panel">
        <h3>Données</h3>
        <p class="text-muted">Toutes les données sont stockées localement dans votre navigateur (localStorage).</p>
        <button class="btn btn-danger" id="resetData">⚠️ Réinitialiser toutes les données</button>
      </div>
    `;
    container.querySelector("#saveSettings").addEventListener("click", () => {
      Storage.setSettings({
        schoolName: container.querySelector("#fSchoolName").value.trim(),
        currentYear: container.querySelector("#fYear").value.trim(),
        currentTerm: container.querySelector("#fTerm").value,
      });
      Utils.toast("Paramètres enregistrés", "success");
      Router.updateYearBadge();
    });
    container.querySelector("#resetData").addEventListener("click", () => {
      Utils.confirmDialog("Cette action supprimera toutes les données actuelles et restaurera les données de démonstration. Continuer ?", () => {
        Storage.resetAll();
        Utils.toast("Données réinitialisées", "success");
        Router.navigate("dashboard");
      });
    });
  }
  return { render };
})();
