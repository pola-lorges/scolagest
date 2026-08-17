/**
 * Matrice des droits d'accès par rôle.
 * Niveaux : 'full' (voir + créer/modifier/supprimer), 'view' (lecture seule), 'none' (aucun accès).
 * Pour PARENT et ELEVE, les vues sont automatiquement filtrées sur leur(s) propre(s) élève(s) (voir Auth.scopedStudentIds).
 */
const ROLES = ["ADMIN", "DIRECTEUR", "ADMINISTRATION", "ENSEIGNANT", "PARENT", "ELEVE"];

const ROLE_LABELS = {
  ADMIN: "Administrateur",
  DIRECTEUR: "Directeur",
  ADMINISTRATION: "Administration",
  ENSEIGNANT: "Enseignant",
  PARENT: "Parent",
  ELEVE: "Élève",
};

const PERMISSIONS = {
  dashboard:  { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "none", ELEVE: "none" },
  students:   { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "view", ELEVE: "view" },
  classes:    { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "none", ELEVE: "none" },
  teachers:   { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "none", ELEVE: "none" },
  subjects:   { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "none", ELEVE: "none" },
  grades:     { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "view", ENSEIGNANT: "full", PARENT: "view", ELEVE: "view" },
  bulletins:  { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "view", ELEVE: "view" },
  attendance: { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "full", PARENT: "view", ELEVE: "view" },
  timetable:  { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "view", PARENT: "view", ELEVE: "view" },
  payments:   { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "none", PARENT: "view", ELEVE: "none" },
  parents:    { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "none", PARENT: "full", ELEVE: "view" },
  documents:  { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "full", ENSEIGNANT: "none", PARENT: "view", ELEVE: "view" },
  users:      { ADMIN: "full", DIRECTEUR: "view", ADMINISTRATION: "none", ENSEIGNANT: "none", PARENT: "none", ELEVE: "none" },
  settings:   { ADMIN: "full", DIRECTEUR: "full", ADMINISTRATION: "none", ENSEIGNANT: "none", PARENT: "none", ELEVE: "none" },
};

const Permissions = (() => {
  function levelForRole(module, role) {
    return (PERMISSIONS[module] && PERMISSIONS[module][role]) || "none";
  }

  function level(module) {
    const user = Auth.getCurrentUser();
    if (!user) return "none";
    return levelForRole(module, user.role);
  }

  function can(module) {
    return level(module) !== "none";
  }

  function canEdit(module) {
    return level(module) === "full";
  }

  return { levelForRole, level, can, canEdit };
})();
