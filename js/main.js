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
    document.getElementById("userBadge").textContent = `🏫 ${Storage.getActiveSchool().name} · 👤 ${user.fullName || user.username} — ${ROLE_LABELS[user.role] || user.role}`;
    if (window.location.hash === "" || !Permissions.can(window.location.hash.replace("#/", ""))) {
      window.location.hash = user.role === "PARENT" || user.role === "ELEVE" ? "#/parents" : "#/dashboard";
    }
    Router.init();
    Auth.watchInactivity(() => {
      Auth.logout().finally(() => {
        showLogin();
        Utils.toast("Session fermée après 5 minutes d'inactivité.", "info");
      });
    });
  }

  async function init() {
    if (await Auth.restore()) {
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
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const mobileMenuQuery = window.matchMedia("(max-width: 900px)");
  function closeMobileMenu() {
    sidebar.classList.remove("open");
    sidebarBackdrop.hidden = true;
    sidebarBackdrop.setAttribute("aria-hidden", "true");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  function openMobileMenu() {
    sidebar.classList.add("open");
    sidebarBackdrop.hidden = false;
    sidebarBackdrop.setAttribute("aria-hidden", "false");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  let wasMobile = mobileMenuQuery.matches;
  mobileMenuQuery.addEventListener("change", (event) => {
    if (event.matches !== wasMobile) {
      wasMobile = event.matches;
      sidebar.classList.remove("open", "collapsed");
      closeMobileMenu();
    }
  });
  toggleBtn.addEventListener("click", () => {
    if (mobileMenuQuery.matches) {
      if (sidebar.classList.contains("open")) closeMobileMenu();
      else openMobileMenu();
    } else {
      sidebar.classList.toggle("collapsed");
    }
  });
  sidebarBackdrop.addEventListener("click", closeMobileMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenuQuery.matches) closeMobileMenu();
  });
  document.getElementById("sidebarNav").addEventListener("click", (event) => {
    if (event.target.closest("a") && mobileMenuQuery.matches) closeMobileMenu();
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
