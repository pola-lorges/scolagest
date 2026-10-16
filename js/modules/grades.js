/**
 * Module Notes : saisie des notes (devoirs, examens), calcul automatique
 * des moyennes pondérées par coefficient, classement, traçabilité des modifications.
 */
const Grades = (() => {
  const TERMS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
  let state = { classId: "", term: TERMS[0], subjectId: "", type: "", max: 20, mode: "entry" };
  let rootContainer = null;

  function evaluationTypes() {
    return Storage.db().settings.bulletin?.evaluationTypes || [];
  }

  function render(container) {
    rootContainer = container;
    const classes = Storage.all("classes");
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("grades");
    if (scoped) {
      const own = Storage.get("students", scoped[0]);
      if (own) state.classId = own.classId;
    } else if (!state.classId && classes[0]) {
      state.classId = classes[0].id;
    }
    const entryMode = canEdit && !scoped && state.mode === "entry";
    const classItem = Storage.get("classes", state.classId);
    const subjectIds = (classItem?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = entryMode ? Storage.all("subjects").filter((s) => subjectIds.includes(s.id)) : Storage.all("subjects");
    const types = evaluationTypes();
    if (!types.includes(state.type)) state.type = types[0] || "";
    if (entryMode && !subjects.some((s) => s.id === state.subjectId)) state.subjectId = subjects[0]?.id || "";

    container.innerHTML = `
      <div class="panel">
        ${canEdit && !scoped ? `
        <div class="toolbar">
          <button class="btn ${entryMode ? "" : "btn-secondary"}" id="tabEntry">✍️ Saisie des notes</button>
          <button class="btn ${entryMode ? "btn-secondary" : ""}" id="tabList">📋 Notes saisies</button>
        </div>` : ""}
        <div class="toolbar">
          <div class="field"><label>Classe</label><select id="gClass" ${scoped ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}" ${state.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select></div>
          <div class="field"><label>Trimestre</label><select id="gTerm">${TERMS.map((t) => `<option value="${t}" ${state.term === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field"><label>Matière</label><select id="gSubject">${entryMode ? "" : `<option value="">Toutes les matières</option>`}${subjects.map((s) => `<option value="${s.id}" ${state.subjectId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("")}</select></div>
          ${entryMode ? `
          <div class="field"><label>Évaluation</label><select id="gType">${types.map((t) => `<option value="${Utils.escapeHtml(t)}" ${state.type === t ? "selected" : ""}>${Utils.escapeHtml(t)}</option>`).join("")}</select></div>
          <div class="field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnNewEval" type="button">+ Nouvelle évaluation</button>${state.type ? ` <button class="btn btn-sm btn-danger" id="btnDelEval" type="button" title="Supprimer cette évaluation">🗑️</button>` : ""}</div>
          <div class="field"><label>Barème</label><input type="number" id="gMax" min="1" value="${state.max}" style="width:80px;"></div>
          <div class="field"><label>&nbsp;</label><button class="btn btn-secondary" id="btnImportSheet" type="button" title="Excel, CSV, PDF, Word, photo">📥 Importer une fiche</button><input type="file" id="fSheetFile" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json,.pdf,.docx,.doc,image/*" style="display:none;"></div>` : ""}
          <span class="spacer"></span>
          ${canEdit && !scoped && !entryMode ? `<button class="btn" id="btnAddGrade">+ Saisir une note</button>` : ""}
        </div>
        <div id="gradesArea"></div>
      </div>
    `;
    container.querySelector("#tabEntry")?.addEventListener("click", () => { state.mode = "entry"; render(container); });
    container.querySelector("#tabList")?.addEventListener("click", () => { state.mode = "list"; render(container); });
    container.querySelector("#gClass").addEventListener("change", (e) => { state.classId = e.target.value; render(container); });
    container.querySelector("#gTerm").addEventListener("change", (e) => { state.term = e.target.value; renderArea(); });
    container.querySelector("#gSubject").addEventListener("change", (e) => { state.subjectId = e.target.value; renderArea(); });
    container.querySelector("#gType")?.addEventListener("change", (e) => { state.type = e.target.value; renderArea(); });
    container.querySelector("#btnImportSheet")?.addEventListener("click", () => container.querySelector("#fSheetFile").click());
    container.querySelector("#fSheetFile")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) await importSheet(file, container);
    });
    container.querySelector("#btnNewEval")?.addEventListener("click", () => openEvaluationForm(container));
    container.querySelector("#btnDelEval")?.addEventListener("click", () => {
      Utils.confirmDialog(`Supprimer l'évaluation "${state.type}" et toutes les notes associées (toutes classes) ?`, () => {
        const name = state.type;
        Storage.all("grades").filter((g) => g.type === name).forEach((g) => Storage.remove("grades", g.id));
        const bulletin = Storage.db().settings.bulletin || {};
        Storage.setSettings({ bulletin: { ...bulletin, evaluationTypes: evaluationTypes().filter((t) => t !== name) } });
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
  function loadScript(src) {
    scriptCache[src] ||= new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Bibliothèque indisponible (connexion Internet requise)"));
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
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
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
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
      const arrayBuffer = await file.arrayBuffer();
      const html = (await mammoth.convertToHtml({ arrayBuffer })).value;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const tableRows = [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
      if (tableRows.length) return tableRows;
      return textToRows((await mammoth.extractRawText({ arrayBuffer })).value);
    }
    if (name.endsWith(".doc")) throw new Error("Le format .doc n'est pas supporté : enregistrez le fichier en .docx");
    if (/\.(png|jpe?g|webp|bmp|gif)$/.test(name) || file.type.startsWith("image/")) {
      await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
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
    const classSubjects = Storage.all("subjects").filter((s) => (classItem?.subjectTeachers || []).some((st) => st.subjectId === s.id));
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
        const existing = grades.find((x) => x.studentId === student.id && x.classId === state.classId && x.subjectId === g.subject.id && x.term === state.term && x.type === g.type);
        if (existing) {
          if (existing.value === value && existing.max === g.max) return;
          const history = existing.history || [];
          if (existing.value !== value) history.push({ date: Utils.today(), oldValue: existing.value, newValue: value });
          Storage.update("grades", existing.id, { value, max: g.max, history });
          updated++;
        } else {
          const assignment = (classItem?.subjectTeachers || []).find((st) => st.subjectId === g.subject.id);
          Storage.insert("grades", { studentId: student.id, subjectId: g.subject.id, classId: state.classId, term: state.term, type: g.type, value, max: g.max, date: Utils.today(), teacherId: assignment?.teacherId || null, history: [] });
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
      bodyHtml: `<div class="field"><label>Nom de l'évaluation *</label><input type="text" id="fEvalName" placeholder="Ex. DEV7, Composition, Examen" maxlength="30"></div>`,
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
          Storage.setSettings({ bulletin: { ...bulletin, evaluationTypes: [...types, name] } });
          state.type = name;
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
      .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
    if (!state.type) {
      area.innerHTML = `<div class="empty-state">Aucune évaluation : cliquez sur « + Nouvelle évaluation » pour en créer une.</div>`;
      return;
    }
    if (!state.subjectId) {
      area.innerHTML = `<div class="empty-state">Cette classe n'a aucune matière : ajoutez-en dans la page Classes.</div>`;
      return;
    }
    if (!students.length) {
      area.innerHTML = `<div class="empty-state">Aucun élève dans cette classe.</div>`;
      return;
    }
    const existing = (studentId) => Storage.all("grades").find((g) => g.studentId === studentId && g.classId === state.classId && g.subjectId === state.subjectId && g.term === state.term && g.type === state.type);
    area.innerHTML = `
      <p class="text-muted">Saisissez la note de chaque élève sur ${state.max}, puis appuyez sur <strong>Entrée</strong> pour passer à l'élève suivant. Une case vide n'est pas enregistrée.</p>
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
                <td><input type="number" class="grade-input" data-student="${s.id}" min="0" max="${state.max}" step="0.25" value="${g ? g.value : ""}" style="width:90px;"></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="toolbar" style="margin-top:12px;">
        <span id="entryStats" class="text-muted"></span>
        <span class="spacer"></span>
        <button class="btn" id="btnSaveAll">💾 Enregistrer les notes</button>
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
    area.querySelector("#btnSaveAll").addEventListener("click", () => {
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
          Storage.insert("grades", { studentId: input.dataset.student, subjectId: state.subjectId, classId: state.classId, term: state.term, type: state.type, value, max: state.max, date: Utils.today(), teacherId: assignment?.teacherId || null, history: [] });
        }
        saved++;
      });
      Utils.toast(saved ? `${saved} note(s) enregistrée(s)` : "Aucune modification à enregistrer", saved ? "success" : "info");
    });
  }

  function studentAverageForSubject(studentId, subjectId, term) {
    const grades = Storage.all("grades").filter((g) => g.studentId === studentId && g.subjectId === subjectId && g.term === term);
    if (grades.length === 0) return null;
    const sum = grades.reduce((acc, g) => acc + (g.value / g.max) * 20, 0);
    return sum / grades.length;
  }

  function studentGeneralAverage(studentId, classId, term) {
    const classObj = Storage.get("classes", classId);
    const subjectIds = (classObj?.subjectTeachers || []).map((st) => st.subjectId);
    const subjects = Storage.all("subjects").filter((s) => subjectIds.includes(s.id));
    let totalPoints = 0, totalCoef = 0;
    subjects.forEach((s) => {
      const avg = studentAverageForSubject(studentId, s.id, term);
      if (avg !== null) {
        totalPoints += avg * s.coefficient;
        totalCoef += s.coefficient;
      }
    });
    return totalCoef ? totalPoints / totalCoef : null;
  }

  function classRanking(classId, term) {
    const students = Storage.all("students").filter((s) => s.classId === classId);
    const ranked = students
      .map((s) => ({ student: s, avg: studentGeneralAverage(s.id, classId, term) }))
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
    const students = Storage.all("students").filter((s) => s.classId === state.classId && (!scoped || scoped.includes(s.id)));
    const subjects = Storage.all("subjects");
    const grades = Storage.all("grades").filter(
      (g) => g.classId === state.classId && g.term === state.term && (!state.subjectId || g.subjectId === state.subjectId) && (!scoped || scoped.includes(g.studentId))
    );
    const ranking = classRanking(state.classId, state.term).filter((r) => !scoped || scoped.includes(r.student.id));

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
      <h3>Classement et moyennes générales — ${Utils.escapeHtml(state.term)}</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Rang</th><th>Élève</th><th>Moyenne générale</th></tr></thead>
          <tbody>
            ${ranking
              .map((r, i) => `<tr><td>${i + 1}</td><td>${Utils.escapeHtml(r.student.firstName + " " + r.student.lastName)}</td><td><strong>${r.avg.toFixed(2)}</strong>/20</td></tr>`)
              .join("") || `<tr><td colspan="3">Aucune moyenne disponible.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    area.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(b.dataset.edit)));
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
    const students = Storage.all("students").filter((s) => s.classId === state.classId);
    const subjects = Storage.all("subjects");

    Utils.openModal({
      title: editing ? "Modifier la note" : "Saisir une note",
      bodyHtml: `
        <form id="gradeForm">
          <div class="form-grid">
            <div class="field full"><label>Élève *</label>
              <select id="fStudent" ${editing ? "disabled" : ""}>${students.map((s) => `<option value="${s.id}" ${g?.studentId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Matière *</label>
              <select id="fSubject">${subjects.map((s) => `<option value="${s.id}" ${g?.subjectId === s.id ? "selected" : ""}>${Utils.escapeHtml(s.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Trimestre</label>
              <select id="fTerm">${TERMS.map((t) => `<option value="${t}" ${(g?.term || state.term) === t ? "selected" : ""}>${t}</option>`).join("")}</select>
            </div>
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

  return { render, studentAverageForSubject, studentGeneralAverage, classRanking, TERMS };
})();
