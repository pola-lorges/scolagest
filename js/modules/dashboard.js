/**
 * Tableau de bord : statistiques globales et aperçu rapide de l'établissement.
 */
const Dashboard = (() => {
  function render(container) {
    const students = Storage.all("students");
    const classes = Storage.all("classes");
    const teachers = Storage.all("teachers");
    const payments = Storage.all("payments");
    const today = Utils.today();
    const absencesToday = Storage.all("attendance").filter((a) => a.date === today && a.status === "Absent" && a.type === "student");

    let totalDue = 0, totalPaid = 0;
    payments.forEach((r) => {
      const t = Payments.computeTotals(r);
      totalDue += t.total;
      totalPaid += t.paid;
    });

    const statusCounts = students.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    container.innerHTML = `
      <div class="cards-grid">
        <div class="stat-card"><div class="stat-value">${students.length}</div><div class="stat-label">👨‍🎓 Élèves inscrits</div></div>
        <div class="stat-card"><div class="stat-value">${classes.length}</div><div class="stat-label">🏫 Classes</div></div>
        <div class="stat-card"><div class="stat-value">${teachers.length}</div><div class="stat-label">👨‍🏫 Enseignants</div></div>
        <div class="stat-card"><div class="stat-value">${absencesToday.length}</div><div class="stat-label">🕐 Absents aujourd'hui</div></div>
        <div class="stat-card"><div class="stat-value">${Utils.formatMoney(totalPaid)}</div><div class="stat-label">💰 Total encaissé</div></div>
        <div class="stat-card"><div class="stat-value">${Utils.formatMoney(totalDue - totalPaid)}</div><div class="stat-label">💸 Reste à recouvrer</div></div>
      </div>

      <div class="panel">
        <h3>Répartition des élèves par statut</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Statut</th><th>Nombre</th></tr></thead>
            <tbody>${Object.entries(statusCounts).map(([k, v]) => `<tr><td>${Utils.escapeHtml(k)}</td><td>${v}</td></tr>`).join("") || `<tr><td colspan="2">Aucun élève</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3>Classes et effectifs</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Classe</th><th>Niveau</th><th>Effectif</th><th>Capacité</th></tr></thead>
            <tbody>
              ${classes
                .map((c) => `<tr><td>${Utils.escapeHtml(c.name)}</td><td>${Utils.escapeHtml(c.level)}</td><td>${students.filter((s) => s.classId === c.id).length}</td><td>${c.capacity}</td></tr>`)
                .join("") || `<tr><td colspan="4">Aucune classe</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  return { render };
})();
