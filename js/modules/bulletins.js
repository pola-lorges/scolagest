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
    }).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="bClass" ${scoped ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select>
          <select id="bTerm">${Grades.TERMS.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          <select id="bSequence" aria-label="Séquence"></select>
          <select id="bStudent" ${scoped ? "disabled" : ""}></select>
          <span class="spacer"></span>
          <button class="btn btn-secondary" id="btnDownloadSequence">⬇️ Bulletin séquentiel PDF</button>
          <button class="btn btn-secondary" id="btnDownloadTerm">⬇️ Bulletin trimestriel PDF</button>
          ${!scoped ? `<button class="btn btn-secondary" id="btnDownloadSequenceAll">⬇️ Bulletins séquentiels (classe)</button><button class="btn btn-secondary" id="btnDownloadTermAll">⬇️ Bulletins trimestriels (classe)</button>` : ""}
          ${!scoped ? `<button class="btn btn-secondary" id="btnHonorAll">🏅 Tous les tableaux d'honneur</button>` : ""}
          <button class="btn btn-secondary" id="btnHonorRoll">🏅 Tableau d'honneur</button>
          <button class="btn" id="btnGenerate">👁️ Aperçu du bulletin</button>
        </div>
        <div id="bulletinArea"></div>
      </div>
    `;
    const classSel = container.querySelector("#bClass");
    const termSel = container.querySelector("#bTerm");
    const sequenceSel = container.querySelector("#bSequence");
    const studentSel = container.querySelector("#bStudent");

    function refreshSequences() {
      sequenceSel.innerHTML = Grades.sequencesForTerm(termSel.value).map((sequence) => `<option value="${sequence}">${sequence}</option>`).join("");
    }

    function refreshStudents() {
      const students = Storage.all("students").filter((s) => s.classId === classSel.value && (!scoped || scoped.includes(s.id))).sort(Utils.comparePeople);
      studentSel.innerHTML = students.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("") || "<option>Aucun élève</option>";
    }
    refreshSequences();
    refreshStudents();
    classSel.addEventListener("change", refreshStudents);
    termSel.addEventListener("change", refreshSequences);
    container.querySelector("#btnGenerate").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Préparation de l’aperçu…", async () => {
      if (!studentSel.value) return Utils.toast("Aucun élève sélectionné", "error");
      renderBulletin(studentSel.value, classSel.value, termSel.value, sequenceSel.value);
    }));
    container.querySelector("#btnDownloadSequence").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Génération du PDF…", async () => {
      if (!studentSel.value) return Utils.toast("Aucun élève sélectionné", "error");
      await downloadBulletinPdf(studentSel.value, classSel.value, termSel.value, sequenceSel.value, "sequence");
    }));
    container.querySelector("#btnDownloadTerm").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Génération du PDF…", async () => {
      if (!studentSel.value) return Utils.toast("Aucun élève sélectionné", "error");
      await downloadBulletinPdf(studentSel.value, classSel.value, termSel.value, sequenceSel.value, "term");
    }));
    container.querySelector("#btnDownloadSequenceAll")?.addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Génération des bulletins…", async () => {
      await downloadClassBulletins(classSel.value, termSel.value, sequenceSel.value, "sequence");
    }));
    container.querySelector("#btnDownloadTermAll")?.addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Génération des bulletins…", async () => {
      await downloadClassBulletins(classSel.value, termSel.value, sequenceSel.value, "term");
    }));
    container.querySelector("#btnHonorRoll").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Génération du tableau d’honneur…", async () => {
      if (!studentSel.value) return Utils.toast("Aucun élève sélectionné", "error");
      await downloadHonorRoll(studentSel.value, classSel.value, termSel.value);
    }));
    container.querySelector("#btnHonorAll")?.addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Génération des tableaux d’honneur…", async () => {
      await downloadClassHonorRolls(classSel.value, termSel.value);
    }));
  }

  function appreciationFromAvg(avg) {
    if (avg === null) return "-";
    if (avg >= 16) return "Excellent";
    if (avg >= 14) return "Très bien";
    if (avg >= 12) return "Bien";
    if (avg >= 10) return "Assez bien";
    return "Insuffisant";
  }

  function evaluationCategory(type) {
    const categories = Storage.db().settings.bulletin?.evaluationCategories || {};
    const saved = categories[type];
    if (saved === "weekly" || saved === "harmonized") return saved;
    return /hebdo|weekly/i.test(type) ? "weekly" : "harmonized";
  }

  function categoryAverage(grades, category) {
    const values = grades.filter((grade) => evaluationCategory(grade.type) === category).map((grade) => (grade.value / grade.max) * 20);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function buildBulletinHtml(studentId, classId, term, sequence) {
    const s = Storage.get("students", studentId);
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const sequences = Grades.sequencesForTerm(term);
    const subjectIds = (c?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((sub) => subjectIds.includes(sub.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const classStudents = Storage.all("students").filter((student) => student.classId === classId);
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);

    const rows = subjects.map((subj) => {
      const avg = Grades.studentAverageForSubject(studentId, subj.id, term, sequence);
      const st = (c.subjectTeachers || []).find((x) => x.subjectId === subj.id);
      const teacher = teachers.find((t) => t.id === st?.teacherId);
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subj.id && grade.term === term && Grades.gradeSequence(grade) === sequence);
      return { subj, avg, teacher, grades, harmonizedAverage: categoryAverage(grades, "harmonized"), weeklyAverage: categoryAverage(grades, "weekly") };
    });

    const general = Grades.studentGeneralAverage(studentId, classId, term, sequence);
    const ranking = Grades.classRanking(classId, term, sequence);
    const rank = ranking.findIndex((r) => r.student.id === studentId);

    return `
      <div class="bulletin">
        <div class="bulletin-header">
          <div>
            <p style="margin:0;font-weight:700;">REPUBLIQUE DU CAMEROUN</p>
            <p style="margin:2px 0;font-size:11px;">Paix — Travail — Patrie</p>
            <h2 style="margin:8px 0 2px;">${Utils.escapeHtml(bulletinSettings.institution || settings.schoolName)}</h2>
            <p style="margin:2px 0;font-size:11px;">${Utils.escapeHtml(bulletinSettings.ministry || "MINISTERE DES ENSEIGNEMENTS SECONDAIRES")}</p>
            <p style="margin:2px 0;font-size:11px;">${Utils.escapeHtml(bulletinSettings.address || "")} — Tél. : ${Utils.escapeHtml(bulletinSettings.phone || "")}</p>
          </div>
          <div style="text-align:right;">
            <h3 style="margin:0 0 8px;">BULLETIN DE NOTES — ${Utils.escapeHtml(sequence).toUpperCase()}</h3>
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
        <div class="bulletin-table-wrap"><table>
          <thead><tr><th>Matière</th><th>Évaluation harmonisée</th><th>Évaluation hebdomadaire</th><th>Moy /20</th><th>Coef.</th><th>Enseignant</th><th>Appréciation</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td>${Utils.escapeHtml(r.subj.name)}</td>
                  <td>${r.harmonizedAverage !== null ? r.harmonizedAverage.toFixed(2) : "-"}</td>
                  <td>${r.weeklyAverage !== null ? r.weeklyAverage.toFixed(2) : "-"}</td>
                  <td>${r.avg !== null ? r.avg.toFixed(2) : "-"}</td>
                  <td>${r.subj.coefficient}</td>
                  <td>${r.teacher ? Utils.escapeHtml(r.teacher.firstName + " " + r.teacher.lastName) : "-"}</td>
                  <td>${appreciationFromAvg(r.avg)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table></div>
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

  function renderBulletin(studentId, classId, term, sequence) {
    const area = document.getElementById("bulletinArea");
    const html = buildBulletinHtml(studentId, classId, term, sequence);
    area.innerHTML = `<div id="bulletinPrintable">${html}</div>`;
  }

  async function downloadClassHonorRolls(classId, term) {
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const classItem = Storage.get("classes", classId);
    if (!classItem) return Utils.toast("Classe introuvable", "error");
    const honored = Storage.all("students")
      .filter((s) => s.classId === classId)
      .map((s) => ({ student: s, average: Grades.studentGeneralAverage(s.id, classId, term) }))
      .filter((x) => x.average !== null && x.average >= 12);
    if (!honored.length) return Utils.toast("Aucun élève de cette classe n'atteint 12/20", "error");
    const filename = `Tableaux-d-honneur-${classItem.name}-${term}.pdf`;
    try {
      const logo = await loadLogoDataUrl();
      const definitions = honored.map((x) => buildHonorRollDefinition(x.student, classItem, term, x.average, logo));
      const first = definitions.shift();
      definitions.forEach((definition) => first.content.push({ text: "", pageBreak: "before" }, ...definition.content));
      await Utils.downloadPdfMake(first, filename);
      Utils.toast("Tableaux d'honneur téléchargés", "success");
    } catch (error) {
      console.error("Erreur de génération des tableaux d'honneur", error);
      Utils.toast("Impossible de générer les tableaux d'honneur", "error");
    }
  }

  async function downloadClassBulletins(classId, term, sequence, periodType = "sequence") {
    const students = Storage.all("students").filter((s) => s.classId === classId).sort(Utils.comparePeople);
    if (students.length === 0) return Utils.toast("Aucun élève dans cette classe", "error");
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const classItem = Storage.get("classes", classId);
    const periodName = periodType === "term" ? term : sequence;
    const filename = `Bulletins-${periodName}-${classItem?.name || "classe"}.pdf`;
    try {
      const definitions = students.map((student) => buildBulletinPdfDefinition(student.id, classId, term, sequence, periodType));
      const first = definitions.shift();
      definitions.forEach((definition) => first.content.push({ text: "", pageBreak: "before" }, ...definition.content));
      await Utils.downloadPdfMake(first, filename);
      Utils.toast(`Bulletins ${periodType === "term" ? "trimestriels" : "séquentiels"} PDF téléchargés`, "success");
    } catch (error) {
      console.error("Erreur de génération des bulletins PDF", error);
      Utils.toast(`Échec du téléchargement PDF : ${error.message || error}`, "error");
    }
  }

  async function downloadBulletinPdf(studentId, classId, term, sequence, periodType = "sequence") {
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const student = Storage.get("students", studentId);
    const periodName = periodType === "term" ? term : sequence;
    const filename = `Bulletin-${student?.firstName || "eleve"}-${student?.lastName || ""}-${periodName}.pdf`;
    try {
      await Utils.downloadPdfMake(buildBulletinPdfDefinition(studentId, classId, term, sequence, periodType), filename);
      Utils.toast(`Bulletin ${periodType === "term" ? "trimestriel" : "séquentiel"} PDF téléchargé`, "success");
    } catch (error) {
      console.error("Erreur de génération du bulletin PDF", error);
      Utils.toast(`Échec du téléchargement PDF : ${error.message || error}`, "error");
    }
  }

  async function downloadHonorRoll(studentId, classId, term) {
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const student = Storage.get("students", studentId);
    const classItem = Storage.get("classes", classId);
    if (!student || !classItem) return Utils.toast("Élève ou classe introuvable", "error");
    const average = Grades.studentGeneralAverage(studentId, classId, term);
    if (average === null || average < 12) {
      return Utils.toast("Cet élève n'atteint pas encore 12/20 pour le Tableau d'honneur", "error");
    }
    const filename = `Tableau-d-honneur-${student.firstName}-${student.lastName}.pdf`;
    try {
      const logo = await loadLogoDataUrl();
      const definition = buildHonorRollDefinition(student, classItem, term, average, logo);
      await Utils.downloadPdfMake(definition, filename);
      Utils.toast("Tableau d'honneur téléchargé", "success");
    } catch (error) {
      console.error("Erreur de génération du tableau d'honneur", error);
      Utils.toast("Impossible de générer le tableau d'honneur", "error");
    }
  }

  function buildHonorRollDefinition(student, classItem, term, average, logo) {
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const isCongratulations = average >= 14;
    const teachers = Storage.all("teachers");
    const mainTeacher = teachers.find((teacher) => teacher.id === classItem.mainTeacherId);
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    return {
      pageSize: "A4",
      pageMargins: [28, 28, 28, 28],
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      background: () => ({
        canvas: [
          { type: "rect", x: 14, y: 14, w: 567, h: 813, lineWidth: 4, lineColor: "16834b" },
          { type: "rect", x: 21, y: 21, w: 553, h: 799, lineWidth: 4, lineColor: "ed1c24" },
          { type: "rect", x: 28, y: 28, w: 539, h: 785, lineWidth: 4, lineColor: "ffd900" },
        ],
      }),
      content: [
        { table: { widths: ["*", 80, "*"], body: [[
          { stack: [{ text: "REPUBLIQUE DU CAMEROUN", bold: true }, { text: "PAIX - TRAVAIL - PATRIE", fontSize: 7 }, { text: bulletinSettings.ministry || "MINISTERE DES ENSEIGNEMENTS SECONDAIRES", fontSize: 7 }, { text: "DELEGATION REGIONALE DU CENTRE", fontSize: 7 }, { text: "DELEGATION DEPARTEMENTALE DU MFOUNDI", fontSize: 7 }, { text: bulletinSettings.institution || settings.schoolName, bold: true, fontSize: 8 }, { text: "B.P : " + (bulletinSettings.address || "YDE") + " - Tél. : " + (bulletinSettings.phone || ""), fontSize: 7 }], alignment: "center" },
          logo ? { image: "establishmentLogo", width: 68, alignment: "center", margin: [0, 18, 0, 0] } : { text: "", style: "emptyCell" },
          { stack: [{ text: "REPUBLIC OF CAMEROON", bold: true }, { text: "PEACE - WORK - FATHERLAND", fontSize: 7 }, { text: "MINISTRY OF SECONDARY EDUCATION", fontSize: 7 }, { text: "REGIONAL DELEGATION OF THE CENTER", fontSize: 7 }, { text: "DIVISIONAL DELEGATION OF MFOUNDI", fontSize: 7 }, { text: bulletinSettings.institution || settings.schoolName, bold: true, fontSize: 8 }, { text: "PO BOX : YDE - Phone: " + (bulletinSettings.phone || ""), fontSize: 7 }], alignment: "center" },
        ]] }, layout: "noBorders", margin: [12, 8, 12, 30] },
        { text: "Tableau d’Honneur / HONOUR ROLL", style: "honorTitle", margin: [0, 0, 0, 22] },
        { text: "Le conseil de classe, en vertu des pouvoirs qui lui sont conférés décerne le tableau d’honneur", alignment: "center", fontSize: 10, margin: [0, 0, 0, 4] },
        { text: "By virtue of the power conferred to it, the class council awards an honour roll", alignment: "center", italics: true, fontSize: 10, margin: [0, 0, 0, 26] },
        { text: [{ text: "A l’élève : ", italics: false }, { text: student.firstName + " " + student.lastName, bold: true, italics: true }, { text: "                                      Matricule : " }, { text: student.matricule || "-", bold: true, italics: true }], fontSize: 12, margin: [20, 0, 20, 18] },
        { text: [{ text: "Né(e) le    " }, { text: Utils.formatDate(student.dob), bold: true, italics: true }, { text: "                 à    " }, { text: student.pob || "-", bold: true, italics: true }, { text: "       de la classe de    " }, { text: classItem.name, bold: true, italics: true }], fontSize: 12, margin: [20, 0, 20, 20] },
        { text: [{ text: "Pour son travail durant l’année scolaire    " }, { text: settings.currentYear, bold: true, italics: true }], fontSize: 12, margin: [20, 0, 20, 28] },
        { columns: [
          { stack: [{ text: "Moyenne obtenue", fontSize: 12 }, { text: average.toFixed(2).replace(".", ","), style: "averageValue" }, { text: "Average obtained", italics: true, fontSize: 9 }], width: "55%" },
          { stack: [{ text: date, alignment: "center", fontSize: 11 }, { text: "Yaoundé, le", alignment: "center", italics: true, fontSize: 9 }], width: "45%" },
        ], margin: [20, 0, 20, 28] },
        { columns: [
          { stack: [{ text: "☐    Avec encouragements", fontSize: 10, color: average >= 12 ? "222222" : "999999" }, { text: "☐    Avec félicitations", fontSize: 10, color: isCongratulations ? "222222" : "999999", margin: [0, 10, 0, 0] }], width: "55%" },
          { stack: [{ text: "LE PRINCIPAL / THE PRINCIPAL", bold: true, italics: true, alignment: "center", margin: [0, 18, 0, 0] }, { text: mainTeacher ? mainTeacher.firstName + " " + mainTeacher.lastName : "", alignment: "center", fontSize: 9, margin: [0, 18, 0, 0] }], width: "45%" },
        ], margin: [20, 0, 20, 0] },
      ],
      styles: {
        honorTitle: { color: "174a9c", bold: true, italics: true, fontSize: 25, alignment: "center" },
        averageValue: { bold: true, italics: true, fontSize: 20, decoration: "underline", margin: [100, 0, 0, 0] },
        emptyCell: { text: "", fillColor: "white" },
      },
      defaultStyle: { font: "Roboto", fontSize: 9 },
    };
  }

  function loadLogoDataUrl() {
    const logo = Storage.db().settings.bulletin?.logo || "";
    if (!logo || logo.startsWith("data:")) return Promise.resolve(logo);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext("2d").drawImage(image, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (e) {
          // Canvas "tainted" en file:// : on g\u00e9n\u00e8re le PDF sans logo
          resolve("");
        }
      };
      image.onerror = () => resolve("");
      image.src = logo;
    });
  }

  function buildBulletinPdfDefinition(studentId, classId, term, sequence, periodType = "sequence") {
    const s = Storage.get("students", studentId);
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const selectedSequence = periodType === "term" ? null : sequence;
    const periodLabel = periodType === "term" ? term : sequence;
    const subjects = Storage.all("subjects").filter((subject) => (c?.subjectTeachers || []).some((st) => st.subjectId === subject.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);
    const classStudents = Storage.all("students").filter((student) => student.classId === classId);
    const ranking = Grades.classRanking(classId, term, selectedSequence);
    const rank = ranking.findIndex((item) => item.student.id === studentId);
    const general = Grades.studentGeneralAverage(studentId, classId, term, selectedSequence);
    const classAverage = ranking.length ? ranking.reduce((sum, item) => sum + item.avg, 0) / ranking.length : null;
    const rowsByGroup = { general: [], technical: [], complementary: [] };
    const groupForSubject = (name) => {
      const normalized = name.toUpperCase();
      if (/COUTURE|CULINAIRE|TRAVAIL MANUEL|DESSIN|TECHNIQUE|TECHNOLOGIE|INFORMATIQUE|LEGISLATION/.test(normalized)) return "technical";
      if (/EPS|SPORT|EDUCATION ARTISTIQUE/.test(normalized)) return "complementary";
      return "general";
    };
    subjects.forEach((subject) => {
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subject.id && grade.term === term && (periodType === "term" || Grades.gradeSequence(grade) === sequence));
      const average = Grades.studentAverageForSubject(studentId, subject.id, term, selectedSequence);
      const classRanking = Grades.classRanking(classId, term, selectedSequence);
      const classSubjectAverage = Grades.classAverageForSubject(classId, subject.id, term, selectedSequence);
      const assignment = (c.subjectTeachers || []).find((st) => st.subjectId === subject.id);
      const teacher = teachers.find((item) => item.id === assignment?.teacherId);
      rowsByGroup[groupForSubject(subject.name)].push({
        subject,
        grades,
        harmonizedAverage: categoryAverage(grades, "harmonized"),
        weeklyAverage: categoryAverage(grades, "weekly"),
        average,
        classSubjectAverage,
        teacher,
        rank: classRanking.findIndex((item) => item.student.id === studentId) + 1,
      });
    });
    const tableHeader = [
      { text: "Matieres", style: "tableHeader" }, { text: "Enseignant", style: "tableHeader" },
      { text: "Eval. harmonisee", style: "tableHeader" }, { text: "Eval. hebdomadaire", style: "tableHeader" },
      { text: "Moy/20", style: "tableHeader" }, { text: "Coef.", style: "tableHeader" },
      { text: "MoyxCoef", style: "tableHeader" }, { text: "Rang", style: "tableHeader" },
      { text: "Moyenne classe", style: "tableHeader" }, { text: "Notes /20", style: "tableHeader" },
      { text: "Appreciations", style: "tableHeader" },
    ];
    const totalLabelColumnCount = 5;
    const bulletinColumnWidths = [82, 68, 51, 56, 38, 25, 39, 27, 40, 30, 66];
    const groupLabels = { general: "TOTAL ENSEIGNEMENT GENERAL", technical: "TOTAL ENSEIGNEMENT TECHNIQUE ET PROFESSIONNEL", complementary: "TOTAL ENSEIGNEMENT COMPLEMENTAIRE" };
    const body = [tableHeader];
    const totals = {};
    Object.keys(rowsByGroup).forEach((group) => {
      const groupRows = rowsByGroup[group];
      if (!groupRows.length) return;
      groupRows.forEach((row) => {
        body.push([
          { text: row.subject.name, bold: true },
          row.teacher ? row.teacher.firstName + " " + row.teacher.lastName : "-",
          row.harmonizedAverage === null ? "-" : row.harmonizedAverage.toFixed(2),
          row.weeklyAverage === null ? "-" : row.weeklyAverage.toFixed(2),
          row.average === null ? "-" : row.average.toFixed(2), row.subject.coefficient,
          row.average === null ? "-" : (row.average * row.subject.coefficient).toFixed(2),
          row.rank > 0 ? row.rank + "e" : "-", row.classSubjectAverage === null ? "-" : row.classSubjectAverage.toFixed(2),
          row.grades.length, appreciationFromAvg(row.average),
        ]);
      });
      const totalCoef = groupRows.reduce((sum, row) => sum + Number(row.subject.coefficient || 0), 0);
      const totalPoints = groupRows.reduce((sum, row) => sum + (row.average === null ? 0 : row.average * row.subject.coefficient), 0);
      const groupAverage = totalCoef ? totalPoints / totalCoef : null;
      totals[group] = { totalCoef, totalPoints, groupAverage };
      body.push([
        { text: groupLabels[group], colSpan: totalLabelColumnCount, bold: true, fillColor: "d7d7f5" },
        ...Array.from({ length: totalLabelColumnCount - 1 }, () => ({ text: "", style: "emptyCell" })),
        { text: totalCoef.toFixed(1), bold: true, fillColor: "d7d7f5" },
        { text: totalPoints.toFixed(2), bold: true, fillColor: "d7d7f5" }, { text: "", style: "emptyCell" },
        { text: "Moyenne :", bold: true, fillColor: "d7d7f5" },
        { text: groupAverage === null ? "-" : groupAverage.toFixed(2) + " / 20", bold: true, fillColor: "d7d7f5" }, { text: "", style: "emptyCell" },
      ]);
    });
    const totalCoef = subjects.reduce((sum, subject) => sum + Number(subject.coefficient || 0), 0);
    const totalPoints = subjects.reduce((sum, subject) => {
      const average = Grades.studentAverageForSubject(studentId, subject.id, term, selectedSequence);
      return sum + (average === null ? 0 : average * subject.coefficient);
    }, 0);
    const decision = general !== null && general >= 10 ? "Admis(e) en classe superieure" : "A redoubler / a surveiller";
    const identityRows = [
      [{ text: "NOMS ET PRENOMS", style: "labelCell" }, { text: s.firstName + " " + s.lastName, style: "valueCell" }, { text: "CLASSE", style: "labelCell" }, { text: c?.name || "-", style: "valueCell" }],
      [{ text: "MATRICULE ELEVE", style: "labelCell" }, { text: s.matricule || "-", style: "valueCell" }, { text: "SEXE", style: "labelCell" }, { text: s.gender || "-", style: "valueCell" }],
      [{ text: "DATE ET LIEU DE NAISSANCE", style: "labelCell" }, { text: Utils.formatDate(s.dob) + " a " + (s.pob || "-"), style: "valueCell" }, { text: "REDOUBLANT", style: "labelCell" }, { text: "Non", style: "valueCell" }],
      [{ text: "PROFESSEUR PRINCIPAL", style: "labelCell" }, { text: mainTeacher ? mainTeacher.firstName + " " + mainTeacher.lastName : "-", style: "valueCell" }, { text: "EFFECTIF", style: "labelCell" }, { text: classStudents.length, style: "valueCell" }],
    ];
    return {
      pageSize: "A4", pageMargins: [18, 12, 18, 12],
      content: [
        { table: { widths: ["*", "*"], body: [[{ stack: [{ text: "REPUBLIQUE DU CAMEROUN", bold: true }, { text: "PAIX - TRAVAIL - PATRIE", fontSize: 6 }, { text: bulletinSettings.ministry || "MINISTERE DES ENSEIGNEMENTS SECONDAIRES", fontSize: 6 }, { text: bulletinSettings.institution || settings.schoolName, bold: true, fontSize: 8 }], alignment: "center" }, { stack: [{ text: "REPUBLIC OF CAMEROON", bold: true }, { text: "PEACE - WORK - FATHERLAND", fontSize: 6 }, { text: "MINISTRY OF SECONDARY EDUCATION", fontSize: 6 }, { text: bulletinSettings.institution || settings.schoolName, bold: true, fontSize: 8 }], alignment: "center" }]] }, layout: "noBorders", margin: [0, 0, 0, 2] },
        { text: "B.P : " + (bulletinSettings.address || "YDE") + " - Tel. : " + (bulletinSettings.phone || "") + "                 ANNEE SCOLAIRE / ACADEMIC YEAR : " + settings.currentYear, alignment: "center", fontSize: 6.5, margin: [0, 0, 0, 4] },
        { table: { widths: ["*"], body: [[{ text: "BULLETIN DE NOTES — " + periodLabel.toUpperCase(), style: "bulletinTitle" }]] }, layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => "222222", vLineColor: () => "222222", paddingTop: () => 2, paddingBottom: () => 2 }, margin: [70, 0, 70, 5] },
        { table: { widths: [100, "*", 55, 55], body: identityRows }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { headerRows: 1, widths: bulletinColumnWidths, body }, fontSize: 5.7, layout: { hLineWidth: () => 0.45, vLineWidth: () => 0.45, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 2.2, paddingBottom: () => 2.2 } },
        { table: { widths: ["*", 65, 65, 65], body: [[{ text: "RESULTAT DE " + periodLabel.toUpperCase(), style: "summaryHeader", colSpan: 4 }, { text: "", style: "emptyCell" }, { text: "", style: "emptyCell" }, { text: "", style: "emptyCell" }], ["Moyenne de l'eleve", general === null ? "-" : general.toFixed(2) + " / 20", "Rang de l'eleve", rank >= 0 ? rank + 1 + " / " + ranking.length : "-"], ["Total des points", totalPoints.toFixed(2), "Total des coefficients", totalCoef.toFixed(1)], ["Moyenne de la classe", classAverage === null ? "-" : classAverage.toFixed(2), "Appreciation", appreciationFromAvg(general)]] }, fontSize: 6.5, margin: [0, 6, 0, 4] },
        { table: { widths: ["*", 75, "*", 75], body: [[{ text: "RAPPELS MOYENNES", style: "summaryHeader" }, { text: "", style: "emptyCell" }, { text: "PROFIL DE LA CLASSE", style: "summaryHeader" }, { text: "", style: "emptyCell" }], ["Moyenne > 10", general !== null && general >= 10 ? "Oui" : "Non", "Moyenne de la classe", classAverage === null ? "-" : classAverage.toFixed(2)], ["Travail de l'eleve", general !== null && general >= 10 ? "Encourageant" : "A ameliorer", "Decision du conseil", decision]] }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { widths: ["*", "*", "*"], body: [[{ text: "TRAVAIL DE L'ELEVE", style: "summaryHeader" }, { text: "CONDUITE DE L'ELEVE", style: "summaryHeader" }, { text: "DECISION DU CONSEIL DE CLASSE", style: "summaryHeader" }], [general !== null && general >= 10 ? "Travail passable" : "Travail a ameliorer", "Aucune observation", decision]] }, fontSize: 6.5, margin: [0, 0, 0, 8] },
        { text: "Le bulletin est delivre sans rature ni surcharge.", italics: true, alignment: "center", fontSize: 6.5, margin: [0, 2, 0, 18] },
        { table: { widths: ["*", "*", "*"], body: [[{ text: "VISA DU PARENT", alignment: "center", bold: true }, { text: "OBTIENT LA MOYENNE DANS " + subjects.filter((subject) => { const average = Grades.studentAverageForSubject(studentId, subject.id, term, selectedSequence); return average !== null && average >= 10; }).length + " MATIERE(S)", alignment: "center", bold: true }, { text: "VISA DU CHEF D'ETABLISSEMENT", alignment: "center", bold: true }], [{ text: "", margin: [0, 26, 0, 0] }, { text: general !== null && general >= 10 ? "TABLEAU D'HONNEUR" : "UN EFFORT S'IMPOSE", alignment: "center", margin: [0, 26, 0, 0] }, { text: "Le Principal", alignment: "center", margin: [0, 26, 0, 0] }]] }, fontSize: 6.5, margin: [0, 0, 0, 4] },
        { text: "Legende : NA=NON ACQUIS, ECA=EN COURS D'ACQUISITION, A=ACQUIS, A+=PARFAITEMENT ACQUIS", alignment: "center", fontSize: 5.5, margin: [0, 4, 0, 0] },
      ],
      styles: {
        tableHeader: { bold: true, color: "white", fillColor: "2f6fed", alignment: "center" },
        bulletinTitle: { bold: true, fontSize: 11, alignment: "center" },
        labelCell: { bold: true, fillColor: "eeeeee", alignment: "center" },
        valueCell: { bold: true, alignment: "center" },
        summaryHeader: { bold: true, fillColor: "d7d7f5", alignment: "center" },
        emptyCell: { text: "", fillColor: "white", color: "black" },
      },
      defaultStyle: { font: "Roboto", fontSize: 8 },
    };
  }

  return { render, loadLogoDataUrl };
})();
