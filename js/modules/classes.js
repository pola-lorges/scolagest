/**
 * Module Classes : création, affectation élèves/enseignants, niveaux,
 * capacité, année scolaire, historique, liste des élèves par classe.
 */
const Classes = (() => {
  let rootContainer = null;
  let selectedId = null;

  function render(container) {
    rootContainer = container;
    if (selectedId && !Storage.get("classes", selectedId)) selectedId = null;
    if (selectedId) return renderDetail(container, selectedId);
    const canEdit = Permissions.canEdit("classes");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <span class="text-muted">Cliquez sur une classe pour voir ses élèves, ses enseignants et ses matières.</span>
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddClass">+ Nouvelle classe</button>` : ""}
        </div>
        <div id="classesTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddClass")?.addEventListener("click", () => openForm());
    renderTable();
  }

  function renderTable() {
    const wrap = document.getElementById("classesTableWrap");
    if (!wrap) return;
    const classes = [...Storage.all("classes")].sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const students = Storage.all("students");
    const teachers = Storage.all("teachers");
    if (classes.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucune classe créée.</div>`;
      return;
    }
    wrap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;">${classes
      .map((c) => {
        const effectif = students.filter((s) => s.classId === c.id).length;
        const main = teachers.find((t) => t.id === c.mainTeacherId);
        const over = effectif > c.capacity;
        return `
        <div class="panel" data-open="${c.id}" style="cursor:pointer;margin:0;">
          <h3 style="margin:0 0 4px;">${Utils.escapeHtml(c.name)}</h3>
          <div class="text-muted">${Utils.escapeHtml(c.level)} — ${Utils.escapeHtml(c.year || "")}</div>
          <div style="margin:10px 0;font-size:22px;font-weight:700;">${over ? `<span class="badge badge-danger">${effectif}</span>` : effectif} <span class="text-muted" style="font-size:13px;font-weight:400;">élève(s) / ${c.capacity}</span></div>
          <div class="text-muted" style="font-size:12px;">Prof. principal : ${main ? Utils.escapeHtml(main.firstName + " " + main.lastName) : "-"}</div>
        </div>`;
      })
      .join("")}</div>`;
    wrap.querySelectorAll("[data-open]").forEach((card) => card.addEventListener("click", () => { selectedId = card.dataset.open; render(rootContainer); }));
  }

  function renderDetail(container, id) {
    const c = Storage.get("classes", id);
    const canEdit = Permissions.canEdit("classes");
    const students = Storage.all("students").filter((s) => s.classId === id).sort(Utils.comparePeople);
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const subjects = [...Storage.all("subjects")].sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const main = teachers.find((t) => t.id === c.mainTeacherId);
    const assignments = [...(c.subjectTeachers || [])].sort((a, b) => Utils.compareFrenchNames(subjects.find((subject) => subject.id === a.subjectId)?.name, subjects.find((subject) => subject.id === b.subjectId)?.name));
    const classTeacherIds = [...new Set([c.mainTeacherId, ...assignments.map((a) => a.teacherId)].filter(Boolean))];
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <button class="btn btn-secondary" id="btnBack">← Toutes les classes</button>
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddStudent">+ Élève</button><button class="btn" id="btnAddTeacherSubject">+ Professeur / matière</button>` : ""}
          <button class="btn btn-secondary" id="btnAttendanceSheet">📋 Fiche de présence</button>
          <button class="btn btn-secondary" id="btnGradeSheet">📝 Fiche de notes</button>
          ${canEdit ? `<button class="btn btn-secondary" id="btnEdit">✏️ Modifier</button><button class="btn btn-danger" id="btnDelete">🗑️</button>` : ""}
        </div>
        <h2 style="margin:0;">${Utils.escapeHtml(c.name)}</h2>
        <p class="text-muted">${Utils.escapeHtml(c.level)} — ${Utils.escapeHtml(c.year || "")} — Effectif : <strong>${students.length}</strong> / ${c.capacity} — Prof. principal : ${main ? Utils.escapeHtml(main.firstName + " " + main.lastName) : "-"}</p>
        <h3>Élèves (${students.length})</h3>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>#</th><th>Matricule</th><th>Nom complet</th><th>Sexe</th><th>Statut</th></tr></thead>
          <tbody>${students.map((s, i) => `<tr><td>${i + 1}</td><td>${Utils.escapeHtml(s.matricule)}</td><td>${Utils.escapeHtml(s.firstName + " " + s.lastName)}</td><td>${Utils.escapeHtml(s.gender || "-")}</td><td>${Utils.escapeHtml(s.status || "-")}</td></tr>`).join("") || `<tr><td colspan="5">Aucun élève</td></tr>`}</tbody>
        </table></div>
        <h3>Matières et enseignants (${assignments.length})</h3>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Matière</th><th>Coef.</th><th>Enseignant</th></tr></thead>
          <tbody>${assignments.map((st) => {
            const subj = subjects.find((s) => s.id === st.subjectId);
            const t = teachers.find((x) => x.id === st.teacherId);
            return `<tr><td>${Utils.escapeHtml(subj?.name || "-")}</td><td>${subj?.coefficient ?? "-"}</td><td>${t ? Utils.escapeHtml(t.firstName + " " + t.lastName) : "-"}</td></tr>`;
          }).join("") || `<tr><td colspan="3">Aucune matière affectée</td></tr>`}</tbody>
        </table></div>
        <h3>Enseignants de la classe (${classTeacherIds.length})</h3>
        <p>${classTeacherIds.map((tid) => teachers.find((x) => x.id === tid)).filter(Boolean).sort(Utils.comparePeople).map((teacher) => `<span class="badge badge-primary">${Utils.escapeHtml(teacher.firstName + " " + teacher.lastName)}</span>`).join(" ") || "-"}</p>
      </div>
    `;
    container.querySelector("#btnBack").addEventListener("click", () => { selectedId = null; render(container); });
    container.querySelector("#btnEdit")?.addEventListener("click", () => openForm(id));
    container.querySelector("#btnDelete")?.addEventListener("click", () => {
      Utils.confirmDialog("Supprimer cette classe ? Les élèves resteront sans classe.", () => {
        Storage.remove("classes", id);
        selectedId = null;
        Utils.toast("Classe supprimée", "success");
        render(container);
      });
    });
    container.querySelector("#btnAddStudent")?.addEventListener("click", () => openAddStudent(id));
    container.querySelector("#btnAddTeacherSubject")?.addEventListener("click", () => openAddTeacherSubject(id));
    container.querySelector("#btnAttendanceSheet").addEventListener("click", () => openSheetForm(id, "attendance"));
    container.querySelector("#btnGradeSheet").addEventListener("click", () => openSheetForm(id, "grades"));
  }

  function openAddStudent(classId) {
    const c = Storage.get("classes", classId);
    Utils.openModal({
      title: `Ajouter un élève — ${c.name}`,
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Nom *</label><input type="text" id="sLast" required></div>
          <div class="field"><label>Prénom *</label><input type="text" id="sFirst" required></div>
          <div class="field"><label>Matricule *</label><input type="text" id="sMat" required></div>
          <div class="field"><label>Sexe</label><select id="sGender"><option value="M">M</option><option value="F">F</option></select></div>
          <div class="field"><label>Date de naissance</label><input type="date" id="sDob"></div>
          <div class="field"><label>Lieu de naissance</label><input type="text" id="sPob"></div>
          <div class="field"><label>Nom du parent</label><input type="text" id="sParent"></div>
          <div class="field"><label>Téléphone du parent</label><input type="text" id="sPhone"></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveStudent">Ajouter</button>`,
      onMount: (overlay) => {
        const val = (sel) => overlay.querySelector(sel).value.trim();
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveStudent").addEventListener("click", () => {
          if (!val("#sLast") || !val("#sFirst") || !val("#sMat")) return Utils.toast("Nom, prénom et matricule sont obligatoires", "error");
          if (Storage.all("students").some((s) => (s.matricule || "").toLowerCase() === val("#sMat").toLowerCase())) return Utils.toast("Ce matricule existe déjà", "error");
          Storage.insert("students", {
            matricule: val("#sMat"), firstName: val("#sFirst"), lastName: val("#sLast"), photo: "", gender: val("#sGender"),
            dob: val("#sDob"), pob: val("#sPob"), address: "", classId, year: c.year || Storage.db().settings.currentYear, status: "actif",
            parent: { name: val("#sParent"), phone: val("#sPhone"), email: "", address: "" },
            classHistory: [{ year: c.year, classId, className: c.name }],
          });
          Utils.closeModal();
          Utils.toast("Élève ajouté", "success");
          render(rootContainer);
        });
      },
    });
  }

  function openAddTeacherSubject(classId) {
    const c = Storage.get("classes", classId);
    const subjects = [...Storage.all("subjects")].sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    Utils.openModal({
      title: `Ajouter un professeur et sa matière — ${c.name}`,
      bodyHtml: `
        <div class="form-grid">
          <div class="field full"><label>Matière *</label>
            <select id="tSubject" required>${subjects.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join("")}<option value="__new">+ Nouvelle matière…</option></select></div>
          <div class="field" data-new-subject><label>Nom de la matière *</label><input type="text" id="tSubjectName" required></div>
          <div class="field" data-new-subject><label>Coefficient</label><input type="number" id="tCoef" value="1" min="1"></div>
          <div class="field full"><label>Professeur *</label>
            <select id="tTeacher" required>${teachers.map((t) => `<option value="${t.id}">${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}<option value="__new">+ Nouveau professeur…</option></select></div>
          <div class="field" data-new-teacher><label>Nom *</label><input type="text" id="tLast" required></div>
          <div class="field" data-new-teacher><label>Prénom *</label><input type="text" id="tFirst" required></div>
          <div class="field" data-new-teacher><label>Téléphone</label><input type="text" id="tPhone"></div>
          <div class="field" data-new-teacher><label>Email</label><input type="email" id="tEmail"></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveTS">Ajouter</button>`,
      onMount: (overlay) => {
        const subjSel = overlay.querySelector("#tSubject");
        const teacherSel = overlay.querySelector("#tTeacher");
        const val = (sel) => overlay.querySelector(sel).value.trim();
        const toggle = () => {
          overlay.querySelectorAll("[data-new-subject]").forEach((el) => { el.style.display = subjSel.value === "__new" ? "" : "none"; });
          overlay.querySelectorAll("[data-new-teacher]").forEach((el) => { el.style.display = teacherSel.value === "__new" ? "" : "none"; });
        };
        subjSel.addEventListener("change", toggle);
        teacherSel.addEventListener("change", toggle);
        toggle();
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveTS").addEventListener("click", () => {
          const newSubject = subjSel.value === "__new";
          const newTeacher = teacherSel.value === "__new";
          if ((newSubject && !val("#tSubjectName")) || (newTeacher && (!val("#tLast") || !val("#tFirst"))) || !subjSel.value || !teacherSel.value) {
            return Utils.toast("Veuillez remplir les champs obligatoires", "error");
          }
          const subject = newSubject
            ? Storage.insert("subjects", { name: val("#tSubjectName"), coefficient: Number(val("#tCoef")) || 1, level: "", teacherId: null, program: "" })
            : Storage.get("subjects", subjSel.value);
          const teacher = newTeacher
            ? Storage.insert("teachers", { matricule: "ENS-" + Utils.pad(Storage.all("teachers").length + 1, 3), photo: "", address: "", classes: [], firstName: val("#tFirst"), lastName: val("#tLast"), subjects: [], phone: val("#tPhone"), email: val("#tEmail") })
            : Storage.get("teachers", teacherSel.value);
          const subjectTeachers = [...(Storage.get("classes", classId).subjectTeachers || []).filter((st) => st.subjectId !== subject.id), { subjectId: subject.id, teacherId: teacher.id }];
          Storage.update("classes", classId, { subjectTeachers });
          Storage.update("teachers", teacher.id, {
            subjects: [...new Set([...(teacher.subjects || []), subject.id])],
            classes: [...new Set([...(teacher.classes || []), classId])],
          });
          if (!subject.teacherId) Storage.update("subjects", subject.id, { teacherId: teacher.id });
          Utils.closeModal();
          Utils.toast("Professeur et matière ajoutés à la classe", "success");
          render(rootContainer);
        });
      },
    });
  }

  function openSheetForm(classId, kind) {
    const c = Storage.get("classes", classId);
    const subjects = Storage.all("subjects").filter((s) => (c.subjectTeachers || []).some((st) => st.subjectId === s.id)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const isGrades = kind === "grades";
    Utils.openModal({
      title: isGrades ? `Fiche de notes — ${c.name}` : `Fiche de présence — ${c.name}`,
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Matière (facultatif)</label><select id="sSubject"><option value="">— Toutes / non précisée —</option>${subjects.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join("")}</select></div>
          ${isGrades ? `
          <div class="field"><label>Évaluation</label><input type="text" id="sEval" placeholder="Ex. DEV1, Composition"></div>
          <div class="field"><label>Barème</label><input type="number" id="sMax" value="20" min="1"></div>` : `
          <div class="field"><label>Période (ex. Mars 2026)</label><input type="text" id="sPeriod"></div>
          <div class="field"><label>Nombre de colonnes (dates)</label><input type="number" id="sCols" value="20" min="1" max="31"></div>`}
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="makeSheet">⬇️ Télécharger le PDF</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#makeSheet").addEventListener("click", async () => {
          const subject = Storage.get("subjects", overlay.querySelector("#sSubject").value);
          const options = isGrades
            ? { subject, evaluation: overlay.querySelector("#sEval").value.trim(), max: Number(overlay.querySelector("#sMax").value) || 20 }
            : { subject, period: overlay.querySelector("#sPeriod").value.trim(), cols: Math.min(31, Math.max(1, Number(overlay.querySelector("#sCols").value) || 20)) };
          Utils.closeModal();
          await downloadSheet(classId, kind, options);
        });
      },
    });
  }

  async function downloadSheet(classId, kind, options) {
    const c = Storage.get("classes", classId);
    const settings = Storage.db().settings;
    const students = Storage.all("students").filter((s) => s.classId === classId).sort(Utils.comparePeople);
    if (!students.length) return Utils.toast("Aucun élève dans cette classe", "error");
    let logo = "";
    try { logo = await Bulletins.loadLogoDataUrl(); } catch (e) { console.warn("Logo indisponible", e); }
    const assignment = options.subject ? (c.subjectTeachers || []).find((st) => st.subjectId === options.subject.id) : null;
    const teacher = assignment ? Storage.get("teachers", assignment.teacherId) : null;
    const isGrades = kind === "grades";
    const info = [
      `Classe : ${c.name}`,
      `Année : ${c.year || settings.currentYear}`,
      `Effectif : ${students.length}`,
      `Matière : ${options.subject ? options.subject.name : "........................"}`,
      teacher ? `Enseignant : ${teacher.firstName} ${teacher.lastName}` : "Enseignant : ........................",
      isGrades ? `Évaluation : ${options.evaluation || "........................"}   Date : ..../..../........` : `Période : ${options.period || "........................"}`,
    ];
    const nameOf = (s) => `${s.firstName} ${s.lastName}`;
    const head = (text, extra = {}) => ({ text, bold: true, fillColor: "d7d7f5", alignment: "center", ...extra });
    const body = isGrades
      ? [[head("N°"), head("Matricule"), head("Nom et prénoms"), head(`Note /${options.max}`), head("Observation")],
         ...students.map((s, i) => [{ text: String(i + 1), alignment: "center" }, s.matricule || "", nameOf(s), "", ""])]
      : [[head("N°"), head("Matricule"), head("Nom et prénoms"), ...Array.from({ length: options.cols }, () => head(""))],
         ...students.map((s, i) => [{ text: String(i + 1), alignment: "center" }, s.matricule || "", nameOf(s), ...Array.from({ length: options.cols }, () => "")])];
    const widths = isGrades ? [24, 70, "*", 80, 130] : [20, 60, 130, ...Array.from({ length: options.cols }, () => "*")];
    const definition = {
      pageSize: "A4",
      pageOrientation: isGrades ? "portrait" : "landscape",
      pageMargins: [28, 28, 28, 28],
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      content: [
        { columns: [
          logo ? { image: "establishmentLogo", width: 50 } : { text: "", width: 50 },
          { stack: [{ text: settings.bulletin?.institution || settings.schoolName, bold: true, fontSize: 13 }, { text: isGrades ? "FICHE DE PRISE DE NOTES" : "FICHE DE PRÉSENCE", bold: true, fontSize: 15, margin: [0, 4, 0, 0] }], margin: [10, 2, 0, 0] },
        ], margin: [0, 0, 0, 8] },
        { columns: [{ stack: info.slice(0, 3) }, { stack: info.slice(3) }], fontSize: 10, margin: [0, 0, 0, 8] },
        { table: { headerRows: 1, widths, body }, fontSize: isGrades ? 10 : 8, layout: { paddingTop: () => 5, paddingBottom: () => 5, hLineWidth: () => 0.5, vLineWidth: () => 0.5 } },
      ],
      defaultStyle: { font: "Roboto" },
    };
    try {
      await Utils.downloadPdfMake(definition, `${isGrades ? "Fiche-notes" : "Fiche-presence"}-${c.name}.pdf`);
      Utils.toast("Fiche PDF téléchargée", "success");
    } catch (error) {
      console.error("Erreur de génération de la fiche", error);
      Utils.toast("Impossible de générer la fiche", "error");
    }
  }

  function openForm(id) {
    const editing = !!id;
    const c = editing ? Storage.get("classes", id) : null;
    const teachers = [...Storage.all("teachers")].sort(Utils.comparePeople);
    const subjects = [...Storage.all("subjects")].sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
    const existingST = c?.subjectTeachers || [];

    Utils.openModal({
      title: editing ? "Modifier la classe" : "Nouvelle classe",
      width: "700px",
      bodyHtml: `
        <form id="classForm">
          <div class="form-grid">
            <div class="field"><label>Nom de la classe *</label><input type="text" id="fName" value="${Utils.escapeHtml(c?.name || "")}" required></div>
            <div class="field"><label>Niveau *</label><input type="text" id="fLevel" value="${Utils.escapeHtml(c?.level || "")}" placeholder="ex: 6e" required></div>
            <div class="field"><label>Capacité maximale</label><input type="number" id="fCapacity" value="${c?.capacity || 40}"></div>
            <div class="field"><label>Année scolaire</label><input type="text" id="fYear" value="${Utils.escapeHtml(c?.year || Storage.db().settings.currentYear)}"></div>
            <div class="field full"><label>Professeur principal</label>
              <select id="fMainTeacher"><option value="">—</option>${teachers.map((t) => `<option value="${t.id}" ${c?.mainTeacherId === t.id ? "selected" : ""}>${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}</select>
            </div>
            <div class="field full"><h4 style="margin:8px 0;">Enseignants par matière</h4>
              <div id="subjectTeacherRows"></div>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveClass">💾 Enregistrer</button>
      `,
      onMount: (overlay) => {
        const rowsDiv = overlay.querySelector("#subjectTeacherRows");
        rowsDiv.innerHTML = subjects
          .map((subj) => {
            const found = existingST.find((st) => st.subjectId === subj.id);
            return `
            <div class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <label style="min-width:160px;margin:0;">${Utils.escapeHtml(subj.name)}</label>
              <select data-subject="${subj.id}" style="flex:1;">
                <option value="">— Aucun —</option>
                ${teachers.map((t) => `<option value="${t.id}" ${found?.teacherId === t.id ? "selected" : ""}>${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}
              </select>
            </div>`;
          })
          .join("");

        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveClass").addEventListener("click", () => {
          const name = overlay.querySelector("#fName").value.trim();
          const level = overlay.querySelector("#fLevel").value.trim();
          if (!name || !level) {
            Utils.toast("Veuillez remplir les champs obligatoires", "error");
            return;
          }
          const subjectTeachers = Array.from(rowsDiv.querySelectorAll("select[data-subject]"))
            .map((sel) => ({ subjectId: sel.dataset.subject, teacherId: sel.value }))
            .filter((st) => st.teacherId);

          const data = {
            name,
            level,
            capacity: Number(overlay.querySelector("#fCapacity").value) || 40,
            year: overlay.querySelector("#fYear").value.trim(),
            mainTeacherId: overlay.querySelector("#fMainTeacher").value,
            subjectTeachers,
          };
          if (editing) {
            Storage.update("classes", id, data);
            Utils.toast("Classe mise à jour", "success");
          } else {
            Storage.insert("classes", data);
            Utils.toast("Classe créée", "success");
          }
          Utils.closeModal();
          render(rootContainer);
        });
      },
    });
  }

  return { render };
})();
