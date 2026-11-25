const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let role = "ADMIN";
const listeners = new Map();
const elements = new Map();
const element = (selector) => {
  if (!elements.has(selector)) {
    elements.set(selector, {
      addEventListener(event, callback) { listeners.set(`${selector}:${event}`, callback); },
      remove() {}, click() { this.clicked = true; },
      style: {}, files: [], value: "", disabled: false,
    });
  }
  return elements.get(selector);
};
const container = {
  innerHTML: "",
  querySelector: element,
};
const downloaded = [];
const context = {
  Blob,
  URL: {
    createObjectURL(blob) { downloaded.push(blob); return "blob:backup"; },
    revokeObjectURL() {},
  },
  setTimeout,
  document: {
    createElement: () => element("downloadLink"),
    body: { appendChild() {} },
  },
  Auth: {
    getCurrentUser: () => ({ role }),
    isDemoSession: () => true,
    listSchoolUsers: async () => { throw new Error("Une session démo ne doit pas interroger les comptes distants"); },
  },
  Storage: {
    db: () => ({ settings: { schoolName: "École Exemple" }, students: [{ id: "s1", firstName: "Awa" }], users: [{ id: "u1", username: "admin", password: "should-not-export" }] }),
    all: (name) => name === "users" ? [{ id: "u1", username: "admin", password: "should-not-export" }] : [],
    getActiveSchool: () => ({ id: "school1", name: "École Exemple", code: "ECOLE" }),
    getAuditLogs: async () => ({ items: [], total: 0 }),
  },
  Permissions: { canEdit: () => role === "ADMIN" },
  Utils: {
    escapeHtml: (value) => String(value ?? ""),
    toast: (message, kind) => { context.lastToast = { message, kind }; },
    safeImageSrc: () => "",
  },
  Router: { updateYearBadge() {} },
  console,
};

vm.createContext(context);
vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/modules/settings.js"), "utf8")}\nglobalThis.Settings = Settings;`, context);

async function main() {
  const payload = context.Settings.buildExportPayload({ users: [{ password: "hidden", profile: { access_token: "hidden", fullName: "Awa" } }] }, [{ email: "admin@example.test", api_key: "hidden" }], { name: "École Exemple", refreshToken: "hidden" });
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /admin@example\.test/);
  assert.match(serialized, /Awa/);
  assert.doesNotMatch(serialized, /password|access_token|api_key|refreshToken|hidden/i);

  context.Settings.render(container);
  assert.match(container.innerHTML, /id="exportDatabase"/);
  const exportHandler = listeners.get("#exportDatabase:click");
  assert.ok(exportHandler);
  await exportHandler({ currentTarget: element("#exportDatabase") });
  assert.equal(downloaded.length, 1);
  const downloadedJson = await downloaded[0].text();
  assert.match(downloadedJson, /"firstName": "Awa"/);
  assert.match(downloadedJson, /"username": "admin"/);
  assert.doesNotMatch(downloadedJson, /password|should-not-export/i);

  role = "DIRECTEUR";
  listeners.clear();
  context.Settings.render(container);
  assert.doesNotMatch(container.innerHTML, /id="exportDatabase"/);

  console.log("Export paramètres réservé à ADMIN, base complète et secrets exclus : OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });