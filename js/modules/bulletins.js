/**
 * Module Bulletins : génération automatique des bulletins trimestriels/semestriels,
 * moyennes par matière et générale, rang, appréciations, décision de passage, impression PDF.
 */
const Bulletins = (() => {
  const BULLETIN_GROUPS = {
    languages: "TOTAL OF LANGUAGES AND LECTURE",
    humanSocial: "TOTAL OF HUMAN AND SOCIAL SCIENCES",
    sciencesTechnology: "TOTAL OF SCIENCES AND TECHNOLOGY",
    other: "TOTAL OF OTHER SUBJECTS",
  };
  const BULLETIN_SUBJECT_ORDER = [
    "ENGLISH LANGUAGE", "ENGLISH LITERATURE", "ENGLISH LITTERATURE", "FRENCH",
    "CITIZENSHIP", "CITYZENSHIP", "HOME ECONOMICS", "GEOGRAPHY", "HISTORY",
    "MATHEMATICS", "MATH", "MATHS", "BIOLOGY", "ICT COMPUTER SCIENCE", "ICT", "COMPUTER SCIENCE", "PHYSICS", "CHEMISTRY", "CHEMESTRY",
    "MANUAL LABOR", "MANUAL LABOUR", "SPORTS PES",
  ];

  function subjectGroup(name) {
    const normalized = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    if (["ENGLISH LANGUAGE", "ENGLISH LITERATURE", "ENGLISH LITTERATURE", "FRENCH"].includes(normalized)) return "languages";
    if (["CITIZENSHIP", "CITYZENSHIP", "HOME ECONOMICS", "GEOGRAPHY", "HISTORY"].includes(normalized)) return "humanSocial";
    if (["MATH", "MATHS", "MATHEMATICS", "BIOLOGY", "PHYSICS", "CHEMISTRY", "CHEMESTRY"].includes(normalized) || normalized.includes("ICT") || normalized.includes("COMPUTER SCIENCE")) return "sciencesTechnology";
    return "other";
  }

  function compareBulletinSubjects(left, right) {
    const normalize = (name) => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    const leftName = normalize(left.subj?.name || left.subject?.name);
    const rightName = normalize(right.subj?.name || right.subject?.name);
    const leftOrder = BULLETIN_SUBJECT_ORDER.indexOf(leftName);
    const rightOrder = BULLETIN_SUBJECT_ORDER.indexOf(rightName);
    const leftIndex = leftOrder < 0 ? BULLETIN_SUBJECT_ORDER.length : leftOrder;
    const rightIndex = rightOrder < 0 ? BULLETIN_SUBJECT_ORDER.length : rightOrder;
    return leftIndex - rightIndex || leftName.localeCompare(rightName);
  }

  function ordinalRank(rank) {
    if (rank <= 0) return "-";
    const remainder = rank % 100;
    const suffix = remainder >= 11 && remainder <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[rank % 10] || "th");
    return rank + suffix;
  }

  function displayPeriod(period) {
    return String(period || "").replace(/^trimestre\s+/i, "Term ").replace(/^séquence\s+/i, "Sequence ");
  }

  function displayGender(gender) {
    const normalized = String(gender || "").toLowerCase();
    if (["m", "masculin", "homme"].includes(normalized)) return "Male";
    if (["f", "féminin", "feminin", "femme"].includes(normalized)) return "Female";
    return gender || "-";
  }

  function institutionNames(bulletinSettings, settings) {
    const french = bulletinSettings.institution || settings.schoolName;
    const english = String(french || "").replace(/^FONDATION SCOLAIRE\s+(.+)$/i, "$1 FOUNDATION SCHOOL");
    return { french, english: english || french };
  }

  function bulletinLogoSource(bulletinSettings) {
    const logo = bulletinSettings.logo || "";
    if (logo === "assets/logo-etablissement.jpg") return logo;
    return Utils.safeImageSrc(logo);
  }

  function canAccessStudent(studentId) {
    const scoped = Auth.scopedStudentIds();
    return !scoped || scoped.includes(studentId);
  }

  function canAccessClass(classId) {
    const scoped = Auth.scopedStudentIds();
    return !scoped || Storage.all("students").some((student) => scoped.includes(student.id) && student.classId === classId);
  }

  function render(container) {
    const scoped = Auth.scopedStudentIds();
    const classes = Storage.all("classes").filter((c) => {
      if (!scoped) return true;
      return Storage.all("students").some((s) => scoped.includes(s.id) && s.classId === c.id);
    }).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="bClass" ${scoped && classes.length <= 1 ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select>
          <select id="bTerm">${Grades.TERMS.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          <select id="bSequence" aria-label="Séquence"></select>
          <select id="bStudent" ${scoped && scoped.length <= 1 ? "disabled" : ""}></select>
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
    if (avg >= 14) return "Very good";
    if (avg >= 12) return "Good";
    if (avg >= 10) return "Fair";
    return "Insufficient";
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
    const institution = institutionNames(bulletinSettings, settings);
    const logoSrc = bulletinLogoSource(bulletinSettings);
    const scoped = Auth.scopedStudentIds();
    const sequences = Grades.sequencesForTerm(term);
    const subjectIds = (c?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((sub) => subjectIds.includes(sub.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const classStudents = scoped ? [] : Storage.all("students").filter((student) => student.classId === classId);
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);

    const rows = subjects.map((subj) => {
      const avg = Grades.studentAverageForSubject(studentId, subj.id, term, sequence);
      const st = (c.subjectTeachers || []).find((x) => x.subjectId === subj.id);
      const teacher = teachers.find((t) => t.id === st?.teacherId);
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subj.id && grade.term === term && Grades.gradeSequence(grade) === sequence);
      return { subj, avg, teacher, grades, coefficient: Storage.subjectCoefficient(classId, subj.id), harmonizedAverage: categoryAverage(grades, "harmonized"), weeklyAverage: categoryAverage(grades, "weekly") };
    });
    const rowsByGroup = Object.fromEntries(Object.keys(BULLETIN_GROUPS).map((group) => [group, rows.filter((row) => subjectGroup(row.subj.name) === group).sort(compareBulletinSubjects)]));

    const general = Grades.studentGeneralAverage(studentId, classId, term, sequence);
    const ranking = scoped ? [] : Grades.classRanking(classId, term, sequence);
    const rank = ranking.findIndex((r) => r.student.id === studentId);

    return `
      <div class="bulletin">
        <div class="bulletin-header">
          <div>
            <p style="margin:0;font-weight:700;">RÉPUBLIQUE DU CAMEROUN</p>
            <p style="margin:2px 0;font-size:11px;">PAIX - TRAVAIL - PATRIE</p>
            <p style="margin:2px 0;font-size:11px;">MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES</p>
            <p style="margin:2px 0;font-size:11px;">DÉLÉGATION RÉGIONALE DU CENTRE</p>
            <p style="margin:2px 0;font-size:11px;">DÉLÉGATION DÉPARTEMENTALE DU MFOUNDI</p>
            <h2 style="margin:4px 0 2px;">${Utils.escapeHtml(institution.french)}</h2>
            <p style="margin:2px 0;font-size:11px;">B.P. : ${Utils.escapeHtml(bulletinSettings.address || "YDE")} - Tél. : ${Utils.escapeHtml(bulletinSettings.phone || "")}</p>
          </div>
          <div class="bulletin-header-logo">${logoSrc ? `<img src="${Utils.escapeHtml(logoSrc)}" alt="School logo">` : ""}</div>
          <div style="text-align:right;">
            <p style="margin:0;font-weight:700;">REPUBLIC OF CAMEROON</p>
            <p style="margin:2px 0;font-size:11px;">PEACE - WORK - FATHERLAND</p>
            <p style="margin:2px 0;font-size:11px;">MINISTRY OF SECONDARY EDUCATION</p>
            <p style="margin:2px 0;font-size:11px;">REGIONAL DELEGATION OF THE CENTRE</p>
            <p style="margin:2px 0;font-size:11px;">DIVISIONAL DELEGATION OF MFOUNDI</p>
            <h2 style="margin:4px 0 2px;">${Utils.escapeHtml(institution.english)}</h2>
            <p style="margin:2px 0;font-size:11px;">P.O. BOX: ${Utils.escapeHtml(bulletinSettings.address || "YDE")} - Phone: ${Utils.escapeHtml(bulletinSettings.phone || "")}</p>
          </div>
        </div>
        <h3 style="margin:0 0 10px;text-align:center;">STUDENT REPORT — ${Utils.escapeHtml(displayPeriod(sequence)).toUpperCase()}</h3>
        <div class="bulletin-meta">
          <span><strong>Date and place of birth:</strong> ${Utils.formatDate(s.dob)} in ${Utils.escapeHtml(s.pob || "-")}</span>
          <span><strong>Gender:</strong> ${Utils.escapeHtml(displayGender(s.gender))}</span>
          ${scoped ? "" : `<span><strong>Class size:</strong> ${classStudents.length}</span>`}
          <span><strong>Class teacher:</strong> ${mainTeacher ? Utils.escapeHtml(mainTeacher.firstName + " " + mainTeacher.lastName) : "-"}</span>
        </div>
        <div class="bulletin-table-wrap"><table>
          <thead><tr><th>Subject</th><th>Harmonized assessment</th><th>Weekly assessment</th><th>Average /20</th><th>Coef.</th><th>Teacher</th><th>Appreciation</th></tr></thead>
          ${Object.entries(rowsByGroup).map(([group, groupRows]) => {
            if (!groupRows.length) return "";
            const totalCoefficient = groupRows.reduce((sum, row) => sum + Number(row.coefficient || 0), 0);
            const totalPoints = groupRows.reduce((sum, row) => sum + (row.avg === null ? 0 : row.avg * row.coefficient), 0);
            const groupAverage = totalCoefficient ? totalPoints / totalCoefficient : null;
            return `<tbody>${groupRows
              .map(
                (r) => `<tr>
                  <td>${Utils.escapeHtml(r.subj.name)}</td>
                  <td>${r.harmonizedAverage !== null ? r.harmonizedAverage.toFixed(2) : "-"}</td>
                  <td>${r.weeklyAverage !== null ? r.weeklyAverage.toFixed(2) : "-"}</td>
                  <td>${r.avg !== null ? r.avg.toFixed(2) : "-"}</td>
                  <td>${r.coefficient}</td>
                  <td>${r.teacher ? Utils.escapeHtml(r.teacher.firstName + " " + r.teacher.lastName) : "-"}</td>
                  <td>${appreciationFromAvg(r.avg)}</td>
                </tr>`
              )
              .join("")}
            <tr class="bulletin-group-total"><td colspan="4"><strong>${BULLETIN_GROUPS[group]}</strong></td><td><strong>${totalCoefficient.toFixed(1)}</strong></td><td></td><td><strong>Average: ${groupAverage !== null ? groupAverage.toFixed(2) + " / 20" : "-"}</strong></td></tr></tbody>`;
          }).join("")}
        </table></div>
        <hr class="sep">
        <div class="form-grid">
          <div><strong>Overall average:</strong> ${general !== null ? general.toFixed(2) : "-"} /20</div>
          ${scoped ? "" : `<div><strong>Class rank:</strong> ${rank >= 0 ? rank + 1 + " / " + ranking.length : "-"}</div>`}
          <div><strong>Overall assessment:</strong> ${appreciationFromAvg(general)}</div>
          <div><strong>Student conduct:</strong> ${general !== null && general >= 10 ? "Satisfactory work" : "Needs improvement"}</div>
          <div><strong>Class council assessment:</strong> ${appreciationFromAvg(general)}</div>
          <div><strong>Promotion decision:</strong> ${general !== null && general >= 10 ? "Promoted to the next class" : "Repeat the class / close monitoring"}</div>
        </div>
        <p style="margin-top:18px;font-size:11px;">This report card is issued without erasure or alteration.</p>
        <div class="signature-row">
          <div>The class teacher</div>
          <div>The principal</div>
        </div>
      </div>
    `;
  }

  function renderBulletin(studentId, classId, term, sequence) {
    if (!canAccessStudent(studentId) || !canAccessClass(classId) || Storage.get("students", studentId)?.classId !== classId) {
      return Utils.toast("Ce bulletin n'est pas associé à votre compte.", "error");
    }
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
      await Storage.logAction(`Téléchargement de tableaux d’honneur : classe « ${classItem.name} », période « ${term} », ${honored.length} élève(s), fichier « ${filename} »`);
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
      const logo = await loadLogoDataUrl();
      const definitions = students.map((student) => buildBulletinPdfDefinition(student.id, classId, term, sequence, periodType, logo));
      const first = definitions.shift();
      definitions.forEach((definition) => first.content.push({ text: "", pageBreak: "before" }, ...definition.content));
      await Utils.downloadPdfMake(first, filename);
      await Storage.logAction(`Téléchargement de bulletins ${periodType === "term" ? "trimestriels" : "séquentiels"} : classe « ${classItem?.name || "classe"} », période « ${periodName} », ${students.length} élève(s), fichier « ${filename} »`);
      Utils.toast(`Bulletins ${periodType === "term" ? "trimestriels" : "séquentiels"} PDF téléchargés`, "success");
    } catch (error) {
      console.error("Erreur de génération des bulletins PDF", error);
      Utils.toast(`Échec du téléchargement PDF : ${error.message || error}`, "error");
    }
  }

  async function downloadBulletinPdf(studentId, classId, term, sequence, periodType = "sequence") {
    if (!canAccessStudent(studentId) || !canAccessClass(classId) || Storage.get("students", studentId)?.classId !== classId) {
      return Utils.toast("Ce bulletin n'est pas associé à votre compte.", "error");
    }
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const student = Storage.get("students", studentId);
    const periodName = periodType === "term" ? term : sequence;
    const filename = `Bulletin-${student?.firstName || "eleve"}-${student?.lastName || ""}-${periodName}.pdf`;
    try {
      const logo = await loadLogoDataUrl();
      await Utils.downloadPdfMake(buildBulletinPdfDefinition(studentId, classId, term, sequence, periodType, logo), filename);
      await Storage.logAction(`Téléchargement d’un bulletin ${periodType === "term" ? "trimestriel" : "séquentiel"} : élève « ${student.firstName} ${student.lastName} », classe « ${Storage.get("classes", classId)?.name || "classe"} », période « ${periodName} », fichier « ${filename} »`);
      Utils.toast(`Bulletin ${periodType === "term" ? "trimestriel" : "séquentiel"} PDF téléchargé`, "success");
    } catch (error) {
      console.error("Erreur de génération du bulletin PDF", error);
      Utils.toast(`Échec du téléchargement PDF : ${error.message || error}`, "error");
    }
  }

  async function downloadHonorRoll(studentId, classId, term) {
    if (!canAccessStudent(studentId) || !canAccessClass(classId) || Storage.get("students", studentId)?.classId !== classId) {
      return Utils.toast("Ce tableau d'honneur n'est pas associé à votre compte.", "error");
    }
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
      await Storage.logAction(`Téléchargement d’un tableau d’honneur : élève « ${student.firstName} ${student.lastName} », classe « ${classItem.name} », période « ${term} », fichier « ${filename} »`);
      Utils.toast("Tableau d'honneur téléchargé", "success");
    } catch (error) {
      console.error("Erreur de génération du tableau d'honneur", error);
      Utils.toast("Impossible de générer le tableau d'honneur", "error");
    }
  }

  function buildHonorRollDefinition(student, classItem, term, average, logo) {
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const scoped = Auth.scopedStudentIds();
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
    if (!logo) return Promise.resolve("");
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
          let left = width, top = height, right = -1, bottom = -1;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const offset = (y * width + x) * 4;
              const visible = data[offset + 3] > 16 && (data[offset] < 245 || data[offset + 1] < 245 || data[offset + 2] < 245);
              if (!visible) continue;
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
          if (right < left || bottom < top) return resolve(canvas.toDataURL("image/png"));
          const padding = Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.025);
          left = Math.max(0, left - padding);
          top = Math.max(0, top - padding);
          right = Math.min(width - 1, right + padding);
          bottom = Math.min(height - 1, bottom + padding);
          const cropped = document.createElement("canvas");
          cropped.width = right - left + 1;
          cropped.height = bottom - top + 1;
          cropped.getContext("2d").drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
          resolve(cropped.toDataURL("image/png"));
        } catch (e) {
          // Canvas "tainted" en file:// : on g\u00e9n\u00e8re le PDF sans logo
          resolve("");
        }
      };
      image.onerror = () => resolve("");
      image.src = logo;
    });
  }

  function buildBulletinPdfDefinition(studentId, classId, term, sequence, periodType = "sequence", logo = "") {
    const s = Storage.get("students", studentId);
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const institution = institutionNames(bulletinSettings, settings);
    const scoped = Auth.scopedStudentIds();
    const selectedSequence = periodType === "term" ? null : sequence;
    const periodLabel = periodType === "term" ? term : sequence;
    const subjects = Storage.all("subjects").filter((subject) => (c?.subjectTeachers || []).some((st) => st.subjectId === subject.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);
    const classStudents = scoped ? [] : Storage.all("students").filter((student) => student.classId === classId);
    const ranking = scoped ? [] : Grades.classRanking(classId, term, selectedSequence);
    const rank = ranking.findIndex((item) => item.student.id === studentId);
    const general = Grades.studentGeneralAverage(studentId, classId, term, selectedSequence);
    const classAverage = ranking.length ? ranking.reduce((sum, item) => sum + item.avg, 0) / ranking.length : null;
    const rowsByGroup = Object.fromEntries(Object.keys(BULLETIN_GROUPS).map((group) => [group, []]));
    subjects.forEach((subject) => {
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subject.id && grade.term === term && (periodType === "term" || Grades.gradeSequence(grade) === sequence));
      const average = Grades.studentAverageForSubject(studentId, subject.id, term, selectedSequence);
      const classRanking = scoped ? [] : Grades.classRankingForSubject(classId, subject.id, term, selectedSequence);
      const classSubjectAverage = scoped ? null : Grades.classAverageForSubject(classId, subject.id, term, selectedSequence);
      const assignment = (c.subjectTeachers || []).find((st) => st.subjectId === subject.id);
      const teacher = teachers.find((item) => item.id === assignment?.teacherId);
      rowsByGroup[subjectGroup(subject.name)].push({
        subject,
        grades,
        harmonizedAverage: categoryAverage(grades, "harmonized"),
        weeklyAverage: categoryAverage(grades, "weekly"),
        average,
        classSubjectAverage,
        coefficient: Storage.subjectCoefficient(classId, subject.id),
        teacher,
        rank: classRanking.findIndex((item) => item.student.id === studentId) + 1,
      });
    });
    Object.values(rowsByGroup).forEach((groupRows) => groupRows.sort(compareBulletinSubjects));
    const tableHeader = [
      ...["Subject", "Teacher", "Harmonized assessment", "Weekly assessment", "Average /20", "Coef.", "Average x coef.", "Rank", "Class average", "Number of marks", "Appreciation"]
        .map((text) => ({ text, style: "tableHeader", fillColor: "#4abdec", color: "#000000" })),
    ];
    const totalLabelColumnCount = 5;
    const bulletinColumnWidths = [82, 68, 51, 56, 38, 25, 39, 27, 40, 30, 66];
    const groupLabels = BULLETIN_GROUPS;
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
          row.average === null ? "-" : row.average.toFixed(2), row.coefficient,
          row.average === null ? "-" : (row.average * row.coefficient).toFixed(2),
          ordinalRank(row.rank), row.classSubjectAverage === null ? "-" : row.classSubjectAverage.toFixed(2),
          row.grades.length, appreciationFromAvg(row.average),
        ]);
      });
      const totalCoef = groupRows.reduce((sum, row) => sum + Number(row.coefficient || 0), 0);
      const totalPoints = groupRows.reduce((sum, row) => sum + (row.average === null ? 0 : row.average * row.coefficient), 0);
      const groupAverage = totalCoef ? totalPoints / totalCoef : null;
      totals[group] = { totalCoef, totalPoints, groupAverage };
      body.push([
        { text: groupLabels[group], colSpan: totalLabelColumnCount, bold: true, fillColor: "#4abdec", color: "#000000" },
        ...Array.from({ length: totalLabelColumnCount - 1 }, () => ({ text: "", style: "emptyCell", fillColor: "#4abdec", color: "#000000" })),
        { text: totalCoef.toFixed(1), bold: true, fillColor: "#4abdec", color: "#000000" },
        { text: totalPoints.toFixed(2), bold: true, fillColor: "#4abdec", color: "#000000" }, { text: "", style: "emptyCell", fillColor: "#4abdec", color: "#000000" },
        { text: "Average:", bold: true, fillColor: "#4abdec", color: "#000000" },
        { text: groupAverage === null ? "-" : groupAverage.toFixed(2) + " / 20", bold: true, fillColor: "#4abdec", color: "#000000" }, { text: "", style: "emptyCell", fillColor: "#4abdec", color: "#000000" },
      ]);
    });
    const totalCoef = subjects.reduce((sum, subject) => sum + Storage.subjectCoefficient(classId, subject.id), 0);
    const totalPoints = subjects.reduce((sum, subject) => {
      const average = Grades.studentAverageForSubject(studentId, subject.id, term, selectedSequence);
      return sum + (average === null ? 0 : average * Storage.subjectCoefficient(classId, subject.id));
    }, 0);
    const decision = general !== null && general >= 10 ? "Promoted to the next class" : "Repeat the class / close monitoring";
    const identityRows = [
      [{ text: "STUDENT NAME", style: "labelCell" }, { text: s.firstName + " " + s.lastName, style: "valueCell" }, { text: "CLASS", style: "labelCell" }, { text: c?.name || "-", style: "valueCell" }],
      [{ text: "STUDENT ID", style: "labelCell" }, { text: s.matricule || "-", style: "valueCell" }, { text: "GENDER", style: "labelCell" }, { text: displayGender(s.gender), style: "valueCell" }],
      [{ text: "DATE AND PLACE OF BIRTH", style: "labelCell" }, { text: Utils.formatDate(s.dob) + " in " + (s.pob || "-"), style: "valueCell" }, { text: "REPEATING", style: "labelCell" }, { text: "No", style: "valueCell" }],
      [{ text: "CLASS TEACHER", style: "labelCell" }, { text: mainTeacher ? mainTeacher.firstName + " " + mainTeacher.lastName : "-", style: "valueCell" }, { text: "CLASS SIZE", style: "labelCell" }, { text: scoped ? "-" : classStudents.length, style: "valueCell" }],
    ];
    return {
      pageSize: "A4", pageMargins: [18, 12, 18, 12],
      content: [
        { table: { widths: ["*", 72, "*"], body: [[
          { stack: [{ text: "REPUBLIQUE DU CAMEROUN", bold: true }, { text: "PAIX - TRAVAIL - PATRIE", fontSize: 6 }, { text: "MINISTERE DES ENSEIGNEMENTS SECONDAIRES", fontSize: 6 }, { text: "DELEGATION REGIONALE DU CENTRE", fontSize: 6 }, { text: "DELEGATION DEPARTEMENTALE DU MFOUNDI", fontSize: 6 }, { text: institution.french, bold: true, fontSize: 8 }, { text: "B.P : " + (bulletinSettings.address || "YDE") + " - Tel. : " + (bulletinSettings.phone || ""), fontSize: 7 }], alignment: "center" },
          logo ? { image: "establishmentLogo", fit: [62, 62], alignment: "center" } : { text: "", style: "emptyCell" },
          { stack: [{ text: "REPUBLIC OF CAMEROON", bold: true }, { text: "PEACE - WORK - FATHERLAND", fontSize: 6 }, { text: "MINISTRY OF SECONDARY EDUCATION", fontSize: 6 }, { text: "REGIONAL DELEGATION OF THE CENTER", fontSize: 6 }, { text: "DIVISIONAL DELEGATION OF MFOUNDI", fontSize: 6 }, { text: institution.english, bold: true, fontSize: 8 }, { text: "P.O. BOX: " + (bulletinSettings.address || "YDE") + " - Phone: " + (bulletinSettings.phone || ""), fontSize: 7 }], alignment: "center" },
        ]] }, layout: "noBorders", margin: [0, 0, 0, 2] },
        { text: "ACADEMIC YEAR: " + settings.currentYear, alignment: "center", fontSize: 6.5, margin: [0, 0, 0, 4] },
        { table: { widths: ["*"], body: [[{ text: "STUDENT REPORT — " + displayPeriod(periodLabel).toUpperCase(), style: "bulletinTitle" }]] }, layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => "222222", vLineColor: () => "222222", paddingTop: () => 2, paddingBottom: () => 2 }, margin: [70, 0, 70, 5] },
        { table: { widths: [100, "*", 55, 55], body: identityRows }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { headerRows: 1, widths: bulletinColumnWidths, body }, fontSize: 5.7, layout: { hLineWidth: () => 0.45, vLineWidth: () => 0.45, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 2.2, paddingBottom: () => 2.2 } },
        { table: { widths: ["*", 65, 65, 65], body: [[{ text: "RESULTS FOR " + displayPeriod(periodLabel).toUpperCase(), style: "summaryHeader", colSpan: 4 }, { text: "", style: "emptyCell" }, { text: "", style: "emptyCell" }, { text: "", style: "emptyCell" }], ["Student average", general === null ? "-" : general.toFixed(2) + " / 20", "Class rank", scoped ? "-" : rank >= 0 ? rank + 1 + " / " + ranking.length : "-"], ["Total points", totalPoints.toFixed(2), "Total coefficients", totalCoef.toFixed(1)], ["Class average", scoped || classAverage === null ? "-" : classAverage.toFixed(2), "Overall rating", appreciationFromAvg(general)]] }, fontSize: 6.5, margin: [0, 6, 0, 4] },
        { table: { widths: ["*", 75, "*", 75], body: [[{ text: "AVERAGE SUMMARY", style: "summaryHeader" }, { text: "", style: "emptyCell" }, { text: "CLASS PROFILE", style: "summaryHeader" }, { text: "", style: "emptyCell" }], ["Average >= 10", general !== null && general >= 10 ? "Yes" : "No", "Class average", scoped || classAverage === null ? "-" : classAverage.toFixed(2)], ["Student achievement", general !== null && general >= 10 ? "Encouraging" : "Needs improvement", "Council decision", decision]] }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { widths: ["*", "*", "*"], body: [[{ text: "STUDENT WORK", style: "summaryHeader" }, { text: "STUDENT CONDUCT", style: "summaryHeader" }, { text: "CLASS COUNCIL DECISION", style: "summaryHeader" }], [general !== null && general >= 10 ? "Satisfactory work" : "Needs improvement", "No remarks", decision]] }, fontSize: 6.5, margin: [0, 0, 0, 8] },
        { text: "This report card is issued without erasure or alteration.", italics: true, alignment: "center", fontSize: 6.5, margin: [0, 2, 0, 18] },
        { table: { widths: ["*", "*", "*"], body: [[{ text: "PARENT'S SIGNATURE", alignment: "center", bold: true }, { text: "AVERAGE OBTAINED IN " + subjects.filter((subject) => { const average = Grades.studentAverageForSubject(studentId, subject.id, term, selectedSequence); return average !== null && average >= 10; }).length + " SUBJECT(S)", alignment: "center", bold: true }, { text: "PRINCIPAL'S SIGNATURE", alignment: "center", bold: true }], [{ text: "", margin: [0, 26, 0, 0] }, { text: general !== null && general >= 10 ? "HONOUR ROLL" : "MORE EFFORT IS NEEDED", alignment: "center", margin: [0, 26, 0, 0] }, { text: "The Principal", alignment: "center", margin: [0, 26, 0, 0] }]] }, fontSize: 6.5, margin: [0, 0, 0, 4] },
        { text: "Key: N.A. = NOT ACQUIRED, E.C.A. = EMERGING, A = ACQUIRED, A+ = FULLY ACQUIRED", alignment: "center", fontSize: 5.5, margin: [0, 4, 0, 0] },
      ],
      styles: {
        tableHeader: { bold: true, color: "#000000", fillColor: "#4abdec", alignment: "center" },
        bulletinTitle: { bold: true, fontSize: 11, alignment: "center" },
        labelCell: { bold: true, fillColor: "#ffffff", color: "#000000", alignment: "center" },
        valueCell: { bold: true, fillColor: "#ffffff", color: "#000000", alignment: "center" },
        summaryHeader: { bold: true, fillColor: "d7d7f5", alignment: "center" },
        emptyCell: { text: "", fillColor: "white", color: "black" },
      },
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      defaultStyle: { font: "Roboto", fontSize: 8 },
    };
  }

  return { render, loadLogoDataUrl };
})();
