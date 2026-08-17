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
          ${canEdit ? `<button class="btn" id="btnAddSlot">+ Ajouter un créneau</button>` : ""}
        </div>
        <div id="timetableGrid"></div>
      </div>
    `;
    container.querySelector("#ttClass").addEventListener("change", (e) => { state.classId = e.target.value; renderGrid(); });
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
            <div class="field"><label>Jour</label><select id="fDay">${DAYS.map((d) => `<option value="${d}">${d}</option>`).join("")}</select></div>
            <div class="field"><label>Salle</label><input type="text" id="fRoom" placeholder="Salle 1"></div>
            <div class="field"><label>Heure début</label><input type="time" id="fStart" value="08:00"></div>
            <div class="field"><label>Heure fin</label><input type="time" id="fEnd" value="10:00"></div>
            <div class="field full"><label>Matière</label><select id="fSubject">${subjects.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join("")}</select></div>
            <div class="field full"><label>Enseignant</label><select id="fTeacher"><option value="">—</option>${teachers.map((t) => `<option value="${t.id}">${Utils.escapeHtml(t.firstName + " " + t.lastName)}</option>`).join("")}</select></div>
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
