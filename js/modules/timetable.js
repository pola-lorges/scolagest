/**
 * Module Emploi du temps : classes, enseignants, salles, horaires,
 * gestion des conflits (élève/enseignant/salle sur le même créneau).
 */
const Timetable = (() => {
  const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  let state = { classId: "" };

  function render(container) {
    const classes = Storage.all("classes");
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("timetable");
    if (scoped) {
      const own = Storage.get("students", scoped[0]);
      if (own) state.classId = own.classId;
    } else if (!state.classId && classes[0]) {
      state.classId = classes[0].id;
    }
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="ttClass" ${scoped ? "disabled" : ""}>${classes.map((c) => `<option value="${c.id}" ${state.classId === c.id ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("") || "<option>Aucune classe</option>"}</select>
          <span class="spacer"></span>
          <button class="btn btn-secondary" id="btnDownloadTimetable">⬇️ PDF de l'emploi du temps</button>
          ${canEdit ? `<button class="btn" id="btnAddSlot">+ Ajouter un créneau</button>` : ""}
        </div>
        <div id="timetableGrid"></div>
      </div>
    `;
    container.querySelector("#ttClass").addEventListener("change", (e) => { state.classId = e.target.value; renderGrid(); });
    container.querySelector("#btnDownloadTimetable").addEventListener("click", () => downloadTimetablePdf());
    container.querySelector("#btnAddSlot")?.addEventListener("click", () => openForm());
    renderGrid();
  }

  function renderGrid() {
    const grid = document.getElementById("timetableGrid");
    if (!grid) return;
    const slots = Storage.all("timetable").filter((t) => t.classId === state.classId);
    const subjects = Storage.all("subjects");
    const teachers = Storage.all("teachers");

    grid.innerHTML = `
      <div class="timetable-grid">
        <div class="cell head"></div>
        ${DAYS.map((d) => `<div class="cell head">${d}</div>`).join("")}
        ${renderTimeRows(slots, subjects, teachers)}
      </div>
    `;
    grid.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        Storage.remove("timetable", b.dataset.del);
        Utils.toast("Créneau supprimé", "success");
        renderGrid();
      })
    );
  }

  function renderTimeRows(slots, subjects, teachers) {
    const canEdit = Permissions.canEdit("timetable");
    // Build one row per unique start time present, else default rows.
    const times = Array.from(new Set(slots.map((s) => s.start))).sort();
    const defaultTimes = ["08:00", "10:00", "13:00", "15:00"];
    const allTimes = times.length ? Array.from(new Set([...defaultTimes, ...times])).sort() : defaultTimes;

    return allTimes
      .map((time) => {
        const rowCells = DAYS.map((day) => {
          const daySlots = slots.filter((s) => s.day === day && s.start === time);
          return `<div class="cell">
            ${daySlots
              .map((s) => {
                const subj = subjects.find((x) => x.id === s.subjectId);
                const teacher = teachers.find((x) => x.id === s.teacherId);
                return `<div class="timetable-slot">
                  ${canEdit ? `<span class="del" data-del="${s.id}">✕</span>` : ""}
                  <strong>${Utils.escapeHtml(subj?.name || "-")}</strong><br>
                  ${teacher ? Utils.escapeHtml(teacher.lastName) : ""} · ${Utils.escapeHtml(s.room || "")}<br>
                  ${s.start}-${s.end}
                </div>`;
              })
              .join("")}
          </div>`;
        }).join("");
        return `<div class="cell head">${time}</div>${rowCells}`;
      })
      .join("");
  }

  async function downloadTimetablePdf() {
    const classItem = Storage.get("classes", state.classId);
    if (!classItem) return Utils.toast("Aucune classe sélectionnée", "error");
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const slots = Storage.all("timetable").filter((slot) => slot.classId === state.classId);
    if (!slots.length) return Utils.toast("Aucun créneau à exporter pour cette classe", "error");
    const subjects = Storage.all("subjects");
    const teachers = Storage.all("teachers");
    const times = Array.from(new Set(slots.map((slot) => slot.start))).sort();
    const allTimes = Array.from(new Set(["08:00", "10:00", "13:00", "15:00", ...times])).sort();
    const body = [
      [{ text: "Heure", style: "tableHeader" }, ...DAYS.map((day) => ({ text: day, style: "tableHeader" }))],
      ...allTimes.map((time) => [
        { text: time, style: "timeCell" },
        ...DAYS.map((day) => {
          const daySlots = slots.filter((slot) => slot.day === day && slot.start === time);
          if (!daySlots.length) return { text: "", style: "emptyCell" };
          return {
            stack: daySlots.flatMap((slot, index) => {
              const subject = subjects.find((item) => item.id === slot.subjectId);
              const teacher = teachers.find((item) => item.id === slot.teacherId);
              const entry = [
                { text: subject?.name || "-", bold: true, fontSize: 8 },
                { text: `${teacher ? teacher.lastName : ""}${slot.room ? ` · ${slot.room}` : ""}`, fontSize: 7 },
                { text: `${slot.start}-${slot.end}`, fontSize: 7, color: "#555555" },
              ];
              return index < daySlots.length - 1 ? [...entry, { text: "", margin: [0, 2, 0, 2] }] : entry;
            }),
            style: "slotCell",
          };
        }),
      ]),
    ];
    const settings = Storage.db().settings;
    const logo = await loadLogoDataUrl(settings.bulletin?.logo || "");
    const definition = {
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [28, 24, 28, 24],
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      content: [
        { table: { widths: ["*", 86, "*"], body: [[
          { stack: [
            { text: "REPUBLIQUE DU CAMEROUN", bold: true, fontSize: 10 },
            { text: "Paix - Travail - Patrie", fontSize: 8, margin: [0, 2, 0, 5] },
            { text: settings.bulletin?.ministry || "MINISTERE DES ENSEIGNEMENTS SECONDAIRES", fontSize: 7 },
            { text: "Etablissement scolaire", fontSize: 7 },
          ], alignment: "center" },
          logo ? { image: "establishmentLogo", width: 70, alignment: "center" } : { text: "", style: "emptyCell" },
          { stack: [
            { text: "REPUBLIC OF CAMEROON", bold: true, fontSize: 10 },
            { text: "Peace - Work - Fatherland", fontSize: 8, margin: [0, 2, 0, 5] },
            { text: "MINISTRY OF SECONDARY EDUCATION", fontSize: 7 },
            { text: settings.schoolName || "School establishment", fontSize: 7 },
          ], alignment: "center" },
        ]] }, layout: "noBorders", margin: [0, 0, 0, 8] },
        { text: settings.schoolName || "ETABLISSEMENT SCOLAIRE", style: "schoolName" },
        { text: `EMPLOI DU TEMPS - CLASSE ${classItem.name}`, style: "title" },
        { text: `Année scolaire : ${settings.currentYear || "-"}`, alignment: "center", fontSize: 9, color: "#555555", margin: [0, 0, 0, 12] },
        { table: { headerRows: 1, widths: [55, "*", "*", "*", "*", "*", "*"], body }, layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => "#9aa7b8", vLineColor: () => "#9aa7b8", paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 6, paddingBottom: () => 6 } },
        { text: "Document généré par ScolaGest", alignment: "right", fontSize: 7, color: "#666666", margin: [0, 12, 0, 0] },
      ],
      styles: {
        schoolName: { alignment: "center", bold: true, fontSize: 13, margin: [0, 0, 0, 4] },
        title: { alignment: "center", bold: true, fontSize: 16, margin: [0, 0, 0, 4] },
        tableHeader: { alignment: "center", bold: true, color: "#ffffff", fillColor: "#1f5f8b", fontSize: 9 },
        timeCell: { alignment: "center", bold: true, color: "#1f405c", fillColor: "#e8f0f5", fontSize: 9 },
        slotCell: { fillColor: "#f1f7fb", margin: [2, 2, 2, 2] },
        emptyCell: { text: "", fillColor: "#ffffff" },
      },
      defaultStyle: { font: "Roboto", fontSize: 8 },
    };
    try {
      await Utils.downloadPdfMake(definition, `Emploi-du-temps-${classItem.name}.pdf`);
      Utils.toast("Emploi du temps PDF téléchargé", "success");
    } catch (error) {
      console.error("Erreur de génération de l'emploi du temps PDF", error);
      Utils.toast("Impossible de générer l'emploi du temps PDF", "error");
    }
  }

  function loadLogoDataUrl(logo) {
    if (!logo) return Promise.resolve("");
    if (logo.startsWith("data:")) return Promise.resolve(logo);
    return fetch(logo)
      .then((response) => {
        if (!response.ok) throw new Error("Logo introuvable");
        return response.blob();
      })
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .catch((error) => {
        console.warn("Logo non chargé dans l'emploi du temps PDF", error);
        return "";
      });
  }

  function checkConflict(day, start, end, teacherId, room, classId, excludeId) {
    const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
    const all = Storage.all("timetable").filter((t) => t.id !== excludeId && t.day === day);
    for (const t of all) {
      if (!overlap(start, end, t.start, t.end)) continue;
      if (t.teacherId === teacherId) return `Conflit : l'enseignant a déjà un cours ce créneau (${t.start}-${t.end}).`;
      if (t.room && room && t.room === room) return `Conflit : la salle ${room} est déjà occupée (${t.start}-${t.end}).`;
      if (t.classId === classId) return `Conflit : la classe a déjà un cours ce créneau (${t.start}-${t.end}).`;
    }
    return null;
  }

  function openForm() {
    const subjects = Storage.all("subjects");
    const teachers = Storage.all("teachers");
    Utils.openModal({
      title: "Ajouter un créneau",
      bodyHtml: `
        <form id="ttForm">
          <div class="form-grid">
            <div class="field"><label>Jour *</label><select id="fDay" required>${DAYS.map((d) => `<option value="${d}">${d}</option>`).join("")}</select></div>
            <div class="field"><label>Salle</label><input type="text" id="fRoom" placeholder="Salle 1"></div>
            <div class="field"><label>Heure début *</label><input type="time" id="fStart" value="08:00" required></div>
            <div class="field"><label>Heure fin *</label><input type="time" id="fEnd" value="10:00" required></div>
            <div class="field full"><label>Matière *</label><select id="fSubject" required>${subjects.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join("") || '<option value="">Aucune matière</option>'}</select></div>
            <div class="field full"><label>Enseignant *</label><select id="fTeacher" required><option value="">— Sélectionner —</option>${teachers.map((t) => `<option value="${t.id}">${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}</select></div>
          </div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelForm">Annuler</button>
        <button class="btn" id="saveSlot">💾 Ajouter</button>
      `,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveSlot").addEventListener("click", () => {
          const day = overlay.querySelector("#fDay").value;
          const start = overlay.querySelector("#fStart").value;
          const end = overlay.querySelector("#fEnd").value;
          const room = overlay.querySelector("#fRoom").value.trim();
          const teacherId = overlay.querySelector("#fTeacher").value;
          if (start >= end) {
            Utils.toast("L'heure de fin doit être après l'heure de début", "error");
            return;
          }
          const conflict = checkConflict(day, start, end, teacherId, room, state.classId, null);
          if (conflict) {
            Utils.toast(conflict, "error");
            return;
          }
          Storage.insert("timetable", {
            classId: state.classId,
            day,
            start,
            end,
            room,
            subjectId: overlay.querySelector("#fSubject").value,
            teacherId,
          });
          Utils.toast("Créneau ajouté", "success");
          Utils.closeModal();
          renderGrid();
        });
      },
    });
  }

  return { render };
})();
