const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const members = [
  { id: "admin", username: "admin@example.test", fullName: "Admin", role: "ADMIN", active: true, authManaged: true },
  { id: "teacher", username: "", fullName: "Professeur", role: "ENSEIGNANT", teacherId: "teacher-profile", active: true, authManaged: true },
];
const collections = { users: [], teachers: [{ id: "teacher-profile", firstName: "Awa", lastName: "Ndi" }], students: [] };
const editHandlers = new Map();
const wrap = {
  isConnected: true,
  innerHTML: "",
  querySelectorAll(selector) {
    if (selector !== "[data-edit]") return [];
    return [...this.innerHTML.matchAll(/data-edit="([^"]+)"/g)].map((match) => ({
      dataset: { edit: match[1] },
      addEventListener(event, callback) { if (event === "click") editHandlers.set(match[1], callback); },
    }));
  },
};
const container = {
  innerHTML: "",
  querySelector(selector) {
    if (selector === "#usersTableWrap") return wrap;
    return { addEventListener() {} };
  },
};
let modal;
let requests = 0;
let updatePayload;
const context = {
  Storage: {
    all: (name) => collections[name],
    get: (name, id) => collections[name].find((item) => item.id === id) || null,
    insert: (name, item) => collections[name].push(item),
    update: (name, id, patch) => Object.assign(collections[name].find((item) => item.id === id), patch),
    flushRemoteSave: async () => {},
  },
  Auth: {
    getCurrentUser: () => members[0],
    listSchoolUsers: async () => { requests++; return members; },
    managePortalUser: async (payload) => { updatePayload = payload; return { updated: true }; },
  },
  Permissions: { canEdit: () => true, levelForRole: () => "full" },
  ROLES: ["ADMIN", "ENSEIGNANT"],
  ROLE_LABELS: { ADMIN: "Administrateur", ENSEIGNANT: "Enseignant" },
  PERMISSIONS: { users: {} },
  Utils: {
    compareFrenchNames: (left, right) => String(left).localeCompare(String(right)), comparePeople: () => 0,
    escapeHtml: (value) => String(value ?? ""), openModal: (options) => { modal = options; }, closeModal() {},
    validateRequired: () => true, withButtonLoading: (button, text, callback) => callback(), toast() {},
  },
  document: { getElementById: (id) => id === "usersTableWrap" ? wrap : null },
};

async function main() {
  vm.createContext(context);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/users.js"), "utf8")}\nglobalThis.Users = Users;`, context);
  context.Users.render(container);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.match(wrap.innerHTML, /admin@example\.test/);
  assert.match(wrap.innerHTML, /Adresse e-mail indisponible/);
  assert.ok(editHandlers.has("admin"));
  assert.ok(editHandlers.has("teacher"));
  editHandlers.get("admin")();
  assert.match(modal.bodyHtml, /admin@example\.test/);
  assert.match(modal.bodyHtml, /id="fRole" required disabled/);
  assert.match(modal.bodyHtml, /id="fActive" disabled/);
  editHandlers.get("teacher")();
  assert.match(modal.bodyHtml, /placeholder="Adresse e-mail indisponible"/);
  assert.match(modal.bodyHtml, /value="teacher-profile" selected/);
  const controls = {
    "#fRole": { value: "ENSEIGNANT" }, "#fPassword": { value: "" }, "#togglePassword": {},
    "#linkTeacherField": { style: {} }, "#linkStudentField": { style: {} }, "#linkParentField": { style: {} },
    "#fEmail": { value: "" }, "#fTeacher": { value: "teacher-profile" }, "#fStudent": { value: "" },
    "#fStudentsMulti": { selectedOptions: [] }, "#fFullName": { value: "Nouveau nom" }, "#fActive": { value: "1" },
    "#cancelForm": {}, "#saveUser": {},
  };
  for (const control of Object.values(controls)) control.addEventListener = (event, callback) => { control[event] = callback; };
  modal.onMount({ querySelector: (selector) => controls[selector] });
  await controls["#saveUser"].click({ currentTarget: controls["#saveUser"] });
  assert.equal(updatePayload.action, "update");
  assert.equal(updatePayload.userId, "teacher");
  assert.equal(updatePayload.fullName, "Nouveau nom");
  assert.equal(updatePayload.email, undefined);
  console.log("Liste et modification des comptes serveur : OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });