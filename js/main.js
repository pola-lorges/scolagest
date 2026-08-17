/**
 * Point d'entrée de l'application.
 */
/**
 * Point d'entrée de l'application : bascule entre écran de connexion et application.
 */
const App = (() => {
  function showLogin() {
    document.getElementById("app").style.display = "none";
    const loginScreen = document.getElementById("loginScreen");
    loginScreen.style.display = "flex";
    Auth.renderLoginScreen(loginScreen);
  }

  function start() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "flex";
    const user = Auth.getCurrentUser();
    document.getElementById("userBadge").textContent = `👤 ${user.fullName || user.username} — ${ROLE_LABELS[user.role] || user.role}`;
    if (window.location.hash === "" || !Permissions.can(window.location.hash.replace("#/", ""))) {
      window.location.hash = "#/dashboard";
    }
    Router.init();
  }

  function init() {
    if (Auth.isLoggedIn()) {
      start();
    } else {
      showLogin();
    }
  }

  return { init, start, showLogin };
})();

document.addEventListener("DOMContentLoaded", () => {
  App.init();

  const toggleBtn = document.getElementById("toggleSidebar");
  const sidebar = document.getElementById("sidebar");
  toggleBtn.addEventListener("click", () => {
    if (window.innerWidth <= 900) {
      sidebar.classList.toggle("open");
    } else {
      sidebar.classList.toggle("collapsed");
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    Auth.logout();
    App.showLogin();
  });

  const THEME_KEY = "scolagest_theme";
  const themeBtn = document.getElementById("toggleTheme");
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    themeBtn.title = theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre";
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
});
