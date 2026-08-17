/**
 * Authentification simple côté client (sessionStorage) — pas de backend.
 * ⚠️ Les mots de passe sont stockés en clair dans localStorage : ceci est un
 * prototype pédagogique, à ne jamais utiliser tel quel en production.
 */
const Auth = (() => {
  const SESSION_KEY = "scolagest_session_user";

  function login(username, password) {
    const user = Storage.all("users").find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password && u.active !== false
    );
    if (!user) return null;
    sessionStorage.setItem(SESSION_KEY, user.id);
    return user;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getCurrentUser() {
    const id = sessionStorage.getItem(SESSION_KEY);
    if (!id) return null;
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

  function renderLoginScreen(container) {
    const users = Storage.all("users");
    container.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="loginForm">
          <div class="login-brand">🎓 <span>ScolaGest</span></div>
          <p class="text-muted" style="margin-top:-8px;">Connectez-vous pour accéder à l'espace de gestion.</p>
          <div class="field"><label>Nom d'utilisateur</label><input type="text" id="loginUsername" autocomplete="username" required></div>
          <div class="field"><label>Mot de passe</label><input type="password" id="loginPassword" autocomplete="current-password" required></div>
          <div id="loginError" class="login-error" style="display:none;"></div>
          <button type="submit" class="btn" style="width:100%;justify-content:center;">Se connecter</button>
          <hr class="sep">
          <p class="text-muted" style="margin:0 0 8px;font-size:12px;">Comptes de démonstration (clic pour préremplir) :</p>
          <div class="login-demo-list">
            ${users.map((u) => `<button type="button" class="badge badge-primary" data-demo="${u.username}" style="cursor:pointer;border:none;">${ROLE_LABELS[u.role] || u.role} — ${Utils.escapeHtml(u.username)}</button>`).join("")}
          </div>
        </form>
      </div>
    `;
    container.querySelectorAll("[data-demo]").forEach((b) =>
      b.addEventListener("click", () => {
        const user = users.find((u) => u.username === b.dataset.demo);
        container.querySelector("#loginUsername").value = user.username;
        container.querySelector("#loginPassword").value = user.password;
      })
    );
    container.querySelector("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const username = container.querySelector("#loginUsername").value;
      const password = container.querySelector("#loginPassword").value;
      const user = login(username, password);
      const errBox = container.querySelector("#loginError");
      if (!user) {
        errBox.textContent = "Identifiants incorrects ou compte désactivé.";
        errBox.style.display = "block";
        return;
      }
      App.start();
    });
  }

  return { login, logout, getCurrentUser, isLoggedIn, scopedStudentIds, renderLoginScreen };
})();
