/**
 * Couche de données — persistance via localStorage.
 * Toutes les collections sont des tableaux d'objets identifiés par un champ `id`.
 */
const DB_KEY = "scolagest_db_v1";

const DEFAULT_DB = {
  settings: {
    schoolName: "Établissement Scolaire ScolaGest",
    currentYear: "2025-2026",
    currentTerm: "Trimestre 1",
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

  function load() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        db = JSON.parse(raw);
        // ensure all collections exist (in case of future additions)
        Object.keys(DEFAULT_DB).forEach((k) => {
          if (db[k] === undefined) db[k] = DEFAULT_DB[k];
        });
      } catch (e) {
        console.error("Erreur de lecture de la base locale, réinitialisation.", e);
        db = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
      seed();
    }
    return db;
  }

  function save() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function all(collection) {
    return db[collection];
  }

  function get(collection, id) {
    return db[collection].find((x) => x.id === id) || null;
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
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    seed();
    save();
  }

  function seed() {
    const yr = db.settings.currentYear;

    const subjects = [
      { name: "Mathématiques", coefficient: 4, level: "6e" },
      { name: "Français", coefficient: 3, level: "6e" },
      { name: "Anglais", coefficient: 2, level: "6e" },
      { name: "Histoire-Géographie", coefficient: 2, level: "6e" },
      { name: "Informatique", coefficient: 1, level: "6e" },
      { name: "SVT", coefficient: 2, level: "6e" },
    ].map((s) => ({ id: Utils.uid(), teacherId: null, program: "", ...s }));
    db.subjects = subjects;

    const teachers = [
      { firstName: "Paul", lastName: "Kouassi", subjects: [subjects[0].id], phone: "0102030405", email: "paul.k@ecole.com" },
      { firstName: "Alice", lastName: "N'Guessan", subjects: [subjects[0].id], phone: "0102030406", email: "alice.n@ecole.com" },
      { firstName: "Jean", lastName: "Kouadio", subjects: [subjects[1].id], phone: "0102030407", email: "jean.k@ecole.com" },
      { firstName: "Marie", lastName: "Bamba", subjects: [subjects[2].id], phone: "0102030408", email: "marie.b@ecole.com" },
    ].map((t) => ({
      id: Utils.uid(),
      matricule: "ENS-" + Utils.pad(Utils.rand(100, 999), 3),
      photo: "",
      address: "",
      classes: [],
      ...t,
    }));
    db.teachers = teachers;
    subjects[0].teacherId = teachers[0].id;
    subjects[1].teacherId = teachers[2].id;
    subjects[2].teacherId = teachers[3].id;

    const cls = {
      id: Utils.uid(),
      name: "6e A",
      level: "6e",
      capacity: 40,
      year: yr,
      mainTeacherId: teachers[0].id,
      subjectTeachers: [
        { subjectId: subjects[0].id, teacherId: teachers[0].id },
        { subjectId: subjects[1].id, teacherId: teachers[2].id },
        { subjectId: subjects[2].id, teacherId: teachers[3].id },
      ],
    };
    db.classes = [cls];
    teachers[0].classes = [cls.id];

    const student = {
      id: Utils.uid(),
      matricule: "ELV-2026-001",
      firstName: "Jean",
      lastName: "Dupont",
      photo: "",
      gender: "M",
      dob: "2013-04-12",
      pob: "Abidjan",
      address: "Cocody, Abidjan",
      classId: cls.id,
      year: yr,
      status: "actif",
      parent: { name: "Paul Dupont", phone: "0708091011", email: "paul.dupont@mail.com", address: "Cocody, Abidjan" },
      classHistory: [{ year: yr, classId: cls.id, className: cls.name }],
    };
    db.students = [student];

    db.grades = [
      { id: Utils.uid(), studentId: student.id, subjectId: subjects[0].id, classId: cls.id, term: "Trimestre 1", type: "Devoir 1", value: 14, max: 20, date: Utils.today(), teacherId: teachers[0].id },
      { id: Utils.uid(), studentId: student.id, subjectId: subjects[0].id, classId: cls.id, term: "Trimestre 1", type: "Devoir 2", value: 16, max: 20, date: Utils.today(), teacherId: teachers[0].id },
      { id: Utils.uid(), studentId: student.id, subjectId: subjects[0].id, classId: cls.id, term: "Trimestre 1", type: "Examen", value: 12, max: 20, date: Utils.today(), teacherId: teachers[0].id },
    ];

    db.timetable = [
      { id: Utils.uid(), classId: cls.id, day: "Lundi", start: "08:00", end: "10:00", subjectId: subjects[0].id, teacherId: teachers[0].id, room: "Salle 1" },
      { id: Utils.uid(), classId: cls.id, day: "Lundi", start: "10:00", end: "12:00", subjectId: subjects[1].id, teacherId: teachers[2].id, room: "Salle 1" },
    ];

    db.payments = [
      {
        id: Utils.uid(),
        studentId: student.id,
        year: yr,
        items: [
          { type: "Scolarité", amount: 500000 },
        ],
        transactions: [
          { id: Utils.uid(), date: Utils.today(), amount: 300000, mode: "Espèces", receiptNo: "REC-0001" },
        ],
      },
    ];

    // Comptes de démonstration — mot de passe stocké en clair (app 100% front-end, sans backend).
    db.users = [
      { id: Utils.uid(), username: "admin", password: "admin123", role: "ADMIN", fullName: "Administrateur Système", active: true },
      { id: Utils.uid(), username: "directeur", password: "directeur123", role: "DIRECTEUR", fullName: "Directeur de l'établissement", active: true },
      { id: Utils.uid(), username: "administration", password: "administration123", role: "ADMINISTRATION", fullName: "Agent d'administration", active: true },
      { id: Utils.uid(), username: "prof", password: "prof123", role: "ENSEIGNANT", fullName: teachers[0].firstName + " " + teachers[0].lastName, teacherId: teachers[0].id, active: true },
      { id: Utils.uid(), username: "parent", password: "parent123", role: "PARENT", fullName: student.parent.name, studentIds: [student.id], active: true },
      { id: Utils.uid(), username: "eleve", password: "eleve123", role: "ELEVE", fullName: student.firstName + " " + student.lastName, studentId: student.id, active: true },
    ];
  }

  load();

  return { db: () => db, load, save, all, get, insert, update, remove, setSettings, resetAll };
})();
