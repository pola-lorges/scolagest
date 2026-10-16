/**
 * Authentification simple côté client (sessionStorage) — pas de backend.
 * ⚠️ Les mots de passe sont stockés en clair dans localStorage : ceci est un
 * prototype pédagogique, à ne jamais utiliser tel quel en production.
 */
const Auth = (() => {
  const SESSION_KEY = "scolagest_session_user";

  function login(schoolCode, username, password) {
    const school = Storage.findSchoolByCode(schoolCode);
    if (!school) return null;
    Storage.setActiveSchool(school.id);
    const user = Storage.all("users").find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password && u.active !== false
    );
    if (!user) {
      Storage.clearActiveSchool();
      return null;
    }
    sessionStorage.setItem(SESSION_KEY, user.id);
    return user;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    Storage.clearActiveSchool();
  }

  function getCurrentUser() {
    const id = sessionStorage.getItem(SESSION_KEY);
    if (!id || !Storage.getActiveSchool()) return null;
    const user = Storage.get("users", id);
    if (!user || user.active === false) return null;
    return user;
  }

  function isLoggedIn() {
    return !!getCurrentUser();
  }

  // Renvoie la liste des matricules d'élèves auxquels l'utilisateur a droit,
  // ou null si l'utilisateur voit tous les élèves (rôles administratifs/enseignants).
  function scopedStudentIds() {
    const user = getCurrentUser();
    if (!user) return [];
    if (user.role === "PARENT") return user.studentIds || [];
    if (user.role === "ELEVE") return user.studentId ? [user.studentId] : [];
    return null;
  }

  function renderLoginScreen(container, mode = "login") {
    if (mode === "register") return renderRegisterScreen(container);
    const demoSchool = Storage.listSchools().find((s) => s.demo);
    const demoUsers = demoSchool ? JSON.parse(localStorage.getItem(`${DB_KEY}_${demoSchool.id}`) || "{}").users || [] : [];
    container.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="loginForm">
          <div class="login-brand">🎓 <span>ScolaGest</span></div>
          <p class="text-muted" style="margin-top:-8px;">Connectez-vous pour accéder à l'espace de gestion.</p>
          <div class="field"><label>Code de l'établissement</label><input type="text" id="loginSchool" autocomplete="organization" required></div>
          <div class="field"><label>Nom d'utilisateur</label><input type="text" id="loginUsername" autocomplete="username" required></div>
          <div class="field"><label>Mot de passe</label><input type="password" id="loginPassword" autocomplete="current-password" required></div>
          <div id="loginError" class="login-error" style="display:none;"></div>
          <button type="submit" class="btn" style="width:100%;justify-content:center;">Se connecter</button>
          <button type="button" class="btn btn-secondary" id="showRegister" style="width:100%;justify-content:center;margin-top:8px;">Créer un établissement</button>
          ${demoUsers.length ? `<hr class="sep">
          <p class="text-muted" style="margin:0 0 8px;font-size:12px;">Établissement de démonstration (code ${demoSchool.code}) — clic pour préremplir :</p>
          <div class="login-demo-list">
            ${demoUsers.map((u) => `<button type="button" class="badge badge-primary" data-demo="${Utils.escapeHtml(u.username)}" style="cursor:pointer;border:none;">${ROLE_LABELS[u.role] || u.role} — ${Utils.escapeHtml(u.username)}</button>`).join("")}
          </div>` : ""}
        </form>
      </div>
    `;
    container.querySelectorAll("[data-demo]").forEach((b) =>
      b.addEventListener("click", () => {
        const user = demoUsers.find((u) => u.username === b.dataset.demo);
        container.querySelector("#loginSchool").value = demoSchool.code;
        container.querySelector("#loginUsername").value = user.username;
        container.querySelector("#loginPassword").value = user.password;
      })
    );
    container.querySelector("#showRegister").addEventListener("click", () => renderRegisterScreen(container));
    container.querySelector("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const schoolCode = container.querySelector("#loginSchool").value;
      const username = container.querySelector("#loginUsername").value;
      const password = container.querySelector("#loginPassword").value;
      const user = login(schoolCode, username, password);
      const errBox = container.querySelector("#loginError");
      if (!user) {
        errBox.textContent = "Code établissement, identifiants incorrects ou compte désactivé.";
        errBox.style.display = "block";
        return;
      }
      App.start();
    });
  }

  function renderRegisterScreen(container) {
    container.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="registerForm">
          <div class="login-brand">🎓 <span>Nouvel établissement</span></div>
          <div class="field"><label>Nom de l'établissement</label><input type="text" id="regName" required></div>
          <div class="field"><label>Code de l'établissement (utilisé à la connexion)</label><input type="text" id="regCode" pattern="[A-Za-z0-9_-]{2,20}" required></div>
          <div class="field"><label>Nom complet de l'administrateur</label><input type="text" id="regFullName" required></div>
          <div class="field"><label>Nom d'utilisateur administrateur</label><input type="text" id="regUsername" required></div>
          <div class="field"><label>Mot de passe</label><input type="password" id="regPassword" minlength="6" required></div>
          <div id="regError" class="login-error" style="display:none;"></div>
          <button type="submit" class="btn" style="width:100%;justify-content:center;">Créer l'établissement</button>
          <button type="button" class="btn btn-secondary" id="backLogin" style="width:100%;justify-content:center;margin-top:8px;">Retour</button>
        </form>
      </div>
    `;
    container.querySelector("#backLogin").addEventListener("click", () => renderLoginScreen(container));
    container.querySelector("#registerForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const code = container.querySelector("#regCode").value.trim();
      const errBox = container.querySelector("#regError");
      if (Storage.findSchoolByCode(code)) {
        errBox.textContent = "Ce code d'établissement est déjà utilisé.";
        errBox.style.display = "block";
        return;
      }
      Storage.createSchool({
        name: container.querySelector("#regName").value.trim(),
        code,
        adminFullName: container.querySelector("#regFullName").value.trim(),
        adminUsername: container.querySelector("#regUsername").value.trim(),
        adminPassword: container.querySelector("#regPassword").value,
      });
      login(code, container.querySelector("#regUsername").value, container.querySelector("#regPassword").value);
      App.start();
    });
  }

  return { login, logout, getCurrentUser, isLoggedIn, scopedStudentIds, renderLoginScreen };
})();
