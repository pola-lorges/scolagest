const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const data = {
  settings: { bulletin: {}, schoolName: "École test", currentYear: "2026-2027" },
  classes: [{ id: "form1", name: "Form 1", subjectTeachers: ["biology", "math", "ict", "manual", "sports"].map((subjectId) => ({ subjectId })) }],
  subjects: [
    { id: "biology", name: "Biology" }, { id: "math", name: "Mathematics" },
    { id: "ict", name: "ICT / Computer Science" }, { id: "manual", name: "Manual Labor" },
    { id: "sports", name: "SPORTS-PES" },
  ],
  students: [
    { id: "target", classId: "form1", firstName: "Test", lastName: "Eleve" },
    { id: "second", classId: "form1", firstName: "Second", lastName: "Eleve" },
    { id: "third", classId: "form1", firstName: "Third", lastName: "Eleve" },
  ],
  teachers: [],
  grades: [],
};

for (const [studentId, marks] of Object.entries({
  target: { math: 18, biology: 4 }, second: { math: 12, biology: 15 }, third: { math: 6, biology: 8 },
})) {
  for (const [subjectId, value] of Object.entries(marks)) {
    data.grades.push({ studentId, subjectId, term: "Trimestre 1", sequence: "Séquence 1", type: "Évaluation harmonisée", value, max: 20 });
  }
}

const listeners = new Map();
const controls = new Map();
for (const selector of ["#bClass", "#bTerm", "#bSequence", "#bStudent", "#btnDownloadSequence", "#btnDownloadTerm"]) {
  controls.set(selector, { value: selector === "#bClass" ? "form1" : selector === "#bTerm" ? "Trimestre 1" : selector === "#bSequence" ? "Séquence 1" : "target", addEventListener: (event, callback) => listeners.set(`${selector}:${event}`, callback) });
}
const container = { innerHTML: "", querySelector: (selector) => controls.get(selector) || { addEventListener: () => {} } };
const definitions = [];
const context = {
  Storage: {
    db: () => data,
    all: (name) => data[name] || [],
    get: (name, id) => (data[name] || []).find((item) => item.id === id) || null,
    subjectCoefficient: () => 1,
    logAction: async () => {},
  },
  Auth: { scopedStudentIds: () => null },
  Permissions: { canEdit: () => true },
  Utils: {
    compareFrenchNames: (left, right) => String(left).localeCompare(String(right)),
    comparePeople: () => 0,
    escapeHtml: (value) => String(value ?? ""),
    withButtonLoading: (button, label, callback) => callback(),
    downloadPdfMake: async (definition) => definitions.push(definition),
    toast: () => {},
    formatDate: () => "01/01/2010",
  },
  pdfMake: { createPdf: () => {} },
};

async function main() {
  vm.createContext(context);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/grades.js"), "utf8")}\nglobalThis.Grades = Grades;`, context);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/bulletins.js"), "utf8")}\nglobalThis.Bulletins = Bulletins;`, context);
  context.Bulletins.render(container);
  await listeners.get("#btnDownloadSequence:click")({ currentTarget: controls.get("#btnDownloadSequence") });
  await listeners.get("#btnDownloadTerm:click")({ currentTarget: controls.get("#btnDownloadTerm") });

  assert.equal(definitions.length, 2);
  for (const definition of definitions) {
    const table = definition.content.find((item) => item.table?.body?.[0]?.[0]?.text === "Matieres").table.body;
    const subjectRows = table.filter((row) => ["Biology", "Mathematics"].includes(row[0]?.text));
    assert.deepEqual(JSON.parse(JSON.stringify(subjectRows.map((row) => [row[0].text, row[7]]))), [["Biology", "3e"], ["Mathematics", "1e"]]);
    const groupLabels = Array.from(table, (row) => row[0]?.text).filter((text) => typeof text === "string" && text.startsWith("TOTAL ENSEIGNEMENT"));
    assert.deepEqual(groupLabels, [
      "TOTAL ENSEIGNEMENT GENERAL",
      "TOTAL ENSEIGNEMENT TECHNIQUE ET PROFESSIONNEL",
      "TOTAL ENSEIGNEMENT COMPLEMENTAIRE",
    ]);
    assert.ok(table.some((row) => row[0]?.text === "ICT / Computer Science"));
    assert.ok(table.some((row) => row[0]?.text === "Manual Labor"));
    assert.ok(table.some((row) => row[0]?.text === "SPORTS-PES"));
  }
  console.log("Rangs par matière et catégories des bulletins séquentiel/trimestriel : OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });