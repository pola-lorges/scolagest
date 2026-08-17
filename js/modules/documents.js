/**
 * Module Documents : centralise certificats de scolarité, bulletins, relevés de notes,
 * attestations, justificatifs, dossiers élèves — génération automatique de PDF (impression).
 */
const Documents = (() => {
  const DOC_TYPES = [
    "Certificat de scolarité",
    "Attestation de réussite",
    "Relevé de notes",
    "Justificatif d'absence",
    "Document administratif",
  ];

  function render(container) {
    const scoped = Auth.scopedStudentIds();
    const canEdit = Permissions.canEdit("documents");
    const students = Storage.all("students").filter((s) => !scoped || scoped.includes(s.id));
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <select id="docStudent" ${scoped ? "disabled" : ""}><option value="">Tous les élèves</option>${students.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("")}</select>
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnGenerateDoc">+ Générer un document</button>` : ""}
        </div>
        <div class="table-wrap" id="docsTableWrap"></div>
      </div>
    `;
    container.querySelector("#docStudent").addEventListener("change", (e) => renderTable(e.target.value));
    container.querySelector("#btnGenerateDoc")?.addEventListener("click", () => openForm());
    renderTable(scoped ? (scoped[0] || "__none__") : "");
  }

  function renderTable(studentId = "") {
    const wrap = document.getElementById("docsTableWrap");
    if (!wrap) return;
    const scoped = Auth.scopedStudentIds();
    const students = Storage.all("students");
    const docs = Storage.all("documents").filter((d) => (!scoped || scoped.includes(d.studentId)) && (!studentId || d.studentId === studentId));
    if (docs.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucun document généré.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Titre</th><th>Type</th><th>Élève</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${docs
            .map((d) => {
              const s = students.find((x) => x.id === d.studentId);
              return `
              <tr>
                <td>${Utils.escapeHtml(d.title)}</td>
                <td>${Utils.escapeHtml(d.type)}</td>
                <td>${s ? Utils.escapeHtml(s.firstName + " " + s.lastName) : "-"}</td>
                <td>${Utils.formatDate(d.date)}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-print="${d.id}">🖨️ PDF</button>
                  ${Permissions.canEdit("documents") ? `<button class="btn btn-sm btn-danger" data-del="${d.id}">🗑️</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => printDocument(b.dataset.print)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer ce document ?", () => {
          Storage.remove("documents", b.dataset.del);
          Utils.toast("Document supprimé", "success");
          renderTable();
        });
      })
    );
  }

  function openForm() {
    const students = Storage.all("students");
    Utils.openModal({
      title: "Générer un document",
      bodyHtml: `
        <div class="form-grid">
          <div class="field full"><label>Élève *</label>
            <select id="fStudent">${students.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("") || "<option>Aucun élève</option>"}</select>
          </div>
          <div class="field full"><label>Type de document *</label>
            <select id="fType">${DOC_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          </div>
          <div class="field full"><label>Titre</label><input type="text" id="fTitle" placeholder="ex: Certificat de scolarité 2025-2026"></div>
          <div class="field full"><label>Contenu / observations complémentaires</label><textarea id="fContent" rows="3"></textarea></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveDoc">Générer</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveDoc").addEventListener("click", () => {
          const studentId = overlay.querySelector("#fStudent").value;
          if (!studentId) return Utils.toast("Sélectionnez un élève", "error");
          const type = overlay.querySelector("#fType").value;
          const title = overlay.querySelector("#fTitle").value.trim() || type;
          const content = overlay.querySelector("#fContent").value.trim();
          const doc = Storage.insert("documents", { studentId, type, title, content, date: Utils.today() });
          Utils.toast("Document généré", "success");
          Utils.closeModal();
          renderTable();
          printDocument(doc.id);
        });
      },
    });
  }

  function buildContent(doc, student) {
    const settings = Storage.db().settings;
    const cls = Storage.get("classes", student.classId);
    switch (doc.type) {
      case "Certificat de scolarité":
        return `<p>Nous soussignés, Direction de <strong>${Utils.escapeHtml(settings.schoolName)}</strong>, certifions que l'élève
          <strong>${Utils.escapeHtml(student.firstName)} ${Utils.escapeHtml(student.lastName)}</strong>, né(e) le ${Utils.formatDate(student.dob)} à ${Utils.escapeHtml(student.pob || "-")},
          matricule ${Utils.escapeHtml(student.matricule)}, est régulièrement inscrit(e) dans notre établissement en classe de
          <strong>${cls ? Utils.escapeHtml(cls.name) : "-"}</strong> au titre de l'année scolaire ${Utils.escapeHtml(settings.currentYear)}.</p>
          <p>En foi de quoi, ce certificat est délivré pour servir et valoir ce que de droit.</p>`;
      case "Attestation de réussite":
        return `<p>Nous attestons que l'élève <strong>${Utils.escapeHtml(student.firstName)} ${Utils.escapeHtml(student.lastName)}</strong>
          (matricule ${Utils.escapeHtml(student.matricule)}) a satisfait aux exigences de passage pour l'année scolaire ${Utils.escapeHtml(settings.currentYear)}.</p>`;
      case "Relevé de notes": {
        const grades = Storage.all("grades").filter((g) => g.studentId === student.id);
        const subjects = Storage.all("subjects");
        return `<table><thead><tr><th>Matière</th><th>Type</th><th>Note</th><th>Trimestre</th></tr></thead>
          <tbody>${grades.map((g) => `<tr><td>${Utils.escapeHtml(subjects.find((s) => s.id === g.subjectId)?.name || "-")}</td><td>${Utils.escapeHtml(g.type)}</td><td>${g.value}/${g.max}</td><td>${Utils.escapeHtml(g.term)}</td></tr>`).join("") || `<tr><td colspan="4">Aucune note</td></tr>`}</tbody>
        </table>`;
      }
      case "Justificatif d'absence":
        return `<p>Ce document atteste que l'élève <strong>${Utils.escapeHtml(student.firstName)} ${Utils.escapeHtml(student.lastName)}</strong> a fourni un justificatif d'absence.</p>`;
      default:
        return `<p>${Utils.escapeHtml(doc.content || "")}</p>`;
    }
  }

  function printDocument(id) {
    const doc = Storage.get("documents", id);
    if (!doc) return;
    const student = Storage.get("students", doc.studentId);
    const settings = Storage.db().settings;
    const html = `
      <div class="bulletin">
        <div class="bulletin-header">
          <h2 style="margin:0;">${Utils.escapeHtml(settings.schoolName)}</h2>
        </div>
        <h3 style="text-align:center;text-decoration:underline;">${Utils.escapeHtml(doc.title)}</h3>
        <div style="margin:20px 0;">${buildContent(doc, student)}</div>
        ${doc.content && doc.type !== "Autre" ? `<p>${Utils.escapeHtml(doc.content)}</p>` : ""}
        <p style="text-align:right;margin-top:30px;">Fait le ${Utils.formatDate(doc.date)}</p>
        <div class="signature-row"><div></div><div>Le chef d'établissement</div></div>
      </div>
    `;
    Utils.printElement(html, doc.title);
  }

  return { render, printDocument };
})();
