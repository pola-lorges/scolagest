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
          ${!scoped ? `<button class="btn btn-secondary" id="btnDownloadAll">⬇️ PDF de la classe</button>` : ""}
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
    container.querySelector("#btnDownloadAll")?.addEventListener("click", () => {
      downloadClassBulletins(classSel.value, container.querySelector("#bTerm").value);
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
    const bulletinSettings = settings.bulletin || {};
    const logo = bulletinSettings.logo || "";
    const evaluationTypes = bulletinSettings.evaluationTypes || ["DEV1", "DEV2", "DEV3", "DEV4", "DEV5", "DEV6"];
    const subjectIds = (c?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((sub) => subjectIds.includes(sub.id));
    const teachers = Storage.all("teachers");
    const classStudents = Storage.all("students").filter((student) => student.classId === classId);
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);

    const rows = subjects.map((subj) => {
      const avg = Grades.studentAverageForSubject(studentId, subj.id, term);
      const st = (c.subjectTeachers || []).find((x) => x.subjectId === subj.id);
      const teacher = teachers.find((t) => t.id === st?.teacherId);
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subj.id && grade.term === term);
      return { subj, avg, teacher, grades };
    });

    const general = Grades.studentGeneralAverage(studentId, classId, term);
    const ranking = Grades.classRanking(classId, term);
    const rank = ranking.findIndex((r) => r.student.id === studentId);

    return `
      <div class="bulletin">
        <div class="bulletin-header">
          <div>
            ${logo ? `<img class="bulletin-logo" src="${logo}" alt="Logo de l'établissement">` : ""}
            <p style="margin:0;font-weight:700;">REPUBLIQUE DU CAMEROUN</p>
            <p style="margin:2px 0;font-size:11px;">Paix — Travail — Patrie</p>
            <h2 style="margin:8px 0 2px;">${Utils.escapeHtml(bulletinSettings.institution || settings.schoolName)}</h2>
            <p style="margin:2px 0;font-size:11px;">${Utils.escapeHtml(bulletinSettings.ministry || "MINISTERE DES ENSEIGNEMENTS SECONDAIRES")}</p>
            <p style="margin:2px 0;font-size:11px;">${Utils.escapeHtml(bulletinSettings.address || "")} — Tél. : ${Utils.escapeHtml(bulletinSettings.phone || "")}</p>
          </div>
          <div style="text-align:right;">
            <h3 style="margin:0 0 8px;">${term === "Annuel" ? "BULLETIN ANNUEL DE NOTES" : "BULLETIN DE NOTES DU " + Utils.escapeHtml(term).toUpperCase()}</h3>
            <p style="margin:2px 0;"><strong>${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</strong></p>
            <p style="margin:2px 0;">Matricule : ${Utils.escapeHtml(s.matricule)}</p>
            <p style="margin:2px 0;">Classe : ${Utils.escapeHtml(c?.name || "-")}</p>
          </div>
        </div>
        <div class="bulletin-meta">
          <span><strong>Né(e) le :</strong> ${Utils.formatDate(s.dob)} à ${Utils.escapeHtml(s.pob || "-")}</span>
          <span><strong>Sexe :</strong> ${Utils.escapeHtml(s.gender || "-")}</span>
          <span><strong>Effectif :</strong> ${classStudents.length}</span>
          <span><strong>Professeur principal :</strong> ${mainTeacher ? Utils.escapeHtml(mainTeacher.firstName + " " + mainTeacher.lastName) : "-"}</span>
        </div>
        <table>
          <thead><tr><th>Matière</th>${evaluationTypes.map((type) => `<th>${Utils.escapeHtml(type)}</th>`).join("")}<th>Moy /20</th><th>Coef.</th><th>Enseignant</th><th>Appréciation</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td>${Utils.escapeHtml(r.subj.name)}</td>
                  ${evaluationTypes.map((type) => `<td>${r.grades.find((grade) => grade.type === type)?.value ?? "-"}</td>`).join("")}
                  <td>${r.avg !== null ? r.avg.toFixed(2) : "-"}</td>
                  <td>${r.subj.coefficient}</td>
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
          <div><strong>Rappels moyennes :</strong> ${appreciationFromAvg(general)}</div>
          <div><strong>Conduite de l'élève :</strong> ${general !== null && general >= 10 ? "Travail passable" : "Travail à améliorer"}</div>
          <div><strong>Appréciation du conseil de classe :</strong> ${appreciationFromAvg(general)}</div>
          <div><strong>Décision de passage :</strong> ${general !== null && general >= 10 ? "Admis(e) en classe supérieure" : "À redoubler / à surveiller"}</div>
        </div>
        <p style="margin-top:18px;font-size:11px;">Le bulletin est délivré sans rature ni surcharge.</p>
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
        <button class="btn" id="btnDownloadOne">⬇️ Télécharger PDF</button>
      </div>
      <div id="bulletinPrintable">${html}</div>
    `;
    area.querySelector("#btnDownloadOne").addEventListener("click", () => {
      downloadBulletinPdf(studentId, classId, term);
    });
  }

  async function downloadClassBulletins(classId, term) {
    const students = Storage.all("students").filter((s) => s.classId === classId);
    if (students.length === 0) return Utils.toast("Aucun élève dans cette classe", "error");
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    try {
      const logo = await loadLogoDataUrl();
      const definitions = students.map((student) => buildBulletinPdfDefinition(student.id, classId, term, logo));
      const first = definitions.shift();
      definitions.forEach((definition) => first.content.push({ text: "", pageBreak: "before" }, ...definition.content));
      const classItem = Storage.get("classes", classId);
      await Utils.downloadPdfMake(first, `Bulletins-${classItem?.name || "classe"}-${term}.pdf`);
      Utils.toast("Bulletins PDF téléchargés", "success");
    } catch (error) {
      console.error("Erreur de génération des bulletins PDF", error);
      Utils.toast("Impossible de charger le logo des bulletins", "error");
    }
  }

  async function downloadBulletinPdf(studentId, classId, term) {
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const student = Storage.get("students", studentId);
    const filename = `Bulletin-${student?.firstName || "eleve"}-${student?.lastName || ""}-${term}.pdf`;
    try {
      const logo = await loadLogoDataUrl();
      await Utils.downloadPdfMake(buildBulletinPdfDefinition(studentId, classId, term, logo), filename);
      Utils.toast("Bulletin PDF téléchargé", "success");
    } catch (error) {
      console.error("Erreur de génération du bulletin PDF", error);
      Utils.toast("Impossible de charger le logo du bulletin", "error");
    }
  }

  function loadLogoDataUrl() {
    const logo = Storage.db().settings.bulletin?.logo || "";
    if (!logo || logo.startsWith("data:")) return Promise.resolve(logo);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      image.onerror = reject;
      image.src = logo;
    });
  }

  function buildBulletinPdfDefinition(studentId, classId, term, logoData = "") {
    const s = Storage.get("students", studentId);
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const logo = logoData || bulletinSettings.logo || "";
    const evaluationTypes = bulletinSettings.evaluationTypes || ["DEV1", "DEV2", "DEV3", "DEV4", "DEV5", "DEV6"];
    const subjects = Storage.all("subjects").filter((subject) => (c?.subjectTeachers || []).some((st) => st.subjectId === subject.id));
    const teachers = Storage.all("teachers");
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);
    const classStudents = Storage.all("students").filter((student) => student.classId === classId);
    const ranking = Grades.classRanking(classId, term);
    const rank = ranking.findIndex((item) => item.student.id === studentId);
    const general = Grades.studentGeneralAverage(studentId, classId, term);
    const body = [[{ text: "Matieres", style: "tableHeader" }, { text: "Competences", style: "tableHeader" }, ...evaluationTypes.slice(0, 2).map((type) => ({ text: type, style: "tableHeader" })), { text: "Moy/20", style: "tableHeader" }, { text: "Coef.", style: "tableHeader" }, { text: "MoyxCoef", style: "tableHeader" }, { text: "Rang", style: "tableHeader" }, { text: "Moyenne classe", style: "tableHeader" }, { text: "Notes", style: "tableHeader" }, { text: "Appreciations", style: "tableHeader" }]];
    subjects.forEach((subject) => {
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subject.id && grade.term === term);
      const average = Grades.studentAverageForSubject(studentId, subject.id, term);
      const assignment = (c.subjectTeachers || []).find((st) => st.subjectId === subject.id);
      const teacher = teachers.find((item) => item.id === assignment?.teacherId);
      body.push([subject.name, teacher ? teacher.firstName + " " + teacher.lastName : "-", ...evaluationTypes.slice(0, 2).map((type) => grades.find((grade) => grade.type === type)?.value ?? "-"), average === null ? "-" : average.toFixed(2), subject.coefficient, average === null ? "-" : (average * subject.coefficient).toFixed(2), "-", "-", "-", appreciationFromAvg(average)]);
    });
    return {
      pageSize: "A4", pageMargins: [18, 12, 18, 12],
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      content: [
        { table: { widths: ["*", 52, "*"], body: [[{ stack: [{ text: "REPUBLIQUE DU CAMEROUN", bold: true }, { text: "PAIX - TRAVAIL - PATRIE", fontSize: 6 }, { text: bulletinSettings.ministry || "MINISTERE DES ENSEIGNEMENTS SECONDAIRES", fontSize: 6 }, { text: bulletinSettings.institution || settings.schoolName, bold: true, fontSize: 8 }], alignment: "center" }, logo ? { image: "establishmentLogo", width: 48, alignment: "center" } : { text: "" }, { stack: [{ text: "REPUBLIC OF CAMEROON", bold: true }, { text: "PEACE - WORK - FATHERLAND", fontSize: 6 }, { text: "MINISTRY OF SECONDARY EDUCATION", fontSize: 6 }, { text: "IRENE PATRINI RENATO FOUNDATION SCHOOL", bold: true, fontSize: 8 }], alignment: "center" }]] }, layout: "noBorders", margin: [0, 0, 0, 4] },
        { text: "B.P : YDE - Tél. : " + (bulletinSettings.phone || "") + "                 ANNEE SCOLAIRE / ACADEMIC YEAR : " + settings.currentYear, alignment: "center", fontSize: 7, margin: [0, 0, 0, 4] },
        { text: "BULLETIN DE NOTES DU " + term.toUpperCase(), style: "bulletinTitle" },
        { table: { widths: [58, "*", 42, 42], body: [["NOMS ET PRENOMS", s.firstName + " " + s.lastName, "CLASSE", c?.name || "-"], ["MATRICULE ELEVE", s.matricule, "SEXE", s.gender || "-"], ["DATE ET LIEU DE NAISSANCE", Utils.formatDate(s.dob) + " à " + (s.pob || "-"), "REDOUBLANT", "Non"], ["PROFESSEUR PRINCIPAL", mainTeacher ? mainTeacher.firstName + " " + mainTeacher.lastName : "-", "EFFECTIF", classStudents.length]] }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { headerRows: 1, widths: [95, 80, 30, 30, 45, 30, 50, 35, 50, 35, 79], body }, fontSize: 6.2, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 3.5, paddingBottom: () => 3.5 } },
        { text: "Moyenne générale : " + (general === null ? "-" : general.toFixed(2)) + " /20", bold: true, margin: [0, 14, 0, 4] },
        { text: "Rang : " + (rank >= 0 ? rank + 1 + " / " + ranking.length : "-"), margin: [0, 0, 0, 4] },
        { text: "Rappels moyennes : " + appreciationFromAvg(general) + "\nConduite de l'élève : " + (general !== null && general >= 10 ? "Travail passable" : "Travail à améliorer") + "\nAppréciation du conseil de classe : " + appreciationFromAvg(general) + "\nDécision du conseil de classe : " + (general !== null && general >= 10 ? "Admis(e) en classe supérieure" : "À redoubler / à surveiller"), fontSize: 9, margin: [0, 4, 0, 8] },
        { text: "Le bulletin est délivré sans rature ni surcharge.", italics: true, fontSize: 8, margin: [0, 8, 0, 30] },
        { columns: [{ text: "Le professeur principal", alignment: "center" }, { text: "Le chef d'établissement", alignment: "center" }] },
      ],
      styles: { tableHeader: { bold: true, color: "white", fillColor: "2f6fed", alignment: "center" } },
      defaultStyle: { font: "Roboto", fontSize: 9 },
    };
  }

  return { render };
})();
