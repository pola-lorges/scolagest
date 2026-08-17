/**
 * Routage simple basé sur le hash de l'URL (#/module).
 */
const Router = (() => {
  const routes = {
    dashboard: { title: "Tableau de bord", module: () => Dashboard },
    students: { title: "Gestion des élèves", module: () => Students },
    classes: { title: "Gestion des classes", module: () => Classes },
    teachers: { title: "Gestion des enseignants", module: () => Teachers },
    subjects: { title: "Gestion des matières", module: () => Subjects },
    grades: { title: "Gestion des notes", module: () => Grades },
    bulletins: { title: "Bulletins scolaires", module: () => Bulletins },
    attendance: { title: "Absences & retards", module: () => Attendance },
    timetable: { title: "Emploi du temps", module: () => Timetable },
    payments: { title: "Paiements & frais scolaires", module: () => Payments },
    parents: { title: "Portail parents", module: () => Parents },
    documents: { title: "Gestion documentaire", module: () => Documents },
    users: { title: "Utilisateurs & droits", module: () => Users },
    settings: { title: "Paramètres", module: () => Settings },
  };

  function firstAllowedRoute() {
    return Object.keys(routes).find((name) => Permissions.can(name)) || null;
  }

  function currentRouteName() {
    const hash = window.location.hash.replace("#/", "");
    if (routes[hash]) return hash;
    return firstAllowedRoute() || "dashboard";
  }

  function navigate(name) {
    window.location.hash = "#/" + name;
  }

  function filterSidebar() {
    document.querySelectorAll("#sidebarNav a").forEach((a) => {
      a.style.display = Permissions.can(a.dataset.route) ? "" : "none";
    });
  }

  function render() {
    const name = currentRouteName();
    const route = routes[name];
    document.getElementById("pageTitle").textContent = route.title;
    filterSidebar();
    document.querySelectorAll("#sidebarNav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === name);
    });
    const content = document.getElementById("content");
    if (!Permissions.can(name)) {
      content.innerHTML = `<div class="panel"><div class="empty-state">⛔ Vous n'avez pas les droits nécessaires pour accéder à ce module.</div></div>`;
      return;
    }
    route.module().render(content);
    updateYearBadge();
  }


  function updateYearBadge() {
    const s = Storage.db().settings;
    document.getElementById("yearBadge").textContent = `Année: ${s.currentYear} — ${s.currentTerm}`;
  }

  function init() {
    if (!init._bound) {
      window.addEventListener("hashchange", render);
      init._bound = true;
    }
    render();
  }

  return { init, render, navigate, updateYearBadge };
})();
