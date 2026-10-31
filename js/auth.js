const Auth = (() => {
  const SCHOOL_CODE_KEY = "scolagest_school_code";
  const GUARD_KEY = "scolagest_login_guard";
  const GENERIC_LOGIN_ERROR = "Identifiants ou code établissement invalides.";
  const MAX_ATTEMPTS = 5;
  const BASE_LOCK_MS = 60 * 1000;
  const IDLE_LIMIT_MS = 30 * 60 * 1000;
  let currentUser = null;
  let idleTimer = null;
  let idleCleanup = null;

  // Frein côté navigateur uniquement : la vraie limitation de débit reste celle de Supabase.
  function readGuard() {
    try { return JSON.parse(localStorage.getItem(GUARD_KEY)) || { failures: 0, lockedUntil: 0 }; } catch { return { failures: 0, lockedUntil: 0 }; }
  }

  function lockRemainingMs() {
    return Math.max(0, readGuard().lockedUntil - Date.now());
  }

  function recordFailure() {
    const guard = readGuard();
    guard.failures += 1;
    if (guard.failures >= MAX_ATTEMPTS) guard.lockedUntil = Date.now() + BASE_LOCK_MS * 2 ** Math.min(guard.failures - MAX_ATTEMPTS, 4);
    localStorage.setItem(GUARD_KEY, JSON.stringify(guard));
  }

  function watchInactivity(onExpire) {
    stopInactivityWatch();
    let lastActivity = Date.now();
    const touch = () => { lastActivity = Date.now(); };
    const check = () => {
      if (Date.now() - lastActivity < IDLE_LIMIT_MS) return;
      stopInactivityWatch();
      onExpire();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((name) => window.addEventListener(name, touch, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", check);
    idleTimer = setInterval(check, 15000);
    idleCleanup = () => {
      events.forEach((name) => window.removeEventListener(name, touch, { capture: true }));
      document.removeEventListener("visibilitychange", check);
    };
  }

  function stopInactivityWatch() {
    clearInterval(idleTimer);
    idleTimer = null;
    if (idleCleanup) idleCleanup();
    idleCleanup = null;
  }

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
    const remaining = lockRemainingMs();
    if (remaining > 0) throw new Error(`Trop de tentatives. Réessayez dans ${Math.ceil(remaining / 1000)} secondes.`);
    return Utils.withLoading("Connexion à l’établissement…", async () => {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        const user = await activateUser(data.user, schoolCode);
        localStorage.removeItem(GUARD_KEY);
        return user;
      } catch (error) {
        currentUser = null;
        Storage.clearActiveSchool();
        await supabaseClient.auth.signOut().catch(() => {});
        if (error?.name === "AuthRetryableFetchError") throw new Error("Connexion impossible. Vérifiez votre réseau et réessayez.");
        recordFailure();
        console.warn("Échec de connexion", error?.message);
        throw new Error(GENERIC_LOGIN_ERROR);
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
    stopInactivityWatch();
    try {
      await Storage.flushRemoteSave();
    } catch (error) {
      console.warn("Synchronisation échouée avant déconnexion", error);
      Utils.toast("Certaines modifications n'ont peut-être pas été synchronisées.", "error");
    }
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

  return { login, logout, restore, getCurrentUser, isLoggedIn, scopedStudentIds, renderLoginScreen, watchInactivity };
})();
