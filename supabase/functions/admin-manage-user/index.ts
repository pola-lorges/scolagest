import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const allowedOrigins = new Set(
  (Deno.env.get("APP_ALLOWED_ORIGINS") || "https://scolagest.netlify.app,https://scolagest.wiki,http://localhost:8888")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function corsHeaders(origin: string) {
  return {
  "Access-Control-Allow-Origin": origin,
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
}

const allowedRoles = new Set(["ADMIN", "DIRECTEUR", "ADMINISTRATION", "ENSEIGNANT", "PARENT", "ELEVE"]);

function reply(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function normalizedStudentIds(role: string, studentId: unknown, studentIds: unknown) {
  if (role === "ELEVE") {
    return typeof studentId === "string" && studentId ? [studentId] : [];
  }
  return Array.isArray(studentIds)
    ? [...new Set(studentIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
}

function normalizedTeacherId(role: string, teacherId: unknown) {
  return role === "ENSEIGNANT" && typeof teacherId === "string" && teacherId ? teacherId : null;
}

function readApiKeyDictionary(secretName: string, expectedPrefix: string): string | null {
  const raw = Deno.env.get(secretName);
  if (!raw) return null;
  if (raw.startsWith(expectedPrefix)) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = Object.values(parsed as Record<string, unknown>)
        .find((entry): entry is string => typeof entry === "string" && entry.startsWith(expectedPrefix));
      return value || null;
    }
  } catch {
    return null;
  }
  return null;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return reply(405, { error: "Méthode non autorisée." }, origin);

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken || accessToken === authorization) return reply(401, { error: "Authentification requise." }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = readApiKeyDictionary("SUPABASE_PUBLISHABLE_KEYS", "sb_publishable_")
    || Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = readApiKeyDictionary("SUPABASE_SECRET_KEYS", "sb_secret_")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) return reply(500, { error: "Configuration des clés API Supabase incomplète." }, origin);

  const callerClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await callerClient.auth.getUser(accessToken);
  if (authError || !authData.user) return reply(401, { error: "Session invalide ou expirée." }, origin);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return reply(400, { error: "Requête JSON invalide." }, origin);
  }

  const schoolCode = typeof payload.schoolCode === "string" ? payload.schoolCode.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{3,30}$/.test(schoolCode)) return reply(400, { error: "Code établissement invalide." }, origin);

  const { data: school, error: schoolError } = await adminClient.from("schools").select("id, code").eq("code", schoolCode).maybeSingle();
  if (schoolError || !school) return reply(404, { error: "Établissement introuvable." }, origin);

  const { data: callerMembership, error: membershipError } = await adminClient
    .from("school_members")
    .select("role, active")
    .eq("school_id", school.id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (membershipError || callerMembership?.role !== "ADMIN" || callerMembership.active !== true) {
    return reply(403, { error: "Seul un administrateur actif peut gérer les comptes." }, origin);
  }

  const action = payload.action;
  if (action !== "create" && action !== "update" && action !== "delete") return reply(400, { error: "Action invalide." }, origin);

  if (action === "delete" || action === "update") {
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    const { data: target, error: targetError } = await adminClient
      .from("school_members")
      .select("role")
      .eq("school_id", school.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError || !target || !allowedRoles.has(target.role)) return reply(404, { error: "Compte utilisateur introuvable." }, origin);
    if (userId === authData.user.id) return reply(400, { error: "Vous ne pouvez pas modifier ou supprimer votre propre compte ici." }, origin);

    if (action === "delete") {
        if (target.role === "ADMIN") {
          const { data: admins, error: adminsError } = await adminClient
            .from("school_members")
            .select("user_id")
            .eq("school_id", school.id)
            .eq("role", "ADMIN")
            .eq("active", true);
          if (adminsError) return reply(400, { error: "Impossible de vérifier les administrateurs actifs." }, origin);
          if ((admins || []).length <= 1) return reply(400, { error: "Impossible de supprimer le dernier administrateur actif." }, origin);
        }
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return reply(400, { error: "Suppression du compte impossible." }, origin);
      return reply(200, { userId, deleted: true }, origin);
    }

    const role = payload.role;
    if (typeof role !== "string" || !allowedRoles.has(role)) return reply(400, { error: "Rôle non autorisé." }, origin);
    if (target.role === "ADMIN" && (role !== "ADMIN" || payload.active === false)) {
      const { data: admins, error: adminsError } = await adminClient
        .from("school_members")
        .select("user_id")
        .eq("school_id", school.id)
        .eq("role", "ADMIN")
        .eq("active", true);
      if (adminsError) return reply(400, { error: "Impossible de vérifier les administrateurs actifs." }, origin);
      if ((admins || []).length <= 1) return reply(400, { error: "Impossible de désactiver ou rétrograder le dernier administrateur actif." }, origin);
    }
    const newPassword = typeof payload.password === "string" ? payload.password : "";
    if (newPassword && (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword))) {
      return reply(400, { error: "Le nouveau mot de passe doit faire 12 caractères minimum et contenir une minuscule, une majuscule, un chiffre et un symbole." }, origin);
    }
    const fullName = typeof payload.fullName === "string" ? payload.fullName.trim().slice(0, 120) : "";
    const linkedIds = normalizedStudentIds(role, payload.studentId, payload.studentIds);
    const teacherId = normalizedTeacherId(role, payload.teacherId);
    if ((role === "ELEVE" && linkedIds.length !== 1) || (role === "PARENT" && linkedIds.length === 0)) return reply(400, { error: "Associez le ou les élèves au compte." }, origin);
    if (role === "ENSEIGNANT" && !teacherId) return reply(400, { error: "Associez un enseignant au compte." }, origin);
    const { data: schoolData, error: dataError } = await adminClient.from("school_data").select("data").eq("school_id", school.id).single();
    if (dataError) return reply(400, { error: "Données de l'établissement indisponibles." }, origin);
    const validIds = new Set((schoolData.data?.students || []).map((student: { id?: string }) => student.id));
    if (linkedIds.some((id) => !validIds.has(id))) return reply(400, { error: "Un élève sélectionné n'appartient pas à cet établissement." }, origin);
    const validTeacherIds = new Set((schoolData.data?.teachers || []).map((teacher: { id?: string }) => teacher.id));
    if (teacherId && !validTeacherIds.has(teacherId)) return reply(400, { error: "L'enseignant sélectionné n'appartient pas à cet établissement." }, origin);

    const { error } = await adminClient.from("school_members").update({
      role,
      full_name: fullName,
      active: payload.active !== false,
      teacher_id: teacherId,
      student_id: role === "ELEVE" ? linkedIds[0] : null,
      student_ids: role === "PARENT" ? linkedIds : [],
    }).eq("school_id", school.id).eq("user_id", userId);
    if (error) return reply(400, { error: "Mise à jour des droits impossible." }, origin);
    if (newPassword) {
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (passwordError) return reply(400, { error: "Droits mis à jour, mais le mot de passe n'a pas pu être réinitialisé." }, origin);
    }
    return reply(200, { userId, updated: true }, origin);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const fullName = typeof payload.fullName === "string" ? payload.fullName.trim().slice(0, 120) : "";
  const role = payload.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: "Adresse e-mail invalide." }, origin);
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return reply(400, { error: "Le mot de passe temporaire doit faire 12 caractères minimum et contenir une minuscule, une majuscule, un chiffre et un symbole." }, origin);
  }
  if (typeof role !== "string" || !allowedRoles.has(role)) return reply(400, { error: "Rôle invalide." }, origin);
  const linkedIds = normalizedStudentIds(role, payload.studentId, payload.studentIds);
  const teacherId = normalizedTeacherId(role, payload.teacherId);
  if ((role === "ELEVE" && linkedIds.length !== 1) || (role === "PARENT" && linkedIds.length === 0)) return reply(400, { error: "Associez le ou les élèves au compte." }, origin);
  if (role === "ENSEIGNANT" && !teacherId) return reply(400, { error: "Associez un enseignant au compte." }, origin);

  const { data: schoolData, error: dataError } = await adminClient.from("school_data").select("data").eq("school_id", school.id).single();
  if (dataError) return reply(400, { error: "Données de l'établissement indisponibles." }, origin);
  const validIds = new Set((schoolData.data?.students || []).map((student: { id?: string }) => student.id));
  if (linkedIds.some((id) => !validIds.has(id))) return reply(400, { error: "Un élève sélectionné n'appartient pas à cet établissement." }, origin);
  const validTeacherIds = new Set((schoolData.data?.teachers || []).map((teacher: { id?: string }) => teacher.id));
  if (teacherId && !validTeacherIds.has(teacherId)) return reply(400, { error: "L'enseignant sélectionné n'appartient pas à cet établissement." }, origin);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) return reply(400, { error: "Création du compte impossible. Vérifiez l'adresse e-mail et son unicité." }, origin);

  const { error: insertError } = await adminClient.from("school_members").insert({
    school_id: school.id,
    user_id: created.user.id,
    role,
    full_name: fullName,
    active: payload.active !== false,
    teacher_id: teacherId,
    student_id: role === "ELEVE" ? linkedIds[0] : null,
    student_ids: role === "PARENT" ? linkedIds : [],
  });
  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return reply(400, { error: "Association au compte scolaire impossible." }, origin);
  }
  return reply(201, {
    user: {
      id: created.user.id,
      username: email,
      email,
      fullName,
      role,
      active: payload.active !== false,
      teacherId: teacherId || undefined,
      studentId: role === "ELEVE" ? linkedIds[0] : undefined,
      studentIds: role === "PARENT" ? linkedIds : undefined,
      authManaged: true,
    },
  }, origin);
});