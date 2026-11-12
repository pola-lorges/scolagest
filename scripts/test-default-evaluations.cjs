const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const data = {
  settings: { bulletin: { evaluationTypes: ["DEV1"] } },
  classes: [
    { id: "class1", name: "Classe 1", subjectTeachers: [{ subjectId: "subject1", teacherId: "teacher1" }] },
    { id: "class2", name: "Classe 2", subjectTeachers: [{ subjectId: "subject1", teacherId: "teacher1" }] },
  ],
  subjects: [{ id: "subject1", name: "Maths", coefficient: 1 }],
  students: [{ id: "student1", classId: "class1", firstName: "Test", lastName: "Eleve" }],
  grades: [],
};
const listeners = new Map();
const container = {
  innerHTML: "",
  querySelector(selector) {
    return { addEventListener(event, callback) { listeners.set(`${selector}:${event}`, callback); } };
  },
};
const context = {
  Storage: {
    db: () => data,
    all: (collection) => data[collection] || [],
    get: (collection, id) => (data[collection] || []).find((item) => item.id === id) || null,
  },
  Auth: { scopedStudentIds: () => null, getCurrentUser: () => ({ role: "ADMIN" }) },
  Permissions: { canEdit: () => true },
  Utils: { compareFrenchNames: (left, right) => String(left).localeCompare(String(right)), comparePeople: () => 0, escapeHtml: String },
  document: { getElementById: () => null },
  console,
};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/grades.js"), "utf8")}\nglobalThis.Grades = Grades;`, context);

function change(selector, value) {
  const callback = listeners.get(`${selector}:change`);
  assert.ok(callback, `Missing change handler for ${selector}`);
  callback({ target: { value } });
}

context.Grades.render(container);
assert.match(container.innerHTML, /value="Évaluation harmonisée" selected/);
assert.match(container.innerHTML, /DEV1/);
assert.doesNotMatch(container.innerHTML, /id="btnDelEval"/);
change("#gCategory", "weekly");
assert.match(container.innerHTML, /value="Évaluation hebdomadaire" selected/);
assert.doesNotMatch(container.innerHTML, /id="btnDelEval"/);
change("#gClass", "class2");
assert.match(container.innerHTML, /value="Évaluation hebdomadaire" selected/);
for (const term of context.Grades.TERMS) {
  change("#gTerm", term);
  for (const sequence of context.Grades.sequencesForTerm(term)) {
    change("#gSequence", sequence);
    change("#gCategory", "harmonized");
    assert.match(container.innerHTML, /value="Évaluation harmonisée" selected/);
    change("#gCategory", "weekly");
    assert.match(container.innerHTML, /value="Évaluation hebdomadaire" selected/);
  }
}
assert.equal(data.grades.length, 0);
data.grades.push(
  { studentId: "student1", classId: "class1", subjectId: "subject1", term: "Trimestre 1", sequence: "Séquence 1", type: "Évaluation harmonisée", value: 10, max: 20 },
  { studentId: "student1", classId: "class1", subjectId: "subject1", term: "Trimestre 1", sequence: "Séquence 1", type: "Évaluation hebdomadaire", value: 20, max: 20 },
);
assert.equal(context.Grades.studentAverageForSequence("student1", "subject1", "Trimestre 1", "Séquence 1"), 13);
console.log("Évaluations automatiques et moyenne pondérée : OK");