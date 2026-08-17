/**
 * Module Bulletins : génération automatique des bulletins trimestriels/semestriels,
 * moyennes par matière et générale, rang, appréciations, décision de passage, impression PDF.
 */
const Bulletins = (() => {
  function render(container) {
    const scoped = Auth.scopedStudentIds();
    const classes = Storage.all("classes").filter((c) => {
      if (!scoped) return true;
      return Storage.all("students").some((s) => scoped.includes(s.id) && s.classId === c.id);
    });
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="bClass" ${scoped ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select>
          <select id="bTerm">${Grades.TERMS.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          <select id="bStudent" ${scoped ? "disabled" : ""}></select>
          <span class="spacer"></span>
          ${!scoped ? `<button class="btn btn-secondary" id="btnPrintAll">🖨️ Bulletins de la classe</button>` : ""}
          <button class="btn" id="btnGenerate">📄 Générer le bulletin</button>
        </div>
        <div id="bulletinArea"></div>
      </div>
    `;
    const classSel = container.querySelector("#bClass");
    const studentSel = container.querySelector("#bStudent");

    function refreshStudents() {
      const students = Storage.all("students").filter((s) => s.classId === classSel.value && (!scoped || scoped.includes(s.id)));
      studentSel.innerHTML = students.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("") || "<option>Aucun élève</option>";
    }
    refreshStudents();
    classSel.addEventListener("change", refreshStudents);
    container.querySelector("#btnGenerate").addEventListener("click", () => {
      if (!studentSel.value) return Utils.toast("Aucun élève sélectionné", "error");
      renderBulletin(studentSel.value, classSel.value, container.querySelector("#bTerm").value);
    });
    container.querySelector("#btnPrintAll")?.addEventListener("click", () => {
      printClassBulletins(classSel.value, container.querySelector("#bTerm").value);
    });
  }

  function appreciationFromAvg(avg) {
    if (avg === null) return "-";
    if (avg >= 16) return "Excellent";
    if (avg >= 14) return "Très bien";
    if (avg >= 12) return "Bien";
    if (avg >= 10) return "Assez bien";
    return "Insuffisant";
  }

  function buildBulletinHtml(studentId, classId, term) {
    const s = Storage.get("students", studentId);
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const subjectIds = (c?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((sub) => subjectIds.includes(sub.id));
    const teachers = Storage.all("teachers");

    const rows = subjects.map((subj) => {
      const avg = Grades.studentAverageForSubject(studentId, subj.id, term);
      const st = (c.subjectTeachers || []).find((x) => x.subjectId === subj.id);
      const teacher = teachers.find((t) => t.id === st?.teacherId);
      return { subj, avg, teacher };
    });

    const general = Grades.studentGeneralAverage(studentId, classId, term);
    const ranking = Grades.classRanking(classId, term);
    const rank = ranking.findIndex((r) => r.student.id === studentId);

    return `
      <div class="bulletin">
        <div class="bulletin-header">
          <div>
            <h2 style="margin:0;">${Utils.escapeHtml(settings.schoolName)}</h2>
            <p style="margin:2px 0;">Année scolaire : ${Utils.escapeHtml(settings.currentYear)} — ${Utils.escapeHtml(term)}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:2px 0;"><strong>${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</strong></p>
            <p style="margin:2px 0;">Matricule : ${Utils.escapeHtml(s.matricule)}</p>
            <p style="margin:2px 0;">Classe : ${Utils.escapeHtml(c?.name || "-")}</p>
          </div>
        </div>
        <table>
          <thead><tr><th>Matière</th><th>Coefficient</th><th>Moyenne /20</th><th>Enseignant</th><th>Appréciation</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td>${Utils.escapeHtml(r.subj.name)}</td>
                  <td>${r.subj.coefficient}</td>
                  <td>${r.avg !== null ? r.avg.toFixed(2) : "-"}</td>
                  <td>${r.teacher ? Utils.escapeHtml(r.teacher.firstName + " " + r.teacher.lastName) : "-"}</td>
                  <td>${appreciationFromAvg(r.avg)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <hr class="sep">
        <div class="form-grid">
          <div><strong>Moyenne générale :</strong> ${general !== null ? general.toFixed(2) : "-"} /20</div>
          <div><strong>Rang :</strong> ${rank >= 0 ? rank + 1 + " / " + ranking.length : "-"}</div>
          <div><strong>Appréciation du conseil de classe :</strong> ${appreciationFromAvg(general)}</div>
          <div><strong>Décision de passage :</strong> ${general !== null && general >= 10 ? "Admis(e) en classe supérieure" : "À redoubler / à surveiller"}</div>
        </div>
        <div class="signature-row">
          <div>Le professeur principal</div>
          <div>Le chef d'établissement</div>
        </div>
      </div>
    `;
  }

  function renderBulletin(studentId, classId, term) {
    const area = document.getElementById("bulletinArea");
    const html = buildBulletinHtml(studentId, classId, term);
    area.innerHTML = `
      <div class="toolbar no-print">
        <span class="spacer"></span>
        <button class="btn" id="btnPrintOne">🖨️ Imprimer / PDF</button>
      </div>
      <div id="bulletinPrintable">${html}</div>
    `;
    area.querySelector("#btnPrintOne").addEventListener("click", () => {
      Utils.printElement(html, "Bulletin scolaire");
    });
  }

  function printClassBulletins(classId, term) {
    const students = Storage.all("students").filter((s) => s.classId === classId);
    if (students.length === 0) return Utils.toast("Aucun élève dans cette classe", "error");
    const html = students.map((s) => buildBulletinHtml(s.id, classId, term) + '<div style="page-break-after:always;"></div>').join("");
    Utils.printElement(html, "Bulletins de classe");
  }

  return { render };
})();
