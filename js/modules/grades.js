/**
 * Module Notes : saisie des notes (devoirs, examens), calcul automatique
 * des moyennes pondérées par coefficient, classement, traçabilité des modifications.
 */
const Grades = (() => {
  const TERMS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
  const SEQUENCES_BY_TERM = { "Trimestre 1": ["Séquence 1", "Séquence 2"], "Trimestre 2": ["Séquence 3", "Séquence 4"], "Trimestre 3": ["Séquence 5"] };
  const EVALUATION_CATEGORIES = { harmonized: "Évaluation harmonisée", weekly: "Évaluation hebdomadaire" };
  let state = { classId: "", term: TERMS[0], sequence: "Séquence 1", rankingPeriod: "term", subjectId: "", studentId: "", type: "", category: "harmonized", listType: "", max: 20, mode: "entry" };
  let rootContainer = null;

  function evaluationTypes() {
    return Storage.db().settings.bulletin?.evaluationTypes || [];
  }

  function evaluationCategory(type) {
    const saved = Storage.db().settings.bulletin?.evaluationCategories?.[type];
    if (saved === "weekly" || saved === "harmonized") return saved;
    return /hebdo|weekly/i.test(type) ? "weekly" : "harmonized";
  }

  function setEvaluationCategory(type, category) {
    const bulletin = Storage.db().settings.bulletin || {};
    const evaluationCategories = { ...(bulletin.evaluationCategories || {}), [type]: category };
    Storage.setSettings({ bulletin: { ...bulletin, evaluationCategories } });
  }

  function sequencesForTerm(term) {
    return SEQUENCES_BY_TERM[term] || [];
  }

  function gradeSequence(grade) {
    return grade.sequence || sequencesForTerm(grade.term)[0] || "Séquence 1";
  }

  function render(container) {
    rootContainer = container;
    const scoped = Auth.scopedStudentIds();
    const scopedClassIds = scoped ? new Set(Storage.all("students").filter((student) => scoped.includes(student.id)).map((student) => student.classId)) : null;
    const classes = [...Storage.all("classes")].filter((classItem) => !scoped || scopedClassIds.has(classItem.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const canEdit = Permissions.canEdit("grades");
    if (scoped) {
      if (!classes.some((classItem) => classItem.id === state.classId)) state.classId = classes[0]?.id || "";
    } else if (!state.classId && classes[0]) {
      state.classId = classes[0].id;
    }
    const entryMode = canEdit && !scoped && state.mode === "entry";
    const classItem = Storage.get("classes", state.classId);
    const students = Storage.all("students")
      .filter((student) => student.classId === state.classId && (!scoped || scoped.includes(student.id)))
      .sort(Utils.comparePeople);
    const subjectIds = (classItem?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = (entryMode || scoped ? Storage.all("subjects").filter((s) => subjectIds.includes(s.id)) : Storage.all("subjects"))
      .sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const types = evaluationTypes();
    const sequences = sequencesForTerm(state.term);
    const visibleGrades = Storage.all("grades").filter((grade) => scoped ? scoped.includes(grade.studentId) : grade.classId === state.classId);
    const availableTypes = [...new Set([...(scoped ? [] : types), ...visibleGrades.map((grade) => grade.type)])].sort(Utils.compareFrenchNames);
    const categoryTypes = availableTypes.filter((type) => evaluationCategory(type) === state.category);
    if (!sequences.includes(state.sequence)) state.sequence = sequences[0] || "";
    if (!students.some((student) => student.id === state.studentId)) state.studentId = "";
    if (!categoryTypes.includes(state.type)) state.type = categoryTypes[0] || "";
    if (!availableTypes.includes(state.listType)) state.listType = "";
    if (entryMode && !subjects.some((s) => s.id === state.subjectId)) state.subjectId = subjects[0]?.id || "";
    if (scoped && state.subjectId && !subjects.some((subject) => subject.id === state.subjectId)) state.subjectId = "";

    container.innerHTML = `
      <div class="panel">
        ${canEdit && !scoped ? `
        <div class="toolbar">
          <button class="btn ${entryMode ? "" : "btn-secondary"}" id="tabEntry">✍️ Saisie des notes</button>
        </div>` : ""}
        <div class="toolbar">
          <div class="field"><label>Classe</label><select id="gClass" ${scoped && classes.length <= 1 ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}" ${state.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select></div>
          <div class="field"><label>Trimestre</label><select id="gTerm">${TERMS.map((t) => `<option value="${t}" ${state.term === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field"><label>Séquence</label><select id="gSequence">${sequences.map((sequence) => `<option value="${sequence}" ${state.sequence === sequence ? "selected" : ""}>${sequence}</option>`).join("")}</select></div>
          ${!entryMode ? `<div class="field"><label>Élève</label><select id="gStudent"><option value="">Tous les élèves</option>${students.map((student) => `<option value="${student.id}" ${state.studentId === student.id ? "selected" : ""}>${Utils.escapeHtml(student.firstName + " " + student.lastName)}</option>`).join("")}</select></div>` : ""}
            <div class="field"><label>Matière</label><select id="gSubject">${entryMode ? "" : '<option value="">Toutes les matières</option>'}${subjects.map((s) => `<option value="${s.id}" ${state.subjectId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("")}</select></div>
          ${entryMode ? `
          <div class="field"><label>Type d’évaluation</label><select id="gCategory">${Object.entries(EVALUATION_CATEGORIES).map(([value, label]) => `<option value="${value}" ${state.category === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
          <div class="field"><label>Évaluation</label><select id="gType" ${categoryTypes.length ? "" : "disabled"}>${categoryTypes.map((t) => `<option value="${Utils.escapeHtml(t)}" ${state.type === t ? "selected" : ""}>${Utils.escapeHtml(t)}</option>`).join("") || '<option value="">Aucune évaluation de cette catégorie</option>'}</select></div>
          <div class="field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnNewEval" type="button">+ Nouvelle évaluation</button>${state.type ? ` <button class="btn btn-sm btn-danger" id="btnDelEval" type="button" title="Supprimer cette évaluation">🗑️</button>` : ""}</div>
          <div class="field"><label>Barème</label><input type="number" id="gMax" min="1" value="${state.max}" style="width:80px;"></div>
          <div class="field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnImportSheet" type="button" title="Excel, CSV, PDF, Word, photo">📥 Importer une fiche</button><input type="file" id="fSheetFile" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json,.pdf,.docx,.doc,image/*" style="display:none;"></div>` : ""}
          ${!entryMode ? `<div class="field"><label>Évaluation</label><select id="gListType"><option value="">Toutes les évaluations</option>${availableTypes.map((type) => `<option value="${Utils.escapeHtml(type)}" ${state.listType === type ? "selected" : ""}>${Utils.escapeHtml(type)}</option>`).join("")}</select></div>` : ""}
          <span class="spacer"></span>
          ${canEdit && !scoped && !entryMode ? `<button class="btn" id="btnAddGrade">+ Saisir une note</button>` : ""}
        </div>
        <div id="gradesArea"></div>
      </div>
    `;
    container.querySelector("#tabEntry")?.addEventListener("click", () => { state.mode = "entry"; render(container); });
    container.querySelector("#gClass").addEventListener("change", (e) => { state.classId = e.target.value; state.studentId = ""; render(container); });
    container.querySelector("#gTerm").addEventListener("change", (e) => { state.term = e.target.value; state.sequence = sequencesForTerm(state.term)[0] || ""; render(container); });
    container.querySelector("#gSequence").addEventListener("change", (e) => { state.sequence = e.target.value; renderArea(); });
    container.querySelector("#gStudent")?.addEventListener("change", (e) => { state.studentId = e.target.value; renderArea(); });
    container.querySelector("#gSubject").addEventListener("change", (e) => { state.subjectId = e.target.value; renderArea(); });
    container.querySelector("#gType")?.addEventListener("change", (e) => { state.type = e.target.value; renderArea(); });
    container.querySelector("#gCategory")?.addEventListener("change", (e) => {
      state.category = e.target.value;
      const scoped = Auth.scopedStudentIds();
      const classTypes = [...new Set([...(scoped ? [] : evaluationTypes()), ...Storage.all("grades").filter((grade) => grade.classId === state.classId && (!scoped || scoped.includes(grade.studentId))).map((grade) => grade.type)])];
      state.type = classTypes.find((type) => evaluationCategory(type) === state.category) || "";
      render(container);
    });
    container.querySelector("#gListType")?.addEventListener("change", (e) => { state.listType = e.target.value; renderArea(); });
    container.querySelector("#btnImportSheet")?.addEventListener("click", () => container.querySelector("#fSheetFile").click());
    container.querySelector("#fSheetFile")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) await Utils.withLoading(`Lecture de ${file.name}…`, () => importSheet(file, container));
    });
    container.querySelector("#btnNewEval")?.addEventListener("click", () => openEvaluationForm(container));
    container.querySelector("#btnDelEval")?.addEventListener("click", () => {
      Utils.confirmDialog(`Supprimer l'évaluation "${state.type}" et toutes les notes associées (toutes classes) ?`, () => {
        const name = state.type;
        Storage.all("grades").filter((g) => g.type === name).forEach((g) => Storage.remove("grades", g.id));
        const bulletin = Storage.db().settings.bulletin || {};
        const evaluationCategories = { ...(bulletin.evaluationCategories || {}) };
        delete evaluationCategories[name];
        Storage.setSettings({ bulletin: { ...bulletin, evaluationTypes: evaluationTypes().filter((t) => t !== name), evaluationCategories } });
        Utils.toast("Évaluation supprimée", "success");
        render(container);
      });
    });
    container.querySelector("#gMax")?.addEventListener("change", (e) => { state.max = Number(e.target.value) || 20; renderArea(); });
    container.querySelector("#btnAddGrade")?.addEventListener("click", () => openForm());
    renderArea();
  }

  const normalize = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sortedTokens = (s) => normalize(s).split(" ").filter(Boolean).sort().join(" ");

  const scriptCache = {};
  // Chaque bibliothèque externe est vérifiée par empreinte SRI avant exécution.
  function loadScript(src, integrity) {
    scriptCache[src] ||= new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.integrity = integrity;
      el.crossOrigin = "anonymous";
      el.referrerPolicy = "no-referrer";
      el.onload = resolve;
      el.onerror = () => reject(new Error("Bibliothèque indisponible ou altérée (connexion Internet requise)"));
      document.head.appendChild(el);
    });
    return scriptCache[src];
  }

  function parseTextLine(line) {
    if (/\t|\s{2,}|;|\|/.test(line)) return line.split(/\t|\s{2,}|;|\|/).map((c) => c.trim()).filter(Boolean);
    const tokens = line.split(/\s+/);
    const nums = [];
    while (tokens.length > 1 && /^\d+([.,]\d+)?$/.test(tokens[tokens.length - 1])) nums.unshift(tokens.pop());
    return [tokens.join(" "), ...nums];
  }
  const textToRows = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(parseTextLine);

  async function pdfToRows(buffer) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const rows = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      const lines = new Map();
      content.items.filter((it) => it.str.trim()).forEach((it) => {
        const key = Math.round(it.transform[5] / 3);
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push({ x: it.transform[4], w: it.width, str: it.str.trim() });
      });
      [...lines.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
        items.sort((a, b) => a.x - b.x);
        const cells = [];
        let prevEnd = null;
        items.forEach((it) => {
          if (prevEnd !== null && it.x - prevEnd < 4) cells[cells.length - 1] += " " + it.str;
          else cells.push(it.str);
          prevEnd = it.x + it.w;
        });
        rows.push(cells);
      });
    }
    return rows;
  }

  async function readSheetRows(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) return pdfToRows(await file.arrayBuffer());
    if (name.endsWith(".docx")) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", "sha384-nFoSjZIoH3CCp8W639jJyQkuPHinJ2NHe7on1xvlUA7SuGfJAfvMldrsoAVm6ECz");
      const arrayBuffer = await file.arrayBuffer();
      const html = (await mammoth.convertToHtml({ arrayBuffer })).value;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const tableRows = [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
      if (tableRows.length) return tableRows;
      return textToRows((await mammoth.extractRawText({ arrayBuffer })).value);
    }
    if (name.endsWith(".doc")) throw new Error("Le format .doc n'est pas supporté : enregistrez le fichier en .docx");
    if (/\.(png|jpe?g|webp|bmp|gif)$/.test(name) || file.type.startsWith("image/")) {
      await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F");
      const result = await Tesseract.recognize(file, "fra");
      return textToRows(result.data.text);
    }
    if (typeof XLSX !== "object") throw new Error("Lecteur de fichiers indisponible (connexion requise)");
    let workbook;
    if (name.endsWith(".json")) {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : [];
      if (!list.length) return [];
      const keys = [...new Set(list.flatMap((o) => Object.keys(o)))];
      return [keys, ...list.map((o) => keys.map((k) => o[k]))];
    }
    if (/\.(csv|tsv|txt)$/.test(name)) workbook = XLSX.read(await file.text(), { type: "string" });
    else workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  }

  function toNumber(v) {
    if (typeof v === "number") return v;
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return String(v ?? "").trim() === "" || isNaN(n) ? null : n;
  }

  async function importSheet(file, container) {
    let rows;
    if (/\.(pdf|png|jpe?g|webp|bmp|gif)$/i.test(file.name) || file.type.startsWith("image/")) Utils.toast("Lecture du document en cours…", "info");
    try {
      rows = (await readSheetRows(file)).filter((r) => r.some((c) => String(c).trim() !== ""));
    } catch (error) {
      console.error(error);
      return Utils.toast("Fichier illisible : " + error.message, "error");
    }
    const identityRe = /^(matricule|nom|noms|prenom|prenoms|nom et prenoms?|nom prenoms?|eleve|eleves|etudiant|name|first name|last name)$/;
    const headerFound = rows.slice(0, 15).findIndex((r) => r.some((c) => identityRe.test(normalize(c))));
    const headerIdx = Math.max(0, headerFound);
    let header = (rows[headerIdx] || []).map((c) => String(c).trim());
    let data = rows.slice(headerIdx + 1);
    if (headerFound < 0) {
      // Liste sans en-tête (photo, PDF) : nom de l'élève puis une note
      header = ["Nom", "Note"];
      data = rows.map((r) => {
        const n = r.findIndex((c) => /[a-zà-ÿ]/i.test(String(c)));
        if (n < 0) return null;
        const note = r.slice(n + 1).find((c) => toNumber(c) !== null);
        return [r[n], note ?? ""];
      }).filter(Boolean);
    }
    const skipRe = /(^| )(rang|total|decision|appreciation|observation|date|naissance|sexe|genre|classe|numero|n|no|moyenne generale|moy gen)( |$)/;
    const col = { matricule: -1, last: -1, first: -1, full: -1 };
    header.forEach((h, i) => {
      const n = normalize(h);
      if (n === "matricule") col.matricule = i;
      else if (/^(prenom|prenoms|first name)$/.test(n)) col.first = i;
      else if (/^(nom|last name)$/.test(n)) col.last = i;
      else if (/^(noms|nom et prenoms?|nom prenoms?|eleve|eleves|etudiant|name)$/.test(n)) col.full = i;
    });
    if (col.matricule < 0 && col.last < 0 && col.first < 0 && col.full < 0) {
      return Utils.toast("Colonne d'identification introuvable (Matricule ou Nom)", "error");
    }
    const identityCols = new Set(Object.values(col));
    const classItem = Storage.get("classes", state.classId);
    const classSubjects = Storage.all("subjects").filter((s) => (classItem?.subjectTeachers || []).some((st) => st.subjectId === s.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const currentSubject = Storage.get("subjects", state.subjectId);
    const genericRe = /^(note|notes|valeur|score|resultat)?$/;

    const gradeCols = [];
    header.forEach((h, i) => {
      if (identityCols.has(i) || !h || skipRe.test(normalize(h))) return;
      if (!data.some((r) => toNumber(r[i]) !== null)) return;
      let rest = normalize(h);
      let subject = null;
      [...classSubjects].sort((a, b) => normalize(b.name).length - normalize(a.name).length).some((s) => {
        const sn = normalize(s.name);
        if (sn && rest.includes(sn)) { subject = s; rest = rest.replace(sn, " ").trim(); return true; }
        return false;
      });
      let max = state.max;
      const m = String(h).match(/\/\s*(\d+)/);
      if (m) { max = Number(m[1]); rest = rest.replace(new RegExp("\\b" + m[1] + "\\b"), " ").trim(); }
      const typeName = genericRe.test(rest) ? "" : (evaluationTypes().find((t) => normalize(t) === rest) || String(h).replace(/\/\s*\d+/, "").replace(new RegExp(subject ? subject.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "$^", "i"), "").replace(/^[\s\-_:]+|[\s\-_:]+$/g, ""));
      gradeCols.push({ index: i, subject: subject || currentSubject, type: typeName || state.type, max });
    });
    if (!gradeCols.length) return Utils.toast("Aucune colonne de notes détectée dans le fichier", "error");
    if (gradeCols.some((g) => !g.subject)) return Utils.toast("Choisissez une matière (ou nommez les colonnes d'après les matières de la classe)", "error");
    if (gradeCols.some((g) => !g.type)) return Utils.toast("Créez d'abord une évaluation (ou nommez les colonnes d'après l'évaluation)", "error");

    const students = Storage.all("students").filter((s) => s.classId === state.classId);
    const byMatricule = new Map(students.filter((s) => s.matricule).map((s) => [normalize(s.matricule).replace(/ /g, ""), s]));
    const byName = new Map(students.map((s) => [sortedTokens(s.firstName + " " + s.lastName), s]));
    function findStudent(r) {
      if (col.matricule >= 0) {
        const s = byMatricule.get(normalize(r[col.matricule]).replace(/ /g, ""));
        if (s) return s;
      }
      const nameParts = col.full >= 0 ? r[col.full] : `${col.last >= 0 ? r[col.last] : ""} ${col.first >= 0 ? r[col.first] : ""}`;
      const key = sortedTokens(nameParts);
      if (!key) return null;
      if (byName.has(key)) return byName.get(key);
      const tokens = key.split(" ");
      const close = students.filter((s) => {
        const st = sortedTokens(s.firstName + " " + s.lastName).split(" ");
        return tokens.every((t) => st.includes(t)) || st.every((t) => tokens.includes(t));
      });
      return close.length === 1 ? close[0] : null;
    }

    const types = evaluationTypes();
    const newTypes = [...new Set(gradeCols.map((g) => g.type))].filter((t) => !types.includes(t));
    if (newTypes.length) {
      const bulletin = Storage.db().settings.bulletin || {};
      Storage.setSettings({ bulletin: { ...bulletin, evaluationTypes: [...types, ...newTypes] } });
    }
    const grades = Storage.all("grades");
    let created = 0, updated = 0, invalid = 0;
    const unmatched = [];
    data.forEach((r) => {
      const values = gradeCols.map((g) => toNumber(r[g.index]));
      if (values.every((v) => v === null)) return;
      const student = findStudent(r);
      if (!student) {
        unmatched.push([r[col.matricule], r[col.full], r[col.last], r[col.first]].filter((x) => x !== undefined && String(x).trim()).join(" "));
        return;
      }
      gradeCols.forEach((g, k) => {
        const value = values[k];
        if (value === null) return;
        if (value < 0 || value > g.max) { invalid++; return; }
        const existing = grades.find((x) => x.studentId === student.id && x.classId === state.classId && x.subjectId === g.subject.id && x.term === state.term && gradeSequence(x) === state.sequence && x.type === g.type);
        if (existing) {
          if (existing.value === value && existing.max === g.max) return;
          const history = existing.history || [];
          if (existing.value !== value) history.push({ date: Utils.today(), oldValue: existing.value, newValue: value });
          Storage.update("grades", existing.id, { value, max: g.max, history });
          updated++;
        } else {
          const assignment = (classItem?.subjectTeachers || []).find((st) => st.subjectId === g.subject.id);
          Storage.insert("grades", { studentId: student.id, subjectId: g.subject.id, classId: state.classId, term: state.term, sequence: state.sequence, type: g.type, value, max: g.max, date: Utils.today(), teacherId: assignment?.teacherId || null, history: [] });
          created++;
        }
      });
    });
    state.type = gradeCols[0].type;
    if (gradeCols[0].subject) state.subjectId = gradeCols[0].subject.id;
    render(container);
    Utils.openModal({
      title: "Import terminé",
      bodyHtml: `
        <p><strong>${created}</strong> note(s) ajoutée(s), <strong>${updated}</strong> mise(s) à jour${invalid ? `, <strong>${invalid}</strong> ignorée(s) (hors barème)` : ""}.</p>
        <p class="text-muted">Colonnes reconnues : ${gradeCols.map((g) => Utils.escapeHtml(`${g.subject.name} — ${g.type}`)).join(" ; ")}</p>
        ${unmatched.length ? `<p><strong>${unmatched.length} ligne(s) non reconnue(s)</strong> (élève absent de la classe sélectionnée) :</p><ul>${unmatched.map((u) => `<li>${Utils.escapeHtml(u)}</li>`).join("")}</ul>` : ""}
      `,
      footerHtml: `<button class="btn" id="closeBtn">OK</button>`,
      onMount: (overlay) => overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal),
    });
  }

  function openEvaluationForm(container) {
    Utils.openModal({
      title: "Nouvelle évaluation",
      bodyHtml: `
        <div class="form-grid">
          <div class="field full"><label>Nom de l'évaluation *</label><input type="text" id="fEvalName" placeholder="Ex. DEV7, Composition, Hebdomadaire 1" maxlength="30" required></div>
          <div class="field full"><label>Catégorie pour le calcul du bulletin</label><select id="fEvalCategory"><option value="harmonized" ${state.category === "harmonized" ? "selected" : ""}>Évaluation harmonisée (70 %)</option><option value="weekly" ${state.category === "weekly" ? "selected" : ""}>Évaluation hebdomadaire (30 %)</option></select></div>
        </div>`,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveEval">Créer</button>`,
      onMount: (overlay) => {
        const input = overlay.querySelector("#fEvalName");
        input.focus();
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        const save = () => {
          const name = input.value.trim();
          if (!name) return Utils.toast("Saisissez un nom", "error");
          const types = evaluationTypes();
          if (types.some((t) => t.toLowerCase() === name.toLowerCase())) return Utils.toast("Cette évaluation existe déjà", "error");
          const bulletin = Storage.db().settings.bulletin || {};
          const category = overlay.querySelector("#fEvalCategory").value;
          const evaluationCategories = { ...(bulletin.evaluationCategories || {}), [name]: category };
          Storage.setSettings({ bulletin: { ...bulletin, evaluationTypes: [...types, name], evaluationCategories } });
          state.type = name;
          state.category = category;
          Utils.closeModal();
          Utils.toast("Évaluation créée", "success");
          render(container);
        };
        overlay.querySelector("#saveEval").addEventListener("click", save);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
      },
    });
  }

  function renderEntry(area) {
    const students = Storage.all("students")
      .filter((s) => s.classId === state.classId)
      .sort(Utils.comparePeople);
    if (!state.subjectId) {
      area.innerHTML = `<div class="empty-state">Cette classe n'a aucune matière : ajoutez-en dans la page Classes.</div>`;
      return;
    }
    if (!students.length) {
      area.innerHTML = `<div class="empty-state">Aucun élève dans cette classe.</div>`;
      return;
    }
    const existing = (studentId) => state.type ? Storage.all("grades").find((g) => g.studentId === studentId && g.classId === state.classId && g.subjectId === state.subjectId && g.term === state.term && gradeSequence(g) === state.sequence && g.type === state.type) : null;
    area.innerHTML = `
      ${!state.type ? '<div class="empty-state">Aucune évaluation de cette catégorie pour le moment. Cliquez sur « + Nouvelle évaluation »; la liste des élèves est déjà prête.</div>' : ""}
      <p class="text-muted">La liste complète de la classe est affichée. Les notes déjà saisies apparaissent dans leur case; une case vide signifie qu’aucune note n’est enregistrée pour cette évaluation. Saisissez les notes sur ${state.max}, puis appuyez sur <strong>Entrée</strong> pour passer à l’élève suivant. Les cases laissées vides ne sont pas modifiées.</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Élève</th><th>Matricule</th><th>Note /${state.max}</th></tr></thead>
          <tbody>
            ${students.map((s, i) => {
              const g = existing(s.id);
              return `<tr>
                <td>${i + 1}</td>
                <td>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</td>
                <td>${Utils.escapeHtml(s.matricule || "")}</td>
                <td><input type="number" class="grade-input" data-student="${s.id}" min="0" max="${state.max}" step="0.25" value="${g ? g.value : ""}" aria-label="Note de ${Utils.escapeHtml(s.firstName + " " + s.lastName)}" ${state.type ? "" : "disabled"} style="width:90px;"></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="toolbar" style="margin-top:12px;">
        <span id="entryStats" class="text-muted"></span>
        <span class="spacer"></span>
        <button class="btn" id="btnSaveAll" ${state.type ? "" : "disabled"}>💾 Enregistrer les notes</button>
      </div>
    `;
    const inputs = [...area.querySelectorAll(".grade-input")];
    const stats = area.querySelector("#entryStats");
    const invalid = (input) => input.value !== "" && (Number(input.value) < 0 || Number(input.value) > state.max);
    function updateStats() {
      const filled = inputs.filter((i) => i.value !== "" && !invalid(i));
      const avg = filled.length ? filled.reduce((sum, i) => sum + Number(i.value), 0) / filled.length : null;
      stats.textContent = `${filled.length} / ${inputs.length} notes saisies` + (avg !== null ? ` — moyenne de la classe : ${avg.toFixed(2)}/${state.max}` : "");
      inputs.forEach((i) => { i.style.borderColor = invalid(i) ? "red" : ""; });
    }
    inputs.forEach((input, idx) => {
      input.addEventListener("input", updateStats);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); inputs[idx + 1]?.focus(); inputs[idx + 1]?.select(); }
        if (e.key === "ArrowUp") { e.preventDefault(); inputs[idx - 1]?.focus(); inputs[idx - 1]?.select(); }
      });
    });
    updateStats();
    inputs.find((i) => i.value === "")?.focus();
    area.querySelector("#btnSaveAll").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Enregistrement…", async () => {
      if (!state.type) return Utils.toast("Créez ou choisissez une évaluation avant la saisie", "error");
      if (inputs.some(invalid)) return Utils.toast(`Les notes doivent être comprises entre 0 et ${state.max}`, "error");
      const assignment = (Storage.get("classes", state.classId)?.subjectTeachers || []).find((st) => st.subjectId === state.subjectId);
      let saved = 0;
      inputs.forEach((input) => {
        if (input.value === "") return;
        const value = Number(input.value);
        const g = existing(input.dataset.student);
        if (g) {
          if (g.value === value && g.max === state.max) return;
          const history = g.history || [];
          if (g.value !== value) history.push({ date: Utils.today(), oldValue: g.value, newValue: value });
          Storage.update("grades", g.id, { value, max: state.max, history });
        } else {
          Storage.insert("grades", { studentId: input.dataset.student, subjectId: state.subjectId, classId: state.classId, term: state.term, sequence: state.sequence, type: state.type, value, max: state.max, date: Utils.today(), teacherId: assignment?.teacherId || null, history: [] });
        }
        saved++;
      });
      Utils.toast(saved ? `${saved} note(s) enregistrée(s)` : "Aucune note renseignée", saved ? "success" : "info");
    }));
  }

  function studentAverageForSequence(studentId, subjectId, term, sequence) {
    const grades = Storage.all("grades").filter((g) => g.studentId === studentId && g.subjectId === subjectId && g.term === term && gradeSequence(g) === sequence);
    if (grades.length === 0) return null;
    const categoryAverages = { harmonized: [], weekly: [] };
    grades.forEach((grade) => categoryAverages[evaluationCategory(grade.type)].push((grade.value / grade.max) * 20));
    const harmonized = categoryAverages.harmonized.length
      ? categoryAverages.harmonized.reduce((sum, value) => sum + value, 0) / categoryAverages.harmonized.length
      : null;
    const weekly = categoryAverages.weekly.length
      ? categoryAverages.weekly.reduce((sum, value) => sum + value, 0) / categoryAverages.weekly.length
      : null;
    if (harmonized === null) return weekly;
    if (weekly === null) return harmonized;
    return harmonized * 0.7 + weekly * 0.3;
  }

  function studentAverageForSubject(studentId, subjectId, term, sequence = null) {
    if (sequence) return studentAverageForSequence(studentId, subjectId, term, sequence);
    const averages = sequencesForTerm(term)
      .map((sequence) => studentAverageForSequence(studentId, subjectId, term, sequence))
      .filter((average) => average !== null);
    return averages.length ? averages.reduce((sum, average) => sum + average, 0) / averages.length : null;
  }

  function classAverageForSubject(classId, subjectId, term, sequence = null) {
    const students = Storage.all("students").filter((student) => student.classId === classId);
    const averages = students.map((student) => studentAverageForSubject(student.id, subjectId, term, sequence)).filter((average) => average !== null);
    return averages.length ? averages.reduce((sum, average) => sum + average, 0) / averages.length : null;
  }

  function studentGeneralAverage(studentId, classId, term, sequence = null) {
    const classObj = Storage.get("classes", classId);
    const subjectIds = (classObj?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((s) => subjectIds.includes(s.id));
    let totalPoints = 0, totalCoef = 0;
    subjects.forEach((s) => {
      const avg = studentAverageForSubject(studentId, s.id, term, sequence);
      if (avg !== null) {
        totalPoints += avg * s.coefficient;
        totalCoef += s.coefficient;
      }
    });
    return totalCoef ? totalPoints / totalCoef : null;
  }

  function classRanking(classId, term, sequence = null) {
    const students = Storage.all("students").filter((s) => s.classId === classId);
    const ranked = students
      .map((s) => ({ student: s, avg: studentGeneralAverage(s.id, classId, term, sequence) }))
      .filter((r) => r.avg !== null)
      .sort((a, b) => b.avg - a.avg);
    return ranked;
  }

  function renderArea() {
    const area = document.getElementById("gradesArea");
    if (!area) return;
    if (!state.classId) {
      area.innerHTML = `<div class="empty-state">Créez d'abord une classe.</div>`;
      return;
    }
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("grades");
    if (canEdit && !scoped && state.mode === "entry") return renderEntry(area);
    const students = Storage.all("students").filter((s) => s.classId === state.classId && (!scoped || scoped.includes(s.id))).sort(Utils.comparePeople);
    const subjects = [...Storage.all("subjects")].sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const grades = Storage.all("grades").filter(
      (g) => g.classId === state.classId && g.term === state.term && gradeSequence(g) === state.sequence && (!state.subjectId || g.subjectId === state.subjectId) && (!state.studentId || g.studentId === state.studentId) && (!state.listType || g.type === state.listType) && (!scoped || scoped.includes(g.studentId))
    ).sort((a, b) => {
      const studentA = Storage.get("students", a.studentId);
      const studentB = Storage.get("students", b.studentId);
      const studentOrder = Utils.comparePeople(studentA, studentB);
      if (studentOrder) return studentOrder;
      const subjectOrder = Utils.compareFrenchNames(Storage.get("subjects", a.subjectId)?.name, Storage.get("subjects", b.subjectId)?.name);
      return subjectOrder || Utils.compareFrenchNames(a.type, b.type);
    });
    const rankingSequence = state.rankingPeriod === "sequence" ? state.sequence : null;
    const ranking = classRanking(state.classId, state.term, rankingSequence)
      .map((entry, index) => ({ ...entry, rank: index + 1 }))
      .filter((entry) => (!state.studentId || entry.student.id === state.studentId) && (!scoped || scoped.includes(entry.student.id)));
    const rankingPeriodLabel = state.rankingPeriod === "sequence" ? state.sequence : state.term;

    area.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Élève</th><th>Matière</th><th>Type</th><th>Note</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${grades
              .map((g) => {
                const st = students.find((s) => s.id === g.studentId) || Storage.get("students", g.studentId);
                const subj = subjects.find((s) => s.id === g.subjectId);
                return `
                <tr>
                  <td>${st ? Utils.escapeHtml(st.firstName + " " + st.lastName) : "-"}</td>
                  <td>${Utils.escapeHtml(subj?.name || "-")}</td>
                  <td>${Utils.escapeHtml(g.type)}</td>
                  <td><strong>${g.value}</strong>/${g.max}</td>
                  <td>${Utils.formatDate(g.date)}</td>
                  <td class="table-actions">
                    ${canEdit ? `
                    <button class="btn btn-sm btn-secondary" data-edit="${g.id}">✏️</button>
                    <button class="btn btn-sm btn-danger" data-del="${g.id}">🗑️</button>` : ""}
                    ${g.history?.length ? `<button class="btn btn-sm btn-secondary" data-hist="${g.id}">🕓</button>` : ""}
                  </td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="6">Aucune note saisie pour ce filtre.</td></tr>`}
          </tbody>
        </table>
      </div>
      <hr class="sep">
      <div class="toolbar" style="margin-top:12px;">
        <h3 style="margin:0;">Classement et moyennes générales — ${Utils.escapeHtml(rankingPeriodLabel)}</h3>
        <span class="spacer"></span>
        <div class="field"><label for="rankingPeriod">Calculer sur</label><select id="rankingPeriod"><option value="term" ${state.rankingPeriod === "term" ? "selected" : ""}>Trimestre</option><option value="sequence" ${state.rankingPeriod === "sequence" ? "selected" : ""}>Séquence (${Utils.escapeHtml(state.sequence)})</option></select></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Rang</th><th>Élève</th><th>Moyenne générale</th></tr></thead>
          <tbody>
            ${ranking
              .map((r) => `<tr><td>${r.rank}</td><td>${Utils.escapeHtml(r.student.firstName + " " + r.student.lastName)}</td><td><strong>${r.avg.toFixed(2)}</strong>/20</td></tr>`)
              .join("") || `<tr><td colspan="3">Aucune moyenne disponible.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    area.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
    area.querySelector("#rankingPeriod")?.addEventListener("change", (e) => { state.rankingPeriod = e.target.value; renderArea(); });
    area.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer cette note ?", () => {
          Storage.remove("grades", b.dataset.del);
          Utils.toast("Note supprimée", "success");
          renderArea();
        });
      })
    );
    area.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", () => showHistory(b.dataset.hist)));
  }

  function showHistory(id) {
    const g = Storage.get("grades", id);
    const scoped = Auth.scopedStudentIds();
    if (!g || (scoped && !scoped.includes(g.studentId))) return;
    Utils.openModal({
      title: "Historique des modifications",
      bodyHtml: `
        <table class="data-table">
          <thead><tr><th>Date</th><th>Ancienne valeur</th><th>Nouvelle valeur</th></tr></thead>
          <tbody>${(g.history || []).map((h) => `<tr><td>${Utils.formatDate(h.date)}</td><td>${h.oldValue}</td><td>${h.newValue}</td></tr>`).join("")}</tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeBtn">Fermer</button>`,
      onMount: (overlay) => overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal),
    });
  }

  function openForm(id) {
    const editing = !!id;
    const g = editing ? Storage.get("grades", id) : null;
    const students = Storage.all("students").filter((s) => s.classId === state.classId).sort(Utils.comparePeople);
    const subjects = [...Storage.all("subjects")].sort((a, b) => Utils.compareFrenchNames(a.name, b.name));

    Utils.openModal({
      title: editing ? "Modifier la note" : "Saisir une note",
      bodyHtml: `
        <form id="gradeForm">
          <div class="form-grid">
            <div class="field full"><label>Élève *</label>
              <select id="fStudent" ${editing ? "disabled" : ""} required>${students.map((s) => `<option value="${s.id}" ${g?.studentId === s.id || (!editing && state.studentId === s.id) ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("") || '<option value="">Aucun élève</option>'}</select>
            </div>
              <div class="field"><label>Matière *</label>
                <select id="fSubject" required>${subjects.map((s) => `<option value="${s.id}" ${g?.subjectId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("") || '<option value="">Aucune matière</option>'}</select>
              </div>
            <div class="field"><label>Trimestre</label>
              <select id="fTerm">${TERMS.map((t) => `<option value="${t}" ${(g?.term || state.term) === t ? "selected" : ""}>${t}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Séquence</label><select id="fSequence">${sequencesForTerm(g?.term || state.term).map((sequence) => `<option value="${sequence}" ${(g ? gradeSequence(g) : state.sequence) === sequence ? "selected" : ""}>${sequence}</option>`).join("")}</select></div>
            <div class="field"><label>Type *</label><input type="text" id="fType" value="${Utils.escapeHtml(g?.type || "Devoir")}" placeholder="Devoir 1, Examen..." required></div>
            <div class="field"><label>Note *</label><input type="number" step="0.25" min="0" id="fValue" value="${g?.value ?? ""}" required></div>
            <div class="field"><label>Barème</label><input type="number" id="fMax" value="${g?.max || 20}"></div>
            <div class="field"><label>Date</label><input type="date" id="fDate" value="${g?.date || Utils.today()}"></div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveGrade">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        overlay.querySelector("#fTerm").addEventListener("change", (event) => {
          const sequenceSelect = overlay.querySelector("#fSequence");
          sequenceSelect.innerHTML = sequencesForTerm(event.target.value).map((sequence) => `<option value="${sequence}">${sequence}</option>`).join("");
        });
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveGrade").addEventListener("click", () => {
          const value = Number(overlay.querySelector("#fValue").value);
          const max = Number(overlay.querySelector("#fMax").value) || 20;
          const type = overlay.querySelector("#fType").value.trim();
          if (isNaN(value) || !type) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const data = {
            subjectId: overlay.querySelector("#fSubject").value,
            classId: state.classId,
            term: overlay.querySelector("#fTerm").value,
            sequence: overlay.querySelector("#fSequence").value,
            type,
            value,
            max,
            date: overlay.querySelector("#fDate").value,
          };
          if (editing) {
            const history = g.history || [];
            if (g.value !== value) {
              history.push({ date: Utils.today(), oldValue: g.value, newValue: value });
            }
            Storage.update("grades", id, { ...data, history });
            Utils.toast("Note mise à jour (traçabilité enregistrée)", "success");
          } else {
            data.studentId = overlay.querySelector("#fStudent").value;
            data.history = [];
            Storage.insert("grades", data);
            Utils.toast("Note enregistrée", "success");
          }
          Utils.closeModal();
          renderArea();
        });
      },
    });
  }

  return { render, studentAverageForSequence, studentAverageForSubject, classAverageForSubject, studentGeneralAverage, classRanking, sequencesForTerm, gradeSequence, TERMS };
})();
