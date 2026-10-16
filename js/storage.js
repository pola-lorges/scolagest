/**
 * Couche de données — persistance via localStorage.
 * Toutes les collections sont des tableaux d'objets identifiés par un champ `id`.
 */
const DB_KEY = "scolagest_db_v2";
const SCHOOLS_KEY = "scolagest_schools";
const ACTIVE_SCHOOL_KEY = "scolagest_active_school";

const DEFAULT_DB = {
  settings: {
    schoolName: "Établissement Scolaire ScolaGest",
    currentYear: "2025-2026",
    currentTerm: "Trimestre 3",
    bulletin: {
      institution: "FONDATION SCOLAIRE IRENE PATRINI RENATO",
      ministry: "MINISTERE DES ENSEIGNEMENTS SECONDAIRES",
      address: "B.P : YDE",
      phone: "699967704 / 696317697",
      logo: "assets/logo-etablissement.jpg",
      evaluationTypes: ["DEV1", "DEV2", "DEV3", "DEV4", "DEV5", "DEV6"],
      format: "cameroun-annuel-trimestriel",
    },
  },
  students: [],
  classes: [],
  teachers: [],
  subjects: [],
  grades: [],
  attendance: [],
  timetable: [],
  payments: [],
  documents: [],
  users: [],
};

const Storage = (() => {
  let db = null;
  let schools = [];
  let activeId = null;

  const dbKey = (id) => `${DB_KEY}_${id}`;

  function loadSchools() {
    try { schools = JSON.parse(localStorage.getItem(SCHOOLS_KEY)) || []; } catch (e) { schools = []; }
    // Migration de l'ancienne base mono-établissement vers l'établissement de démonstration
    const legacy = localStorage.getItem(DB_KEY);
    if (legacy && !schools.length) {
      localStorage.setItem(dbKey("demo"), legacy);
      localStorage.removeItem(DB_KEY);
      schools = [{ id: "demo", code: "DEMO", name: "Établissement de démonstration", demo: true }];
    } else if (!schools.length) {
      schools = [{ id: "demo", code: "DEMO", name: "Établissement de démonstration", demo: true }];
    }
    localStorage.setItem(SCHOOLS_KEY, JSON.stringify(schools));
  }

  function listSchools() { return schools; }

  function findSchoolByCode(code) {
    const c = String(code || "").trim().toLowerCase();
    return schools.find((s) => s.code.toLowerCase() === c) || null;
  }

  function getActiveSchool() { return schools.find((s) => s.id === activeId) || null; }

  function setActiveSchool(id) {
    if (!schools.some((s) => s.id === id)) return false;
    activeId = id;
    sessionStorage.setItem(ACTIVE_SCHOOL_KEY, id);
    load();
    return true;
  }

  function clearActiveSchool() {
    activeId = null;
    db = null;
    sessionStorage.removeItem(ACTIVE_SCHOOL_KEY);
  }

  // Crée un établissement vide avec son compte administrateur ; ne change pas l'établissement actif.
  function createSchool({ name, code, adminUsername, adminPassword, adminFullName }) {
    const id = Utils.uid();
    const data = JSON.parse(JSON.stringify(DEFAULT_DB));
    data.settings.schoolName = name;
    data.settings.bulletin.institution = name.toUpperCase();
    data.settings.bulletin.address = "";
    data.settings.bulletin.phone = "";
    data.settings.bulletin.logo = "";
    data.users = [{ id: Utils.uid(), username: adminUsername, password: adminPassword, role: "ADMIN", fullName: adminFullName || "Administrateur", active: true }];
    schools.push({ id, code, name });
    localStorage.setItem(SCHOOLS_KEY, JSON.stringify(schools));
    localStorage.setItem(dbKey(id), JSON.stringify(data));
    return id;
  }

  function load() {
    if (!activeId) { db = null; return null; }
    const raw = localStorage.getItem(dbKey(activeId));
    if (raw) {
      try {
        db = JSON.parse(raw);
        // ensure all collections exist (in case of future additions)
        Object.keys(DEFAULT_DB).forEach((k) => {
          if (db[k] === undefined) db[k] = DEFAULT_DB[k];
        });
        db.settings = { ...DEFAULT_DB.settings, ...db.settings, bulletin: { ...DEFAULT_DB.settings.bulletin, ...(db.settings.bulletin || {}) } };
      } catch (e) {
        console.error("Erreur de lecture de la base locale, réinitialisation.", e);
        db = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
      if (getActiveSchool()?.demo) seed();
    }
    return db;
  }

  function save() {
    if (!activeId || !db) return;
    localStorage.setItem(dbKey(activeId), JSON.stringify(db));
  }

  function all(collection) {
    return db ? db[collection] : [];
  }

  function get(collection, id) {
    return all(collection).find((x) => x.id === id) || null;
  }

  function insert(collection, item) {
    if (!item.id) item.id = Utils.uid();
    db[collection].push(item);
    save();
    return item;
  }

  function update(collection, id, patch) {
    const idx = db[collection].findIndex((x) => x.id === id);
    if (idx === -1) return null;
    db[collection][idx] = { ...db[collection][idx], ...patch };
    save();
    return db[collection][idx];
  }

  function remove(collection, id) {
    db[collection] = db[collection].filter((x) => x.id !== id);
    save();
  }

  function setSettings(patch) {
    db.settings = { ...db.settings, ...patch };
    save();
  }

  function resetAll() {
    const keepUsers = db.users.filter((u) => u.role === "ADMIN");
    const keepSettings = db.settings;
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    if (getActiveSchool()?.demo) {
      seed();
    } else {
      db.settings = keepSettings;
      db.users = keepUsers;
    }
    save();
  }

  function seed() {
    const yr = db.settings.currentYear;
    const subjectNames = [
      ["ANGLAIS", 2], ["ECM", 1], ["ETUDE DE TEXTE", 1], ["EXPRESSION ECRITE", 2],
      ["EXPRESSION ORALE", 1], ["CORRECTION ORTHOGRAPHIQUE", 1], ["HISTOIRE/GEO", 2],
      ["MATHEMATIQUES", 3], ["INFORMATIQUE", 2], ["PCT", 1], ["LEGISLATION", 1],
      ["BIOLOGIE/HYGIENE", 1], ["DESSIN TECHNIQUE", 2], ["TECHNOLOGIE", 2],
      ["EPS", 1], ["TRAVAIL MANUEL", 1], ["COUTURE", 5], ["TECHNIQUES CULINAIRES", 4],
    ];
    const subjects = subjectNames.map(([name, coefficient]) => ({ id: Utils.uid(), name, coefficient, level: "", teacherId: null, program: "" }));
    db.subjects = subjects;
    const teacherNames = [
      "NDIMA ATCHOM MARIVONE", "EBELE NGONO MARIE ANNE", "MVONDO", "TOUSSI", "AWONO", "ABEGA",
      "BUISSI AYONA STEVE LANDRY", "BIAKA EMMANUEL CLOVIS", "TAGNE", "ZANGUE", "ETO'O WILFRIED",
      "MENGUE", "MARBIN ROSE", "EVODO", "FOGOU", "MEPOUNG", "MBEKE", "MBOG PHILIPPE",
      "TCHEWE TOUKAP CHRISTELLE ROGERAINE", "NGUEWA TANKWA VIVIE", "AKAMBA ATO FRIDEX GUILENG",
      "ONANA EMBOLO", "MONGJI MABEL", "MUNGWA LOURETTE NGUM", "NKOH JEAN ERNEST", "SANDIO",
      "EHABIL", "CHEFOR MELVIS", "WANKO NOULE JASSEMINE DARINE", "TAMGNO CHARLES JUNIOR",
    ];
    const teachers = teacherNames.map((fullName, index) => {
      const parts = fullName.split(" ");
      return { id: Utils.uid(), matricule: "ENS-" + Utils.pad(index + 1, 3), photo: "", address: "", classes: [], firstName: parts.shift(), lastName: parts.join(" "), subjects: [], phone: "", email: "" };
    });
    db.teachers = teachers;
    subjects.forEach((subject, index) => { subject.teacherId = teachers[index % teachers.length].id; teachers[index % teachers.length].subjects.push(subject.id); });
    const classNames = ["3IEME ALL", "3IEME ESP", "4IEME ESP", "5IEME", "6IEME", "A1 COME", "A1 ELEC", "A1 ESF", "A2 COME", "A2 ELEC", "A2 ESF", "A3 ESF", "FORM 1", "FORM 2", "FORM 3"];
    const classDefinitions = classNames.map((name, index) => ({ name, level: name.split(" ")[0], mainTeacher: index % teachers.length, subjectIndexes: subjects.map((_, subjectIndex) => subjectIndex).filter((subjectIndex) => subjectIndex % 3 !== 1 || index < 5) }));
    db.classes = classDefinitions.map((definition) => ({ id: Utils.uid(), name: definition.name, level: definition.level, capacity: 40, year: yr, mainTeacherId: teachers[definition.mainTeacher].id, subjectTeachers: definition.subjectIndexes.map((index) => ({ subjectId: subjects[index].id, teacherId: subjects[index].teacherId })) }));
    db.classes.forEach((classItem) => { const teacher = teachers.find((item) => item.id === classItem.mainTeacherId); if (teacher) teacher.classes.push(classItem.id); });
    const studentProfiles = [
      ["ESSOMBA", "HUBERT", "M", "2012-04-30", 0, "253AL948", 8.35], ["DONGMO SOLEFACK", "YANNEL RANDY", "M", "", 1, "253ES300", 8.42],
      ["AMOUGOU", "ALBERT MIGUEL", "M", "", 2, "254ES808", 9.33], ["AKOUMBA AKONO", "LUCRESSE LA GRACE", "F", "", 3, "255IE689", 11.38],
      ["ABONO SANGALI", "CHRISTOPHE", "M", "", 4, "256IE741", 9.81], ["KANEGA", "ANGE URIELLE", "F", "", 5, "251CO812", 13.00],
      ["ASSOMO ESSOMBA", "JOSEPH EMMANUEL", "M", "", 6, "25AEL137", 8.00], ["ASSEO", "LUCIE LUDIVINE DAVILA", "F", "", 7, "251SF264", 13.24],
      ["DJOUKOUO", "NAOUSSI LOURISTAR", "F", "2009-08-09", 8, "252CO553", 12.34], ["ATSAMA AHANDA", "DAVID", "M", "", 9, "252EL624", 11.73],
      ["ALIMA EVOUNA", "ANASTASIE", "F", "", 10, "252SF740", 9.50], ["MAPOUPA", "KETHIA BELVIAN", "F", "2012-01-16", 11, "253SF006", 13.91],
      ["AFAASEH", "PETER", "M", "", 12, "25FO1420", 8.00], ["BOUTCHOANG KENFACK", "ULRICH", "M", "", 13, "25FO2078", 15.82],
      ["MOUMBE", "ANGE", "M", "", 14, "25FO3424", 10.93], ["ELOUNDOU NGA MANI", "MARIE", "F", "2014-09-18", 7, "251SF790", 16.05],
      ["KOFFI", "KOUAME", "M", "2013-07-29", 3, "255IE607", 15.61], ["TCHASSEN KEMBEU", "JACK", "M", "2012-07-09", 2, "254ES879", 12.00],
    ];
    db.students = studentProfiles.map((profile, index) => {
      const classItem = db.classes[profile[4]];
      const student = {
        id: Utils.uid(), matricule: profile[5], firstName: profile[0], lastName: profile[1],
        photo: "", gender: profile[2], dob: profile[3], pob: "Yaoundé", address: "Yaoundé",
        classId: classItem.id, year: yr, status: "actif",
        parent: { name: `Parent de ${profile[0]}`, phone: `070809${Utils.pad(index + 11, 2)}`, email: `parent${index + 1}@mail.com`, address: "Abidjan" },
        classHistory: [{ year: yr, classId: classItem.id, className: classItem.name }],
      };
      return student;
    });

    db.grades = [];
    db.students.forEach((student, studentIndex) => {
      const classItem = db.classes.find((item) => item.id === student.classId);
      classItem.subjectTeachers.forEach((assignment, subjectIndex) => {
        const average = studentProfiles[studentIndex][6];
        ["Trimestre 1", "Trimestre 2", "Trimestre 3"].forEach((term) => {
          ["DEV1", "DEV2", "DEV3", "DEV4", "DEV5", "DEV6"].forEach((type) => {
            db.grades.push({ id: Utils.uid(), studentId: student.id, subjectId: assignment.subjectId, classId: classItem.id, term, type, value: average, max: 20, date: Utils.today(), teacherId: assignment.teacherId, history: [] });
          });
        });
      });
    });

    db.timetable = db.classes.flatMap((classItem, classIndex) => {
      const assignments = classItem.subjectTeachers;
      return assignments.slice(0, 4).map((assignment, slotIndex) => ({
        id: Utils.uid(), classId: classItem.id, day: ["Lundi", "Mardi", "Jeudi", "Vendredi"][slotIndex],
        start: "08:00", end: "10:00", subjectId: assignment.subjectId, teacherId: assignment.teacherId, room: `Salle ${classIndex + 1}`,
      }));
    });

    db.payments = db.students.slice(0, 8).map((student, index) => ({
      id: Utils.uid(), studentId: student.id, year: yr,
      items: [{ type: "Scolarité", amount: index % 3 === 0 ? 450000 : 500000 }, { type: "Inscription", amount: 75000 }],
      transactions: [{ id: Utils.uid(), date: Utils.today(), amount: index % 2 === 0 ? 300000 : 200000, mode: index % 2 === 0 ? "Espèces" : "Mobile Money", receiptNo: `REC-${Utils.pad(index + 1, 4)}` }],
    }));

    const student = db.students[0];

    // Comptes de démonstration — mot de passe stocké en clair (app 100% front-end, sans backend).
    db.users = [
      { id: Utils.uid(), username: "admin", password: "admin123", role: "ADMIN", fullName: "Administrateur Système", active: true },
      { id: Utils.uid(), username: "directeur", password: "directeur123", role: "DIRECTEUR", fullName: "Directeur de l'établissement", active: true },
      { id: Utils.uid(), username: "administration", password: "administration123", role: "ADMINISTRATION", fullName: "Agent d'administration", active: true },
      { id: Utils.uid(), username: "prof", password: "prof123", role: "ENSEIGNANT", fullName: teachers[0].firstName + " " + teachers[0].lastName, teacherId: teachers[0].id, active: true },
      { id: Utils.uid(), username: "parent", password: "parent123", role: "PARENT", fullName: student.parent.name, studentIds: [student.id, db.students[1].id], active: true },
      { id: Utils.uid(), username: "eleve", password: "eleve123", role: "ELEVE", fullName: student.firstName + " " + student.lastName, studentId: student.id, active: true },
    ];
  }

  loadSchools();
  schools.filter((s) => s.demo && !localStorage.getItem(dbKey(s.id))).forEach((s) => { activeId = s.id; load(); save(); });
  activeId = sessionStorage.getItem(ACTIVE_SCHOOL_KEY);
  if (!schools.some((s) => s.id === activeId)) activeId = null;
  load();

  return { db: () => db, load, save, all, get, insert, update, remove, setSettings, resetAll, listSchools, findSchoolByCode, getActiveSchool, setActiveSchool, clearActiveSchool, createSchool };
})();
