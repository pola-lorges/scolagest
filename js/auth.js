const Auth = (() => {
  const SCHOOL_CODE_KEY = "scolagest_school_code";
  let currentUser = null;

  async function activateUser(authUser, schoolCode) {
    const { data: schools, error: schoolError } = await supabaseClient.rpc("current_user_school", { target_code: schoolCode });
    if (schoolError) throw schoolError;
    const school = schools?.[0];
    if (!school) throw new Error("Compte ou code établissement invalide.");

    const { data: membership, error: membershipError } = await supabaseClient
      .from("school_members")
      .select("role, full_name")
      .eq("school_id", school.school_id)
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || membership.role !== "ADMIN") throw new Error("Seuls les administrateurs sont activés pour le moment.");

    await Storage.activateRemoteSchool({ id: school.school_id, name: school.school_name, code: schoolCode });
    sessionStorage.setItem(SCHOOL_CODE_KEY, schoolCode.trim());
    currentUser = {
      id: authUser.id,
      email: authUser.email,
      username: authUser.email,
      role: membership.role,
      fullName: membership.full_name || authUser.email,
      active: true,
    };
    return currentUser;
  }

  async function login(schoolCode, email, password) {
    return Utils.withLoading("Connexion à l’établissement…", async () => {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      try {
        return await activateUser(data.user, schoolCode);
      } catch (activationError) {
        currentUser = null;
        Storage.clearActiveSchool();
        await supabaseClient.auth.signOut();
        throw activationError;
      }
    });
  }

  async function restore() {
    return Utils.withLoading("Restauration de la session…", async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error || !data.session) return false;
      const schoolCode = sessionStorage.getItem(SCHOOL_CODE_KEY);
      if (!schoolCode) return false;
      try {
        await activateUser(data.session.user, schoolCode);
        return true;
      } catch {
        await supabaseClient.auth.signOut();
        Storage.clearActiveSchool();
        return false;
      }
    });
  }

  async function logout() {
    await Storage.flushRemoteSave();
    currentUser = null;
    sessionStorage.removeItem(SCHOOL_CODE_KEY);
    Storage.clearActiveSchool();
    await supabaseClient.auth.signOut();
  }

  function getCurrentUser() {
    return currentUser;
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
    container.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="loginForm">
          <div class="login-brand">🎓 <span>ScolaGest</span></div>
          <p class="text-muted" style="margin-top:-8px;">Connexion administrateur à l'espace de gestion.</p>
          <div class="field"><label>Code de l'établissement</label><input type="text" id="loginSchool" autocomplete="organization" required></div>
          <div class="field"><label>Adresse e-mail</label><input type="email" id="loginEmail" autocomplete="username" required></div>
          <div class="field"><label>Mot de passe</label><input type="password" id="loginPassword" autocomplete="current-password" required></div>
          <div id="loginError" class="login-error" style="display:none;"></div>
          <button type="submit" class="btn" style="width:100%;justify-content:center;">Se connecter</button>
        </form>
      </div>
    `;
    container.querySelector("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const errBox = container.querySelector("#loginError");
      const form = e.currentTarget;
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      login(
        container.querySelector("#loginSchool").value,
        container.querySelector("#loginEmail").value,
        container.querySelector("#loginPassword").value
      ).then(() => App.start()).catch((error) => {
        errBox.textContent = error.message || "Connexion impossible. Vérifiez vos identifiants et réessayez.";
        errBox.style.display = "block";
      }).finally(() => { submit.disabled = false; });
    });
  }

  return { login, logout, restore, getCurrentUser, isLoggedIn, scopedStudentIds, renderLoginScreen };
})();
