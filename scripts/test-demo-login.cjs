const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const session = new Map();
const local = new Map();
let uid = 0;
let authCalls = 0;
const elements = {};
const makeElement = () => ({ addEventListener(event, callback) { this[`on${event}`] = callback; }, setAttribute() {} });
elements["#loginSchool"] = { ...makeElement(), value: "" };
elements["#loginEmail"] = { ...makeElement(), required: true };
elements["#loginPassword"] = { ...makeElement(), required: true, type: "password" };
elements["#toggleLoginPassword"] = makeElement();
elements["button[type='submit']"] = { disabled: false };
elements["#loginForm"] = { ...makeElement(), querySelector: (selector) => elements[selector] };
const context = {
  console,
  setInterval: () => 1,
  clearInterval: () => {},
  clearTimeout: () => {},
  localStorage: {
    getItem: (key) => local.get(key) || null,
    setItem: (key, value) => local.set(key, value),
    removeItem: (key) => local.delete(key),
  },
  sessionStorage: {
    getItem: (key) => session.get(key) || null,
    setItem: (key, value) => session.set(key, value),
    removeItem: (key) => session.delete(key),
  },
  Utils: {
    uid: () => `id-${++uid}`,
    pad: (value, length) => String(value).padStart(length, "0"),
    today: () => "2026-11-25",
    withLoading: (message, callback) => callback(),
    toast: () => {},
  },
  supabaseClient: {
    auth: {
      signInWithPassword: async () => { authCalls += 1; throw new Error("Unexpected authentication request"); },
      getSession: async () => { authCalls += 1; return { data: { session: null }, error: null }; },
      signOut: async () => { authCalls += 1; },
    },
  },
};

vm.createContext(context);
for (const file of ["storage.js", "auth.js"]) {
  const name = file === "storage.js" ? "Storage" : "Auth";
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, `../js/${file}`), "utf8")}\nglobalThis.${name} = ${name};`, context);
}
vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/payments.js"), "utf8")}\nglobalThis.Payments = Payments;`, context);
vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/grades.js"), "utf8")}\nglobalThis.Grades = Grades;`, context);

async function main() {
  const loginContainer = {
    innerHTML: "",
    querySelector: (selector) => elements[selector],
  };
  context.Auth.renderLoginScreen(loginContainer);
  elements["#loginSchool"].value = "DEMO";
  elements["#loginSchool"].oninput();
  assert.equal(elements["#loginEmail"].required, false);
  assert.equal(elements["#loginPassword"].required, false);
  elements["#loginSchool"].value = "ECOLE";
  elements["#loginSchool"].oninput();
  assert.equal(elements["#loginEmail"].required, true);
  assert.equal(elements["#loginPassword"].required, true);

  const user = await context.Auth.login(" demo ", "", "");
  assert.equal(user.role, "ADMIN");
  assert.equal(context.Auth.isDemoSession(), true);
  assert.equal(context.Storage.getActiveSchool().name, "FONDATION SCOLAIRE IRENE PATRINI RENATO");
  assert.equal(context.Storage.db().students.length, 180);
  context.Storage.all("classes").forEach((classItem) => {
    assert.ok(context.Storage.all("students").filter((student) => student.classId === classItem.id).length >= 11, `${classItem.name} doit avoir au moins 11 élèves`);
  });
  assert.match(context.Storage.db().students[0].matricule, /^DEMO-/);
  assert.equal(context.Storage.db().students[0].parent.email, "parent1@example.test");
  assert.equal(context.Storage.all("payments").length, 180);
  const gradesBySlot = new Map();
  context.Storage.all("grades").forEach((grade) => {
    const key = `${grade.studentId}|${grade.subjectId}|${grade.term}|${grade.sequence}`;
    gradesBySlot.set(key, [...(gradesBySlot.get(key) || []), grade]);
  });
  const bulletinPeriods = [
    ["Trimestre 1", ["Séquence 1", "Séquence 2"]],
    ["Trimestre 2", ["Séquence 3", "Séquence 4"]],
    ["Trimestre 3", ["Séquence 5"]],
  ];
  context.Storage.all("classes").forEach((classItem) => {
    const classStudents = context.Storage.all("students").filter((student) => student.classId === classItem.id);
    classStudents.forEach((student) => {
      classItem.subjectTeachers.forEach((assignment) => {
        bulletinPeriods.forEach(([term, sequences]) => sequences.forEach((sequence) => {
          const notes = gradesBySlot.get(`${student.id}|${assignment.subjectId}|${term}|${sequence}`) || [];
          assert.ok(notes.some((grade) => grade.type === "DEV1"), `Note harmonisée manquante pour ${student.matricule}`);
          assert.ok(notes.some((grade) => grade.type === "Évaluation hebdomadaire"), `Note hebdomadaire manquante pour ${student.matricule}`);
        }));
      });
    });
    const representative = classStudents[0];
    bulletinPeriods.forEach(([term, sequences]) => sequences.forEach((sequence) => {
      const average = context.Grades.studentGeneralAverage(representative.id, classItem.id, term, sequence);
      assert.ok(Number.isFinite(average) && average >= 0 && average <= 20, `Moyenne de bulletin invalide pour ${classItem.name} / ${sequence}`);
    }));
  });
  const demoStatuses = new Set();
  context.Storage.all("students").forEach((student) => {
    const record = context.Storage.all("payments").find((payment) => payment.studentId === student.id);
    assert.ok(record, `Dossier de paiement manquant pour ${student.matricule}`);
    const breakdown = context.Payments.breakdownForStudent(student.id);
    assert.ok(breakdown.totals.total > 0);
    assert.ok(breakdown.totals.paid >= 0 && breakdown.totals.paid <= breakdown.totals.total);
    assert.equal(breakdown.totals.remaining, breakdown.totals.total - breakdown.totals.paid);
    breakdown.rows.forEach((row) => {
      assert.ok(row.paid >= 0 && row.paid <= row.due, `Versement incohérent pour ${student.matricule} / ${row.type}`);
    });
    assert.ok(record.transactions.every((transaction) => transaction.feeType));
    demoStatuses.add(breakdown.status.includes("Soldé") ? "Soldé" : breakdown.status.includes("Partiel") ? "Partiel" : "Impayé");
  });
  assert.deepEqual([...demoStatuses].sort(), ["Impayé", "Partiel", "Soldé"]);
  const persistedDemoData = local.get("scolagest_db_v2_demo");
  context.Storage.insert("students", { id: "session-only", firstName: "Test", lastName: "Temporaire" });
  assert.equal(local.get("scolagest_db_v2_demo"), persistedDemoData);
  context.Storage.resetAll();
  assert.equal(context.Storage.db().settings.schoolName, context.Storage.getActiveSchool().name);
  assert.equal(context.Storage.db().students.length, 180);
  assert.equal(await context.Auth.restore(), true);
  assert.equal(authCalls, 0);
  await context.Auth.logout();
  assert.equal(context.Auth.isDemoSession(), false);
  assert.equal(session.has("scolagest_demo_session"), false);
  assert.equal(authCalls, 0);
  console.log("Connexion DEMO locale, restauration et jeu de données fictif : OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });