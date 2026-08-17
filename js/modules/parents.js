/**
 * Module Portail Parents : sélection d'un élève pour consulter ses informations,
 * notes, bulletins, absences, emploi du temps, frais/paiements, documents.
 */
const Parents = (() => {
  let selectedStudentId = "";

  function render(container) {
    const scoped = Auth.scopedStudentIds();
    if (scoped) {
      // PARENT / ELEVE : accès restreint à leur(s) propre(s) enfant(s), pas de sélecteur libre.
      selectedStudentId = scoped[0] || "";
      const students = Storage.all("students").filter((s) => scoped.includes(s.id));
      container.innerHTML = `
        <div class="panel">
          <div class="toolbar">
            <label>Élève :</label>
            <select id="parentStudentSelect" ${scoped.length <= 1 ? "disabled" : ""}>
              ${students.map((s) => `<option value="${s.id}" ${selectedStudentId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)} (${Utils.escapeHtml(s.matricule)})</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="parentPortalArea"></div>
      `;
      container.querySelector("#parentStudentSelect").addEventListener("change", (e) => {
        selectedStudentId = e.target.value;
        renderPortal();
      });
      renderPortal();
      return;
    }
    const students = Storage.all("students");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <label>Se connecter en tant que parent de :</label>
          <select id="parentStudentSelect">
            <option value="">— Sélectionner un élève —</option>
            ${students.map((s) => `<option value="${s.id}" ${selectedStudentId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)} (${Utils.escapeHtml(s.matricule)})</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="parentPortalArea"></div>
    `;
    container.querySelector("#parentStudentSelect").addEventListener("change", (e) => {
      selectedStudentId = e.target.value;
      renderPortal();
    });
    renderPortal();
  }

  function renderPortal() {
    const area = document.getElementById("parentPortalArea");
    if (!area) return;
    if (!selectedStudentId) {
      area.innerHTML = `<div class="empty-state">Sélectionnez un élève pour afficher son espace parent.</div>`;
      return;
    }
    const s = Storage.get("students", selectedStudentId);
    const cls = Storage.get("classes", s.classId);
    const grades = Storage.all("grades").filter((g) => g.studentId === s.id);
    const subjects = Storage.all("subjects");
    const attendance = Storage.all("attendance").filter((a) => a.personId === s.id && a.type === "student");
    const timetable = Storage.all("timetable").filter((t) => t.classId === s.classId);
    const payRecord = Storage.all("payments").find((r) => r.studentId === s.id);
    const totals = payRecord ? Payments.computeTotals(payRecord) : { total: 0, paid: 0, remaining: 0 };
    const documents = Storage.all("documents").filter((d) => d.studentId === s.id);

    area.innerHTML = `
      <div class="panel" style="display:flex;gap:16px;align-items:center;">
        <img class="avatar-lg" src="${s.photo || Students.placeholderPhoto()}">
        <div>
          <h2 style="margin:0;">${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</h2>
          <p class="text-muted">Matricule ${Utils.escapeHtml(s.matricule)} — Classe ${cls ? Utils.escapeHtml(cls.name) : "-"}</p>
        </div>
      </div>

      <div class="cards-grid">
        <div class="stat-card"><div class="stat-value">${grades.length}</div><div class="stat-label">Notes enregistrées</div></div>
        <div class="stat-card"><div class="stat-value">${attendance.filter((a) => a.status === "Absent").length}</div><div class="stat-label">Absences</div></div>
        <div class="stat-card"><div class="stat-value">${attendance.filter((a) => a.status === "Retard").length}</div><div class="stat-label">Retards</div></div>
        <div class="stat-card"><div class="stat-value">${Utils.formatMoney(totals.remaining)}</div><div class="stat-label">Reste à payer</div></div>
      </div>

      <div class="panel">
        <h3>📝 Notes récentes</h3>
        <table class="data-table">
          <thead><tr><th>Matière</th><th>Type</th><th>Note</th><th>Trimestre</th></tr></thead>
          <tbody>${grades.map((g) => `<tr><td>${Utils.escapeHtml(subjects.find((x) => x.id === g.subjectId)?.name || "-")}</td><td>${Utils.escapeHtml(g.type)}</td><td>${g.value}/${g.max}</td><td>${Utils.escapeHtml(g.term)}</td></tr>`).join("") || `<tr><td colspan="4">Aucune note</td></tr>`}</tbody>
        </table>
        <button class="btn btn-sm" id="btnViewBulletin" style="margin-top:10px;">📄 Voir le bulletin</button>
      </div>

      <div class="panel">
        <h3>🕐 Absences &amp; Retards</h3>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Statut</th><th>Justifiée</th><th>Motif</th></tr></thead>
          <tbody>${attendance.map((a) => `<tr><td>${Utils.formatDate(a.date)}</td><td>${Utils.escapeHtml(a.status)}</td><td>${a.justified ? "Oui" : "Non"}</td><td>${Utils.escapeHtml(a.motif || "-")}</td></tr>`).join("") || `<tr><td colspan="4">Aucun enregistrement</td></tr>`}</tbody>
        </table>
      </div>

      <div class="panel">
        <h3>📅 Emploi du temps de la classe</h3>
        <table class="data-table">
          <thead><tr><th>Jour</th><th>Heure</th><th>Matière</th><th>Salle</th></tr></thead>
          <tbody>${timetable.map((t) => `<tr><td>${t.day}</td><td>${t.start}-${t.end}</td><td>${Utils.escapeHtml(subjects.find((x) => x.id === t.subjectId)?.name || "-")}</td><td>${Utils.escapeHtml(t.room || "-")}</td></tr>`).join("") || `<tr><td colspan="4">Aucun cours planifié</td></tr>`}</tbody>
        </table>
      </div>

      <div class="panel">
        <h3>💰 Frais scolaires</h3>
        ${payRecord ? `
        <div class="cards-grid">
          <div class="stat-card"><div class="stat-value">${Utils.formatMoney(totals.total)}</div><div class="stat-label">Total dû</div></div>
          <div class="stat-card"><div class="stat-value">${Utils.formatMoney(totals.paid)}</div><div class="stat-label">Déjà payé</div></div>
          <div class="stat-card"><div class="stat-value">${Utils.formatMoney(totals.remaining)}</div><div class="stat-label">Reste à payer</div></div>
        </div>` : `<div class="empty-state">Aucun dossier de paiement.</div>`}
      </div>

      <div class="panel">
        <h3>🗂️ Documents</h3>
        <table class="data-table">
          <thead><tr><th>Titre</th><th>Type</th><th>Date</th><th></th></tr></thead>
          <tbody>${documents.map((d) => `<tr><td>${Utils.escapeHtml(d.title)}</td><td>${Utils.escapeHtml(d.type)}</td><td>${Utils.formatDate(d.date)}</td><td><button class="btn btn-sm btn-secondary" data-printdoc="${d.id}">🖨️</button></td></tr>`).join("") || `<tr><td colspan="4">Aucun document</td></tr>`}</tbody>
        </table>
      </div>

      <div class="panel">
        <h3>💬 Messages de l'école</h3>
        <div class="empty-state">Aucun nouveau message.</div>
      </div>
    `;

    area.querySelector("#btnViewBulletin")?.addEventListener("click", () => {
      window.location.hash = "#/bulletins";
    });
    area.querySelectorAll("[data-printdoc]").forEach((b) => b.addEventListener("click", () => Documents.printDocument(b.dataset.printdoc)));
  }

  return { render };
})();
