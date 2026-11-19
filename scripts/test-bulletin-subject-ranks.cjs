const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const data = {
  settings: { bulletin: { logo: "assets/logo-etablissement.jpg" }, schoolName: "FONDATION SCOLAIRE IRENE PATRINI RENATO", currentYear: "2026-2027" },
  classes: [{ id: "form1", name: "Form 1", subjectTeachers: ["english", "literature", "french", "citizenship", "home-economics", "geography", "history", "math", "biology", "ict", "physics", "chemistry", "manual", "sports"].map((subjectId) => ({ subjectId })) }],
  subjects: [
    { id: "biology", name: "Biology" }, { id: "chemistry", name: "Chemistry" },
    { id: "citizenship", name: "Citizenship" }, { id: "english", name: "English Language" },
    { id: "literature", name: "English Literature" }, { id: "french", name: "French" },
    { id: "geography", name: "Geography" }, { id: "history", name: "History" },
    { id: "home-economics", name: "Home Economics" }, { id: "ict", name: "ICT / Computer Science" },
    { id: "manual", name: "Manual Labor" }, { id: "math", name: "Mathematics" },
    { id: "physics", name: "Physics" }, { id: "sports", name: "SPORTS-PES" },
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
for (const selector of ["#bClass", "#bTerm", "#bSequence", "#bStudent", "#btnGenerate", "#btnDownloadSequence", "#btnDownloadTerm"]) {
  controls.set(selector, { value: selector === "#bClass" ? "form1" : selector === "#bTerm" ? "Trimestre 1" : selector === "#bSequence" ? "Séquence 1" : "target", addEventListener: (event, callback) => listeners.set(`${selector}:${event}`, callback) });
}
const preview = { innerHTML: "" };
const container = { innerHTML: "", querySelector: (selector) => controls.get(selector) || { addEventListener: () => {} } };
const definitions = [];
class TestImage {
  naturalWidth = 100;
  naturalHeight = 100;
  set src(value) { this.onload(); }
}
function testCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {},
      getImageData: (_x, _y, width, height) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let offset = 0; offset < data.length; offset += 4) data.set([255, 255, 255, 255], offset);
        for (let y = 15; y < 85; y++) {
          for (let x = 20; x < 80; x++) data.set([0, 99, 180, 255], (y * width + x) * 4);
        }
        return { data, width, height };
      },
    }),
    toDataURL: () => "data:image/png;base64,cropped-school-logo",
  };
}
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
    safeImageSrc: (value) => String(value || ""),
  },
  pdfMake: { createPdf: () => {} },
  Image: TestImage,
  document: { createElement: (tag) => tag === "canvas" ? testCanvas() : null, getElementById: (id) => id === "bulletinArea" ? preview : null },
};

async function main() {
  vm.createContext(context);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/grades.js"), "utf8")}\nglobalThis.Grades = Grades;`, context);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/bulletins.js"), "utf8")}\nglobalThis.Bulletins = Bulletins;`, context);
  context.Bulletins.render(container);
  await listeners.get("#btnGenerate:click")({ currentTarget: controls.get("#btnGenerate") });
  await listeners.get("#btnDownloadSequence:click")({ currentTarget: controls.get("#btnDownloadSequence") });
  await listeners.get("#btnDownloadTerm:click")({ currentTarget: controls.get("#btnDownloadTerm") });

  const expectedGroups = [
    "TOTAL OF LANGUAGES AND LECTURE",
    "TOTAL OF HUMAN AND SOCIAL SCIENCES",
    "TOTAL OF SCIENCES AND TECHNOLOGY",
    "TOTAL OF OTHER SUBJECTS",
  ];
  const expectedSubjects = [
    "English Language", "English Literature", "French",
    "Citizenship", "Home Economics", "Geography", "History",
    "Mathematics", "Biology", "ICT / Computer Science", "Physics", "Chemistry",
    "Manual Labor", "SPORTS-PES",
  ];
  const forbiddenFrenchLabels = /Moyenne|Rang de l'eleve|NOMS ET PRENOMS|MATRICULE|PROFESSEUR|EFFECTIF|BULLETIN DE NOTES|Séquence|Trimestre|VISA DU|Le bulletin/i;
  assert.ok(preview.innerHTML.includes("RÉPUBLIQUE DU CAMEROUN"));
  assert.ok(preview.innerHTML.includes("REPUBLIC OF CAMEROON"));
  assert.ok(preview.innerHTML.includes("IRENE PATRINI RENATO FOUNDATION SCHOOL"));
  for (const text of expectedGroups) assert.ok(preview.innerHTML.includes(text));
  assert.ok(preview.innerHTML.indexOf(expectedGroups[0]) < preview.innerHTML.indexOf(expectedGroups[1]));
  assert.ok(preview.innerHTML.indexOf(expectedGroups[1]) < preview.innerHTML.indexOf(expectedGroups[2]));
  assert.ok(preview.innerHTML.indexOf(expectedGroups[2]) < preview.innerHTML.indexOf(expectedGroups[3]));
  assert.ok(!forbiddenFrenchLabels.test(preview.innerHTML));

  assert.equal(definitions.length, 2);
  for (const definition of definitions) {
    const headerColumns = definition.content[0].table.body[0];
    assert.equal(headerColumns.length, 3);
    const frenchHeader = headerColumns[0].stack.map((line) => line.text).join(" ");
    const englishHeader = headerColumns[2].stack.map((line) => line.text).join(" ");
    assert.equal(headerColumns[1].image, "establishmentLogo");
    assert.equal(definition.images.establishmentLogo, "data:image/png;base64,cropped-school-logo");
    assert.match(frenchHeader, /REPUBLIQUE DU CAMEROUN/);
    assert.match(englishHeader, /REPUBLIC OF CAMEROON/);
    assert.match(frenchHeader, /FONDATION SCOLAIRE IRENE PATRINI RENATO/);
    assert.match(englishHeader, /IRENE PATRINI RENATO FOUNDATION SCHOOL/);
    const table = definition.content.find((item) => item.table?.body?.[0]?.[0]?.text === "Subject").table.body;
    assert.ok(table[0].every((cell) => cell.fillColor === "#4abdec" && cell.color === "#000000"));
    const subjectRows = table.filter((row) => expectedSubjects.includes(row[0]?.text));
    assert.deepEqual(JSON.parse(JSON.stringify(subjectRows.map((row) => row[0].text))), expectedSubjects);
    assert.equal(table.find((row) => row[0]?.text === "Biology")[7], "3rd");
    assert.equal(table.find((row) => row[0]?.text === "Mathematics")[7], "1st");
    const groupLabels = Array.from(table, (row) => row[0]?.text).filter((text) => typeof text === "string" && text.startsWith("TOTAL OF"));
    assert.deepEqual(groupLabels, expectedGroups);
    const categoryRows = table.filter((row) => row[0]?.text?.startsWith("TOTAL OF"));
    assert.ok(categoryRows.every((row) => row.every((cell) => cell.fillColor === "#4abdec" && cell.color === "#000000")));
    const identityTable = definition.content.find((item) => item.table?.body?.[0]?.[0]?.text === "STUDENT NAME").table.body;
    assert.equal(definition.styles.labelCell.fillColor, "#ffffff");
    assert.equal(definition.styles.labelCell.color, "#000000");
    assert.equal(definition.styles.valueCell.fillColor, "#ffffff");
    assert.ok(identityTable.flat().every((cell) => definition.styles[cell.style]?.fillColor !== "#4abdec"));
    const bulletinText = definition.content.flatMap((item) => item.text ? [item.text] : item.table?.body?.flatMap((row) => row.flatMap((cell) => [cell.text, ...(cell.stack || []).map((entry) => entry.text)].filter((value) => typeof value === "string"))) || [] ).join(" ");
    assert.ok(!forbiddenFrenchLabels.test(bulletinText));
  }

  const middleSubjects = [
    ["ms-english", "Anglais"], ["ms-spelling", "Correction orthographique"],
    ["ms-writing", "Expression écrite"], ["ms-text", "Étude de texte"],
    ["ms-speaking", "Expression orale"], ["ms-history", "Histoire"],
    ["ms-geography", "Géographie"], ["ms-ecm", "ECM"],
    ["ms-math", "Mathématiques"], ["ms-svt", "SVT"], ["ms-computing", "Informatique"],
    ["ms-pe", "EPS"], ["ms-manual", "Travail manuel"],
    ["ms-spanish", "Espagnol"], ["ms-german", "Allemand"],
  ].map(([id, name]) => ({ id, name }));
  data.subjects.push(...middleSubjects);

  const middleClasses = [
    { id: "class-6e", name: "6ème", language: null },
    { id: "class-5e", name: "5ème", language: null },
    { id: "class-4e-all", name: "4ème All", language: "Allemand" },
    { id: "class-4e-esp", name: "4ème Esp", language: "Espagnol" },
    { id: "class-3e-all", name: "3ème All", language: "Allemand" },
    { id: "class-3e-esp", name: "3ème Esp", language: "Espagnol" },
  ];
  const expectedMiddleGroups = [
    "TOTAL LITTERATURE ET CULTURE GENERALE",
    "TOTAL SCIENCE UNIVERSELLE",
    "TOTAL ENSEIGNEMENT DIVERS",
  ];
  for (const classCase of middleClasses) {
    const assignedSubjects = middleSubjects.filter((subject) => !["Espagnol", "Allemand"].includes(subject.name) || subject.name === classCase.language);
    data.classes.push({ id: classCase.id, name: classCase.name, subjectTeachers: assignedSubjects.map((subject) => ({ subjectId: subject.id })) });
    const student = { id: `student-${classCase.id}`, classId: classCase.id, firstName: "Test", lastName: classCase.name };
    data.students.push(student);
    controls.get("#bClass").value = classCase.id;
    controls.get("#bStudent").value = student.id;

    await listeners.get("#btnGenerate:click")({ currentTarget: controls.get("#btnGenerate") });
    await listeners.get("#btnDownloadSequence:click")({ currentTarget: controls.get("#btnDownloadSequence") });
    assert.ok(expectedMiddleGroups.every((label) => preview.innerHTML.includes(label)), `${classCase.name}: preview categories`);
    assert.equal(preview.innerHTML.includes("Espagnol"), classCase.language === "Espagnol", `${classCase.name}: Spanish assignment`);
    assert.equal(preview.innerHTML.includes("Allemand"), classCase.language === "Allemand", `${classCase.name}: German assignment`);

    const definition = definitions.at(-1);
    const table = definition.content.find((item) => item.table?.body?.[0]?.[0]?.text === "Subject").table.body;
    const actualByGroup = Object.fromEntries(expectedMiddleGroups.map((label) => [label, []]));
    let activeGroupIndex = 0;
    for (const row of table.slice(1)) {
      const label = row[0]?.text;
      if (expectedMiddleGroups.includes(label)) {
        activeGroupIndex++;
      } else if (middleSubjects.some((subject) => subject.name === label)) {
        actualByGroup[expectedMiddleGroups[activeGroupIndex]].push(label);
      }
    }
    assert.deepEqual(JSON.parse(JSON.stringify(actualByGroup)), {
      [expectedMiddleGroups[0]]: ["Anglais", ...(classCase.language ? [classCase.language] : []), "Correction orthographique", "Expression écrite", "Étude de texte", "Expression orale", "Histoire", "Géographie", "ECM"],
      [expectedMiddleGroups[1]]: ["Mathématiques", "SVT", "Informatique"],
      [expectedMiddleGroups[2]]: ["EPS", "Travail manuel"],
    }, `${classCase.name}: subject categories`);
  }
  console.log("Form 1 and middle-school categories, requested language streams, and bulletin output: OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });