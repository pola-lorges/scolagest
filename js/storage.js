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
      { name: "Mathématiques", coefficient: 4, level: "5e" },
      { name: "Français", coefficient: 3, level: "5e" },
      { name: "Anglais", coefficient: 2, level: "5e" },
      { name: "Physique-Chimie", coefficient: 2, level: "5e" },
    ].map((s) => ({ id: Utils.uid(), teacherId: null, program: "", ...s }));
    db.subjects = subjects;

    const teachers = [
      { firstName: "Paul", lastName: "Kouassi", subjects: [subjects[0].id, subjects[6].id], phone: "0102030405", email: "paul.k@ecole.com" },
      { firstName: "Alice", lastName: "N'Guessan", subjects: [subjects[1].id, subjects[7].id], phone: "0102030406", email: "alice.n@ecole.com" },
      { firstName: "Jean", lastName: "Kouadio", subjects: [subjects[2].id, subjects[8].id], phone: "0102030407", email: "jean.k@ecole.com" },
      { firstName: "Marie", lastName: "Bamba", subjects: [subjects[3].id], phone: "0102030408", email: "marie.b@ecole.com" },
      { firstName: "Fatou", lastName: "Traoré", subjects: [subjects[4].id], phone: "0102030409", email: "fatou.t@ecole.com" },
      { firstName: "Karim", lastName: "Yao", subjects: [subjects[5].id, subjects[9].id], phone: "0102030410", email: "karim.y@ecole.com" },
    ].map((t) => ({
      id: Utils.uid(),
      matricule: "ENS-" + Utils.pad(Utils.rand(100, 999), 3),
      photo: "",
      address: "",
      classes: [],
      ...t,
    }));
    db.teachers = teachers;
    subjects.forEach((subject, index) => { subject.teacherId = teachers[index % teachers.length].id; });

    const classDefinitions = [
      { name: "6e A", level: "6e", mainTeacher: 0, subjectIndexes: [0, 1, 2, 3, 4, 5] },
      { name: "6e B", level: "6e", mainTeacher: 1, subjectIndexes: [0, 1, 2, 3, 4, 5] },
      { name: "5e A", level: "5e", mainTeacher: 2, subjectIndexes: [6, 7, 8, 9] },
    ];
    db.classes = classDefinitions.map((definition) => ({
      id: Utils.uid(), name: definition.name, level: definition.level, capacity: 40, year: yr,
      mainTeacherId: teachers[definition.mainTeacher].id,
      subjectTeachers: definition.subjectIndexes.map((index) => ({ subjectId: subjects[index].id, teacherId: subjects[index].teacherId })),
    }));
    db.classes.forEach((classItem) => {
      const teacher = teachers.find((item) => item.id === classItem.mainTeacherId);
      if (teacher) teacher.classes.push(classItem.id);
    });

    const studentProfiles = [
      ["Jean", "Dupont", "M", "2013-04-12", 0], ["Aïcha", "Koné", "F", "2013-08-21", 0],
      ["Koffi", "N'Guessan", "M", "2013-02-08", 0], ["Mariam", "Coulibaly", "F", "2013-11-03", 0],
      ["Yann", "Bamba", "M", "2013-06-17", 1], ["Estelle", "Yao", "F", "2013-01-25", 1],
      ["Adama", "Touré", "M", "2013-09-14", 1], ["Nadia", "Kouamé", "F", "2013-05-30", 1],
      ["Moussa", "Diabaté", "M", "2012-03-11", 2], ["Grâce", "Koffi", "F", "2012-07-19", 2],
      ["Oumar", "Soro", "M", "2012-10-06", 2], ["Inès", "Amani", "F", "2012-12-22", 2],
    ];
    db.students = studentProfiles.map((profile, index) => {
      const classItem = db.classes[profile[4]];
      const student = {
        id: Utils.uid(), matricule: `ELV-2026-${Utils.pad(index + 1, 3)}`, firstName: profile[0], lastName: profile[1],
        photo: "", gender: profile[2], dob: profile[3], pob: "Abidjan", address: `${index % 2 ? "Marcory" : "Cocody"}, Abidjan`,
        classId: classItem.id, year: yr, status: index === 10 ? "inactif" : "actif",
        parent: { name: `Parent de ${profile[0]}`, phone: `070809${Utils.pad(index + 11, 2)}`, email: `parent${index + 1}@mail.com`, address: "Abidjan" },
        classHistory: [{ year: yr, classId: classItem.id, className: classItem.name }],
      };
      return student;
    });

    db.grades = [];
    db.students.forEach((student, studentIndex) => {
      const classItem = db.classes.find((item) => item.id === student.classId);
      classItem.subjectTeachers.forEach((assignment, subjectIndex) => {
        const base = 10 + ((studentIndex + subjectIndex * 2) % 8);
        ["Devoir 1", "Devoir 2", "Examen"].forEach((type, gradeIndex) => {
          db.grades.push({ id: Utils.uid(), studentId: student.id, subjectId: assignment.subjectId, classId: classItem.id, term: "Trimestre 1", type, value: Math.min(20, base + (gradeIndex === 2 ? 1 : gradeIndex)), max: 20, date: Utils.today(), teacherId: assignment.teacherId, history: [] });
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

  load();

  return { db: () => db, load, save, all, get, insert, update, remove, setSettings, resetAll };
})();
