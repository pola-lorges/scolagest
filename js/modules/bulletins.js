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
  const MIDDLE_SCHOOL_GROUPS = {
    literatureCulture: "TOTAL LITTERATURE ET CULTURE GENERALE",
    universalScience: "TOTAL SCIENCE UNIVERSELLE",
    diverseEducation: "TOTAL ENSEIGNEMENT DIVERS",
  };
  const FRENCH_BULLETIN_GROUPS = {
    languages: "TOTAL DES LANGUES ET DE LA LITTERATURE",
    humanSocial: "TOTAL DES SCIENCES HUMAINES ET SOCIALES",
    sciencesTechnology: "TOTAL DES SCIENCES ET DE LA TECHNOLOGIE",
    other: "TOTAL DES AUTRES MATIERES",
  };
  const ENGLISH_BULLETIN_TEXT = {
    academicYear: "ACADEMIC YEAR", report: "STUDENT REPORT", studentName: "STUDENT NAME", studentId: "STUDENT ID",
    class: "CLASS", gender: "GENDER", birth: "DATE AND PLACE OF BIRTH", repeating: "REPEATING",
    classTeacher: "CLASS TEACHER", classSize: "CLASS SIZE", subject: "Subject", teacher: "Teacher",
    harmonized: "Harmonized assessment", weekly: "Weekly assessment", average: "Average /20", termAverage: "Term average /20", coefficient: "Coef.",
    averageCoefficient: "Average x coef.", rank: "Rank", classAverage: "Class average", markCount: "Number of marks",
    appreciation: "Appreciation", groupAverage: "Average:", overallAverage: "Overall average", classRank: "Class rank",
    overallAssessment: "Overall assessment", studentConduct: "Student conduct", satisfactory: "Satisfactory work",
    needsImprovement: "Needs improvement", councilAssessment: "Class council assessment", promotionDecision: "Promotion decision",
    promoted: "Promoted to the next class", repeat: "Repeat the class / close monitoring",
    reportNotice: "This report card is issued without erasure or alteration.", classTeacherSignature: "The class teacher",
    principalSignature: "The principal", resultsFor: "RESULTS FOR", studentAverage: "Student average",
    totalPoints: "Total points", totalCoefficients: "Total coefficients", overallRating: "Overall rating",
    averageSummary: "AVERAGE SUMMARY", classProfile: "CLASS PROFILE", averageAtLeastTen: "Average >= 10",
    yes: "Yes", no: "No", studentAchievement: "Student achievement", encouraging: "Encouraging",
    councilDecision: "Council decision", studentWork: "STUDENT WORK", parentSignature: "PARENT'S SIGNATURE",
    averageObtainedIn: "AVERAGE OBTAINED IN", subjects: "SUBJECT(S)", principal: "The Principal",
    legend: "Key: N.A. = NOT ACQUIRED, E.C.A. = EMERGING, A = ACQUIRED, A+ = FULLY ACQUIRED",
  };
  const FRENCH_BULLETIN_TEXT = {
    academicYear: "ANNEE SCOLAIRE", report: "BULLETIN DE NOTES", studentName: "NOM ET PRENOM", studentId: "MATRICULE",
    class: "CLASSE", gender: "SEXE", birth: "DATE ET LIEU DE NAISSANCE", repeating: "REDOUBLANT",
    classTeacher: "PROFESSEUR PRINCIPAL", classSize: "EFFECTIF", subject: "Matière", teacher: "Enseignant",
    harmonized: "Evaluation harmonisée", weekly: "Evaluation hebdomadaire", average: "Moyenne /20", termAverage: "Moyenne trimestrielle /20", coefficient: "Coef.",
    averageCoefficient: "Moyenne x coef.", rank: "Rang", classAverage: "Moyenne de classe", markCount: "Nombre de notes",
    appreciation: "Appréciation", groupAverage: "Moyenne :", overallAverage: "Moyenne générale", classRank: "Rang de classe",
    overallAssessment: "Appréciation générale", studentConduct: "Conduite de l'élève", satisfactory: "Travail satisfaisant",
    needsImprovement: "Doit améliorer son travail", councilAssessment: "Appréciation du conseil de classe", promotionDecision: "Décision du conseil",
    promoted: "Admis(e) en classe supérieure", repeat: "Redoublement / à surveiller",
    reportNotice: "Ce bulletin est délivré sans rature ni surcharge.", classTeacherSignature: "Le professeur principal",
    principalSignature: "Le chef d'établissement", resultsFor: "RESULTATS DU", studentAverage: "Moyenne de l'élève",
    totalPoints: "Total des points", totalCoefficients: "Total des coefficients", overallRating: "Appréciation générale",
    averageSummary: "RAPPEL DES MOYENNES", classProfile: "PROFIL DE LA CLASSE", averageAtLeastTen: "Moyenne >= 10",
    yes: "Oui", no: "Non", studentAchievement: "Travail de l'élève", encouraging: "Encourageant",
    councilDecision: "Décision du conseil", studentWork: "TRAVAIL DE L'ELEVE", parentSignature: "SIGNATURE DU PARENT",
    averageObtainedIn: "A LA MOYENNE DANS", subjects: "MATIERE(S)", principal: "Le Principal",
    legend: "Légende : NA = NON ACQUIS, ECA = EN COURS D'ACQUISITION, A = ACQUIS, A+ = PARFAITEMENT ACQUIS",
  };
  const BULLETIN_SUBJECT_ORDER = [
    "ENGLISH LANGUAGE", "ENGLISH LITERATURE", "ENGLISH LITTERATURE", "FRENCH",
    "CITIZENSHIP", "CITYZENSHIP", "HOME ECONOMICS", "GEOGRAPHY", "HISTORY",
    "MATHEMATICS", "MATH", "MATHS", "BIOLOGY", "ICT COMPUTER SCIENCE", "ICT", "COMPUTER SCIENCE", "PHYSICS", "CHEMISTRY", "CHEMESTRY",
    "MANUAL LABOR", "MANUAL LABOUR", "SPORTS PES",
  ];

  function normalizedLabel(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function isEnglishClass(className) {
    const words = normalizedLabel(className).split(" ");
    return words.some((word) => /^FORM[1-4]$/.test(word)) || (words.includes("FORM") && words.some((word) => ["1", "2", "3", "4"].includes(word)));
  }

  function bulletinTextForClass(className) {
    return isEnglishClass(className) ? ENGLISH_BULLETIN_TEXT : FRENCH_BULLETIN_TEXT;
  }

  function middleSchoolProfile(className) {
    const classWords = normalizedLabel(className).split(" ");
    const grade = classWords.find((word) => /^(3|4|5|6)(E|EME)$/.test(word));
    if (!grade) return null;
    const language = ["3", "4"].some((level) => grade.startsWith(level)) && classWords.includes("ESP")
      ? "SPANISH"
      : ["3", "4"].some((level) => grade.startsWith(level)) && classWords.includes("ALL")
        ? "GERMAN"
        : null;
    return { groups: MIDDLE_SCHOOL_GROUPS, language };
  }

  function subjectGroup(name, className) {
    const normalized = normalizedLabel(name);
    const profile = middleSchoolProfile(className);
    if (!profile) {
      if (["ENGLISH LANGUAGE", "ENGLISH LITERATURE", "ENGLISH LITTERATURE", "FRENCH"].includes(normalized)) return "languages";
      if (["CITIZENSHIP", "CITYZENSHIP", "HOME ECONOMICS", "GEOGRAPHY", "HISTORY"].includes(normalized)) return "humanSocial";
      if (["MATH", "MATHS", "MATHEMATICS", "BIOLOGY", "PHYSICS", "CHEMISTRY", "CHEMESTRY"].includes(normalized) || normalized.includes("ICT") || normalized.includes("COMPUTER SCIENCE")) return "sciencesTechnology";
      return "other";
    }
    if (["ANGLAIS", "ENGLISH", "CORRECTION ORTHOGRAPHIQUE", "CORECTION ORTHOGRAPHIQUE", "EXPRESSION ECRITE", "ETUDE DE TEXTE", "EXPRESSION ORALE", "HISTOIRE", "GEOGRAPHIE", "ECM", "EDUCATION CIVIQUE ET MORALE"].includes(normalized)) return "literatureCulture";
    if (profile.language === "SPANISH" && ["ESPAGNOL", "SPANISH"].includes(normalized)) return "literatureCulture";
    if (profile.language === "GERMAN" && ["ALLEMAND", "GERMAN"].includes(normalized)) return "literatureCulture";
    if (["MATHEMATIQUE", "MATHEMATIQUES", "MATHEMATICS", "MATH", "SCIENCES DE LA VIE ET DE LA TERRE", "SVT", "INFORMATIQUE", "COMPUTER SCIENCE", "ICT"].includes(normalized) || normalized.includes("COMPUTER SCIENCE")) return "universalScience";
    return "diverseEducation";
  }

  function subjectOrderForClass(className) {
    const profile = middleSchoolProfile(className);
    if (!profile) return BULLETIN_SUBJECT_ORDER;
    const languageSubjects = profile.language === "SPANISH" ? ["ANGLAIS", "ENGLISH", "ESPAGNOL", "SPANISH"]
      : profile.language === "GERMAN" ? ["ANGLAIS", "ENGLISH", "ALLEMAND", "GERMAN"]
        : ["ANGLAIS", "ENGLISH"];
    return [...languageSubjects, "CORRECTION ORTHOGRAPHIQUE", "EXPRESSION ECRITE", "ETUDE DE TEXTE", "EXPRESSION ORALE", "HISTOIRE", "GEOGRAPHIE", "ECM", "EDUCATION CIVIQUE ET MORALE", "MATHEMATIQUES", "MATHEMATIQUE", "MATHEMATICS", "MATH", "SVT", "SCIENCES DE LA VIE ET DE LA TERRE", "INFORMATIQUE", "EPS", "TRAVAIL MANUEL"];
  }

  function compareBulletinSubjects(left, right, className) {
    const leftName = normalizedLabel(left.subj?.name || left.subject?.name);
    const rightName = normalizedLabel(right.subj?.name || right.subject?.name);
    const subjectOrder = subjectOrderForClass(className);
    const leftOrder = subjectOrder.indexOf(leftName);
    const rightOrder = subjectOrder.indexOf(rightName);
    const leftIndex = leftOrder < 0 ? BULLETIN_SUBJECT_ORDER.length : leftOrder;
    const rightIndex = rightOrder < 0 ? BULLETIN_SUBJECT_ORDER.length : rightOrder;
    return leftIndex - rightIndex || leftName.localeCompare(rightName);
  }

  function ordinalRank(rank, english = true) {
    if (rank <= 0) return "-";
    if (!english) return rank === 1 ? "1er" : rank + "e";
    const remainder = rank % 100;
    const suffix = remainder >= 11 && remainder <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[rank % 10] || "th");
    return rank + suffix;
  }

  function displayPeriod(period, english = true) {
    if (!english) return String(period || "");
    return String(period || "").replace(/^trimestre\s+/i, "Term ").replace(/^séquence\s+/i, "Sequence ");
  }

  function displayGender(gender, english = true) {
    const normalized = String(gender || "").toLowerCase();
    if (!english) {
      if (["m", "male", "masculin", "homme"].includes(normalized)) return "Masculin";
      if (["f", "female", "féminin", "feminin", "femme"].includes(normalized)) return "Féminin";
      return gender || "-";
    }
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

  function appreciationFromAvg(avg, english = true) {
    if (avg === null) return "-";
    if (avg >= 16) return "Excellent";
    if (avg >= 14) return english ? "Very good" : "Très bien";
    if (avg >= 12) return english ? "Good" : "Bien";
    if (avg >= 10) return english ? "Fair" : "Assez bien";
    return english ? "Insufficient" : "Insuffisant";
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

  function termSubjectAverage(studentId, subjectId, term) {
    const sequences = Grades.sequencesForTerm(term);
    const averages = sequences.map((sequence) => Grades.studentAverageForSubject(studentId, subjectId, term, sequence));
    if (!averages.some((average) => average !== null)) return null;
    return averages.reduce((sum, average) => sum + (average ?? 0), 0) / sequences.length;
  }

  function termGeneralAverage(studentId, classId, term) {
    const classItem = Storage.get("classes", classId);
    const subjects = Storage.all("subjects").filter((subject) => (classItem?.subjectTeachers || []).some((assignment) => assignment.subjectId === subject.id));
    let points = 0;
    let coefficients = 0;
    subjects.forEach((subject) => {
      const average = termSubjectAverage(studentId, subject.id, term);
      if (average === null) return;
      const coefficient = Storage.subjectCoefficient(classId, subject.id);
      points += average * coefficient;
      coefficients += coefficient;
    });
    return coefficients ? points / coefficients : null;
  }

  function termClassRanking(classId, term) {
    return Storage.all("students").filter((student) => student.classId === classId)
      .map((student) => ({ student, avg: termGeneralAverage(student.id, classId, term) }))
      .filter((entry) => entry.avg !== null)
      .sort((left, right) => right.avg - left.avg);
  }

  function termClassAverageForSubject(classId, subjectId, term) {
    const averages = Storage.all("students").filter((student) => student.classId === classId)
      .map((student) => termSubjectAverage(student.id, subjectId, term))
      .filter((average) => average !== null);
    return averages.length ? averages.reduce((sum, average) => sum + average, 0) / averages.length : null;
  }

  function termClassRankingForSubject(classId, subjectId, term) {
    return Storage.all("students").filter((student) => student.classId === classId)
      .map((student) => ({ student, avg: termSubjectAverage(student.id, subjectId, term) }))
      .filter((entry) => entry.avg !== null)
      .sort((left, right) => right.avg - left.avg);
  }

  function buildBulletinHtml(studentId, classId, term, sequence) {
    const s = Storage.get("students", studentId);
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const bulletinSettings = settings.bulletin || {};
    const institution = institutionNames(bulletinSettings, settings);
    const logoSrc = bulletinLogoSource(bulletinSettings);
    const scoped = Auth.scopedStudentIds();
    const english = isEnglishClass(c?.name);
    const text = bulletinTextForClass(c?.name);
    const groupLabels = middleSchoolProfile(c?.name)?.groups || (english ? BULLETIN_GROUPS : FRENCH_BULLETIN_GROUPS);
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
    const rowsByGroup = Object.fromEntries(Object.keys(groupLabels).map((group) => [group, rows.filter((row) => subjectGroup(row.subj.name, c?.name) === group).sort((a, b) => compareBulletinSubjects(a, b, c?.name))]));

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
        <h3 style="margin:0 0 10px;text-align:center;">${text.report} — ${Utils.escapeHtml(displayPeriod(sequence, english)).toUpperCase()}</h3>
        <div class="bulletin-meta">
          <span><strong>${text.birth}:</strong> ${Utils.formatDate(s.dob)} ${english ? "in" : "à"} ${Utils.escapeHtml(s.pob || "-")}</span>
          <span><strong>${text.gender}:</strong> ${Utils.escapeHtml(displayGender(s.gender, english))}</span>
          ${scoped ? "" : `<span><strong>${text.classSize}:</strong> ${classStudents.length}</span>`}
          <span><strong>${text.classTeacher}:</strong> ${mainTeacher ? Utils.escapeHtml(mainTeacher.firstName + " " + mainTeacher.lastName) : "-"}</span>
        </div>
        <div class="bulletin-table-wrap"><table>
          <thead><tr><th>${text.subject}</th><th>${text.harmonized}</th><th>${text.weekly}</th><th>${text.average}</th><th>${text.coefficient}</th><th>${text.teacher}</th><th>${text.appreciation}</th></tr></thead>
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
                  <td>${appreciationFromAvg(r.avg, english)}</td>
                </tr>`
              )
              .join("")}
            <tr class="bulletin-group-total"><td colspan="4"><strong>${groupLabels[group]}</strong></td><td><strong>${totalCoefficient.toFixed(1)}</strong></td><td></td><td><strong>${text.groupAverage} ${groupAverage !== null ? groupAverage.toFixed(2) + " / 20" : "-"}</strong></td></tr></tbody>`;
          }).join("")}
        </table></div>
        <hr class="sep">
        <div class="form-grid">
          <div><strong>${text.overallAverage}:</strong> ${general !== null ? general.toFixed(2) : "-"} /20</div>
          ${scoped ? "" : `<div><strong>${text.classRank}:</strong> ${rank >= 0 ? rank + " / " + ranking.length : "-"}</div>`}
          <div><strong>${text.overallAssessment}:</strong> ${appreciationFromAvg(general, english)}</div>
          <div><strong>${text.studentConduct}:</strong> ${general !== null && general >= 10 ? text.satisfactory : text.needsImprovement}</div>
          <div><strong>${text.councilAssessment}:</strong> ${appreciationFromAvg(general, english)}</div>
          <div><strong>${text.promotionDecision}:</strong> ${general !== null && general >= 10 ? text.promoted : text.repeat}</div>
        </div>
        <p style="margin-top:18px;font-size:11px;">${text.reportNotice}</p>
        <div class="signature-row">
          <div>${text.classTeacherSignature}</div>
          <div>${text.principalSignature}</div>
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
    const english = isEnglishClass(c?.name);
    const text = bulletinTextForClass(c?.name);
    const scoped = Auth.scopedStudentIds();
    const selectedSequence = periodType === "term" ? null : sequence;
    const termSequences = periodType === "term" ? Grades.sequencesForTerm(term) : [];
    const periodLabel = periodType === "term" ? term : sequence;
    const averageForSubject = (subjectId) => periodType === "term"
      ? termSubjectAverage(studentId, subjectId, term)
      : Grades.studentAverageForSubject(studentId, subjectId, term, sequence);
    const subjects = Storage.all("subjects").filter((subject) => (c?.subjectTeachers || []).some((st) => st.subjectId === subject.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const mainTeacher = teachers.find((teacher) => teacher.id === c?.mainTeacherId);
    const classStudents = scoped ? [] : Storage.all("students").filter((student) => student.classId === classId);
    const ranking = scoped ? [] : periodType === "term" ? termClassRanking(classId, term) : Grades.classRanking(classId, term, selectedSequence);
    const rank = ranking.findIndex((item) => item.student.id === studentId);
    const general = periodType === "term" ? termGeneralAverage(studentId, classId, term) : Grades.studentGeneralAverage(studentId, classId, term, selectedSequence);
    const classAverage = ranking.length ? ranking.reduce((sum, item) => sum + item.avg, 0) / ranking.length : null;
    const groupLabels = middleSchoolProfile(c?.name)?.groups || (english ? BULLETIN_GROUPS : FRENCH_BULLETIN_GROUPS);
    const rowsByGroup = Object.fromEntries(Object.keys(groupLabels).map((group) => [group, []]));
    subjects.forEach((subject) => {
      const grades = Storage.all("grades").filter((grade) => grade.studentId === studentId && grade.subjectId === subject.id && grade.term === term && (periodType === "term" || Grades.gradeSequence(grade) === sequence));
      const average = averageForSubject(subject.id);
      const classRanking = scoped ? [] : periodType === "term" ? termClassRankingForSubject(classId, subject.id, term) : Grades.classRankingForSubject(classId, subject.id, term, selectedSequence);
      const classSubjectAverage = scoped ? null : periodType === "term" ? termClassAverageForSubject(classId, subject.id, term) : Grades.classAverageForSubject(classId, subject.id, term, selectedSequence);
      const assignment = (c.subjectTeachers || []).find((st) => st.subjectId === subject.id);
      const teacher = teachers.find((item) => item.id === assignment?.teacherId);
      rowsByGroup[subjectGroup(subject.name, c?.name)].push({
        subject,
        grades,
        sequenceAverages: termSequences.map((termSequence) => Grades.studentAverageForSubject(studentId, subject.id, term, termSequence)),
        harmonizedAverage: categoryAverage(grades, "harmonized"),
        weeklyAverage: categoryAverage(grades, "weekly"),
        average,
        classSubjectAverage,
        coefficient: Storage.subjectCoefficient(classId, subject.id),
        teacher,
        rank: classRanking.findIndex((item) => item.student.id === studentId) + 1,
      });
    });
    Object.values(rowsByGroup).forEach((groupRows) => groupRows.sort((a, b) => compareBulletinSubjects(a, b, c?.name)));
    const headerLabels = periodType === "term"
      ? [text.subject, text.teacher, ...termSequences.map((termSequence) => `${displayPeriod(termSequence, english)} /20`), text.termAverage, text.coefficient, text.averageCoefficient, text.rank, text.classAverage, text.markCount, text.appreciation]
      : [text.subject, text.teacher, text.harmonized, text.weekly, text.average, text.coefficient, text.averageCoefficient, text.rank, text.classAverage, text.markCount, text.appreciation];
    const tableHeader = headerLabels.map((label) => ({ text: label, style: "tableHeader", fillColor: "#4abdec", color: "#000000" }));
    const totalLabelColumnCount = periodType === "term" ? 3 + termSequences.length : 5;
    const bulletinColumnWidths = periodType === "term"
      ? [82, 68, ...termSequences.map(() => 46), 43, 25, 39, 27, 40, 30, 66]
      : [82, 68, 51, 56, 38, 25, 39, 27, 40, 30, 66];
    const body = [tableHeader];
    const totals = {};
    Object.keys(rowsByGroup).forEach((group) => {
      const groupRows = rowsByGroup[group];
      if (!groupRows.length) return;
      groupRows.forEach((row) => {
        const subjectCells = periodType === "term"
          ? [{ text: row.subject.name, bold: true }, row.teacher ? row.teacher.firstName + " " + row.teacher.lastName : "-", ...row.sequenceAverages.map((average) => average === null ? "-" : average.toFixed(2)), row.average === null ? "-" : row.average.toFixed(2)]
          : [
          { text: row.subject.name, bold: true },
          row.teacher ? row.teacher.firstName + " " + row.teacher.lastName : "-",
          row.harmonizedAverage === null ? "-" : row.harmonizedAverage.toFixed(2),
          row.weeklyAverage === null ? "-" : row.weeklyAverage.toFixed(2),
          row.average === null ? "-" : row.average.toFixed(2),
        ];
        body.push([
          ...subjectCells,
          row.coefficient,
          row.average === null ? "-" : (row.average * row.coefficient).toFixed(2),
          ordinalRank(row.rank, english), row.classSubjectAverage === null ? "-" : row.classSubjectAverage.toFixed(2),
          row.grades.length, appreciationFromAvg(row.average, english),
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
        { text: text.groupAverage, bold: true, fillColor: "#4abdec", color: "#000000" },
        { text: groupAverage === null ? "-" : groupAverage.toFixed(2) + " / 20", bold: true, fillColor: "#4abdec", color: "#000000" }, { text: "", style: "emptyCell", fillColor: "#4abdec", color: "#000000" },
      ]);
    });
    const totalCoef = subjects.reduce((sum, subject) => sum + Storage.subjectCoefficient(classId, subject.id), 0);
    const totalPoints = subjects.reduce((sum, subject) => {
      const average = averageForSubject(subject.id);
      return sum + (average === null ? 0 : average * Storage.subjectCoefficient(classId, subject.id));
    }, 0);
    const decision = general !== null && general >= 10 ? text.promoted : text.repeat;
    const identityRows = [
      [{ text: text.studentName, style: "labelCell" }, { text: s.firstName + " " + s.lastName, style: "valueCell" }, { text: text.class, style: "labelCell" }, { text: c?.name || "-", style: "valueCell" }],
      [{ text: text.studentId, style: "labelCell" }, { text: s.matricule || "-", style: "valueCell" }, { text: text.gender, style: "labelCell" }, { text: displayGender(s.gender, english), style: "valueCell" }],
      [{ text: text.birth, style: "labelCell" }, { text: Utils.formatDate(s.dob) + (english ? " in " : " à ") + (s.pob || "-"), style: "valueCell" }, { text: text.repeating, style: "labelCell" }, { text: english ? "No" : "Non", style: "valueCell" }],
      [{ text: text.classTeacher, style: "labelCell" }, { text: mainTeacher ? mainTeacher.firstName + " " + mainTeacher.lastName : "-", style: "valueCell" }, { text: text.classSize, style: "labelCell" }, { text: scoped ? "-" : classStudents.length, style: "valueCell" }],
    ];
    return {
      pageSize: "A4", pageMargins: [18, 12, 18, 12],
      content: [
        { table: { widths: ["*", 72, "*"], body: [[
          { stack: [{ text: "REPUBLIQUE DU CAMEROUN", bold: true }, { text: "PAIX - TRAVAIL - PATRIE", fontSize: 6 }, { text: "MINISTERE DES ENSEIGNEMENTS SECONDAIRES", fontSize: 6 }, { text: "DELEGATION REGIONALE DU CENTRE", fontSize: 6 }, { text: "DELEGATION DEPARTEMENTALE DU MFOUNDI", fontSize: 6 }, { text: institution.french, bold: true, fontSize: 8 }, { text: "B.P : " + (bulletinSettings.address || "YDE") + " - Tel. : " + (bulletinSettings.phone || ""), fontSize: 7 }], alignment: "center" },
          logo ? { image: "establishmentLogo", fit: [62, 62], alignment: "center" } : { text: "", style: "emptyCell" },
          { stack: [{ text: "REPUBLIC OF CAMEROON", bold: true }, { text: "PEACE - WORK - FATHERLAND", fontSize: 6 }, { text: "MINISTRY OF SECONDARY EDUCATION", fontSize: 6 }, { text: "REGIONAL DELEGATION OF THE CENTER", fontSize: 6 }, { text: "DIVISIONAL DELEGATION OF MFOUNDI", fontSize: 6 }, { text: institution.english, bold: true, fontSize: 8 }, { text: "P.O. BOX: " + (bulletinSettings.address || "YDE") + " - Phone: " + (bulletinSettings.phone || ""), fontSize: 7 }], alignment: "center" },
        ]] }, layout: "noBorders", margin: [0, 0, 0, 2] },
        { text: text.academicYear + ": " + settings.currentYear, alignment: "center", fontSize: 6.5, margin: [0, 0, 0, 4] },
        { table: { widths: ["*"], body: [[{ text: text.report + " — " + displayPeriod(periodLabel, english).toUpperCase(), style: "bulletinTitle" }]] }, layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => "222222", vLineColor: () => "222222", paddingTop: () => 2, paddingBottom: () => 2 }, margin: [70, 0, 70, 5] },
        { table: { widths: [100, "*", 55, 55], body: identityRows }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { headerRows: 1, widths: bulletinColumnWidths, body }, fontSize: 5.7, layout: { hLineWidth: () => 0.45, vLineWidth: () => 0.45, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 2.2, paddingBottom: () => 2.2 } },
        { table: { widths: ["*", 65, 65, 65], body: [[{ text: text.resultsFor + " " + displayPeriod(periodLabel, english).toUpperCase(), style: "summaryHeader", colSpan: 4 }, { text: "", style: "emptyCell" }, { text: "", style: "emptyCell" }, { text: "", style: "emptyCell" }], [text.studentAverage, general === null ? "-" : general.toFixed(2) + " / 20", text.classRank, scoped ? "-" : rank >= 0 ? rank + 1 + " / " + ranking.length : "-"], [text.totalPoints, totalPoints.toFixed(2), text.totalCoefficients, totalCoef.toFixed(1)], [text.classAverage, scoped || classAverage === null ? "-" : classAverage.toFixed(2), text.overallRating, appreciationFromAvg(general, english)]] }, fontSize: 6.5, margin: [0, 6, 0, 4] },
        { table: { widths: ["*", 75, "*", 75], body: [[{ text: text.averageSummary, style: "summaryHeader" }, { text: "", style: "emptyCell" }, { text: text.classProfile, style: "summaryHeader" }, { text: "", style: "emptyCell" }], [text.averageAtLeastTen, general !== null && general >= 10 ? text.yes : text.no, text.classAverage, scoped || classAverage === null ? "-" : classAverage.toFixed(2)], [text.studentAchievement, general !== null && general >= 10 ? text.encouraging : text.needsImprovement, text.councilDecision, decision]] }, fontSize: 6.5, margin: [0, 0, 0, 5] },
        { table: { widths: ["*", "*", "*"], body: [[{ text: text.studentWork, style: "summaryHeader" }, { text: text.studentConduct.toUpperCase(), style: "summaryHeader" }, { text: text.councilDecision.toUpperCase(), style: "summaryHeader" }], [general !== null && general >= 10 ? text.satisfactory : text.needsImprovement, english ? "No remarks" : "Aucune remarque", decision]] }, fontSize: 6.5, margin: [0, 0, 0, 8] },
        { text: text.reportNotice, italics: true, alignment: "center", fontSize: 6.5, margin: [0, 2, 0, 18] },
        { table: { widths: ["*", "*", "*"], body: [[{ text: text.parentSignature, alignment: "center", bold: true }, { text: text.averageObtainedIn + " " + subjects.filter((subject) => { const average = averageForSubject(subject.id); return average !== null && average >= 10; }).length + " " + text.subjects, alignment: "center", bold: true }, { text: text.principalSignature, alignment: "center", bold: true }], [{ text: "", margin: [0, 26, 0, 0] }, { text: general !== null && general >= 10 ? (english ? "HONOUR ROLL" : "TABLEAU D'HONNEUR") : (english ? "MORE EFFORT IS NEEDED" : "UN EFFORT SUPPLEMENTAIRE EST NECESSAIRE"), alignment: "center", margin: [0, 26, 0, 0] }, { text: text.principal, alignment: "center", margin: [0, 26, 0, 0] }]] }, fontSize: 6.5, margin: [0, 0, 0, 4] },
        { text: text.legend, alignment: "center", fontSize: 5.5, margin: [0, 4, 0, 0] },
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
