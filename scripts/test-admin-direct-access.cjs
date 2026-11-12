const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const members = [
  { user_id: "admin", role: "ADMIN", full_name: "Admin", active: true, teacher_id: null, student_id: null, student_ids: [] },
  { user_id: "other", role: "DIRECTEUR", full_name: "Directeur", active: true, teacher_id: null, student_id: null, student_ids: [] },
];
const filters = [];
let update;
let changedPassword;
const query = {
  select() { return this; },
  update(value) { update = value; return this; },
  eq(field, value) { filters.push([field, value]); return this; },
  async maybeSingle() { return { data: update ? { user_id: "admin" } : members[0], error: null }; },
  then(resolve, reject) { return Promise.resolve({ data: members, error: null }).then(resolve, reject); },
};
const context = {
  console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Utils: { withLoading: (message, callback) => callback() },
  Storage: {
    activateRemoteSchool: async () => {}, db: () => ({ users: [] }), getActiveSchool: () => ({ id: "school1", code: "SCHOOL" }),
    get: () => null, logAction: async () => {},
  },
  supabaseClient: {
    rpc: async () => ({ data: [{ school_id: "school1", school_name: "École" }], error: null }),
    from: (table) => { assert.equal(table, "school_members"); return query; },
    auth: {
      signInWithPassword: async () => ({ data: { user: { id: "admin", email: "admin@example.test" } }, error: null }),
      updateUser: async ({ password }) => { changedPassword = password; return { error: null }; },
    },
  },
};

async function main() {
  vm.createContext(context);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, "../js/auth.js"), "utf8")}\nglobalThis.Auth = Auth;`, context);
  await context.Auth.login("SCHOOL", "admin@example.test", "password");
  const users = await context.Auth.listSchoolUsers();
  assert.equal(users.length, 2);
  assert.equal(users[0].email, "admin@example.test");
  assert.equal(users[1].email, "");
  assert.ok(filters.some(([field, value]) => field === "school_id" && value === "school1"));
  await assert.rejects(context.Auth.updateOwnAdminProfile("Admin modifié", "weak"), /12 caractères/);
  await context.Auth.updateOwnAdminProfile("Admin modifié", "StrongPass12!");
  assert.equal(changedPassword, "StrongPass12!");
  assert.equal(update.full_name, "Admin modifié");
  assert.deepEqual(Object.keys(update), ["full_name"]);
  assert.equal(context.Auth.getCurrentUser().fullName, "Admin modifié");
  assert.ok(filters.some(([field, value]) => field === "user_id" && value === "admin"));
  console.log("Liste des membres et profil administrateur sans fonction Edge : OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });