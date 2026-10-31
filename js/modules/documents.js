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
    const students = Storage.all("students").filter((s) => !scoped || scoped.includes(s.id)).sort(Utils.comparePeople);
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
    const docs = Storage.all("documents").filter((d) => (!scoped || scoped.includes(d.studentId)) && (!studentId || d.studentId === studentId))
      .sort((a, b) => Utils.comparePeople(Storage.get("students", a.studentId), Storage.get("students", b.studentId)) || Utils.compareFrenchNames(a.title, b.title));
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
                  <button class="btn btn-sm btn-secondary" data-print="${d.id}">🖨️</button>
                  <button class="btn btn-sm" data-download="${d.id}">⬇️ PDF</button>
                  ${Permissions.canEdit("documents") ? `<button class="btn btn-sm btn-danger" data-del="${d.id}">🗑️</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => printDocument(b.dataset.print)));
    wrap.querySelectorAll("[data-download]").forEach((b) => b.addEventListener("click", () => downloadDocument(b.dataset.download)));
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
    const students = [...Storage.all("students")].sort(Utils.comparePeople);
    Utils.openModal({
      title: "Générer un document",
      bodyHtml: `
        <div class="form-grid">
          <div class="field full"><label>Élève *</label>
            <select id="fStudent" required>${students.map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)}</option>`).join("") || '<option value="">Aucun élève</option>'}</select>
          </div>
          <div class="field full"><label>Type de document *</label>
            <select id="fType" required>${[...DOC_TYPES].sort(Utils.compareFrenchNames).map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
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
        return `<table><thead><tr><th>Matière</th><th>Type</th><th>Note</th><th>Trimestre</th><th>Séquence</th></tr></thead>
          <tbody>${grades.map((g) => `<tr><td>${Utils.escapeHtml(subjects.find((s) => s.id === g.subjectId)?.name || "-")}</td><td>${Utils.escapeHtml(g.type)}</td><td>${g.value}/${g.max}</td><td>${Utils.escapeHtml(g.term)}</td><td>${Utils.escapeHtml(Grades.gradeSequence(g))}</td></tr>`).join("") || `<tr><td colspan="5">Aucune note</td></tr>`}</tbody>
        </table>`;
      }
      case "Justificatif d'absence":
        return `<p>Ce document atteste que l'élève <strong>${Utils.escapeHtml(student.firstName)} ${Utils.escapeHtml(student.lastName)}</strong> a fourni un justificatif d'absence.</p>`;
      default:
        return `<p>${Utils.escapeHtml(doc.content || "")}</p>`;
    }
  }

  function printDocument(id) {
    const html = buildDocumentHtml(id);
    if (html) Utils.printElement(html, Storage.get("documents", id)?.title || "Document");
  }

  function downloadDocument(id) {
    const doc = Storage.get("documents", id);
    const scoped = Auth.scopedStudentIds();
    if (doc && scoped && !scoped.includes(doc.studentId)) return Utils.toast("Ce document n'est pas associé à votre compte.", "error");
    if (!doc || typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      return Utils.toast("PDFMake n'est pas disponible", "error");
    }
    const student = Storage.get("students", doc.studentId);
    if (!student) return;
    const settings = Storage.db().settings;
    const cls = Storage.get("classes", student.classId);
    const definition = {
      pageSize: "A4", pageMargins: [35, 35, 35, 35],
      content: [
        { text: settings.schoolName, style: "school" },
        { text: doc.title, style: "title" },
        { text: "Élève : " + student.firstName + " " + student.lastName + "\nMatricule : " + student.matricule + "\nClasse : " + (cls?.name || "-"), margin: [0, 0, 0, 18] },
        ...documentPdfContent(doc, student, settings),
        { text: "Fait le " + Utils.formatDate(doc.date), alignment: "right", margin: [0, 25, 0, 35] },
        { text: "Le chef d'établissement", alignment: "right" },
      ],
      styles: { school: { fontSize: 16, bold: true, alignment: "center", margin: [0, 0, 0, 20] }, title: { fontSize: 14, bold: true, alignment: "center", decoration: "underline", margin: [0, 0, 0, 20] } },
      defaultStyle: { font: "Roboto", fontSize: 10 },
    };
    Utils.downloadPdfMake(definition, `${doc.title.replace(/[^a-z0-9_-]+/gi, "-")}.pdf`)
      .then(() => Utils.toast("Document PDF téléchargé", "success"))
      .catch((error) => {
        console.error("Erreur de téléchargement du document PDF", error);
        Utils.toast("Impossible de télécharger le document PDF", "error");
      });
  }

  function documentPdfContent(doc, student, settings) {
    const cls = Storage.get("classes", student.classId);
    if (doc.type === "Relevé de notes") {
      const subjects = Storage.all("subjects");
      const body = [["Matière", "Type", "Note", "Trimestre", "Séquence"]];
      Storage.all("grades").filter((grade) => grade.studentId === student.id).forEach((grade) => {
        body.push([subjects.find((subject) => subject.id === grade.subjectId)?.name || "-", grade.type, `${grade.value}/${grade.max}`, grade.term, Grades.gradeSequence(grade)]);
      });
      return [{ table: { headerRows: 1, widths: ["*", 70, 50, 70, 65], body }, layout: "lightHorizontalLines" }];
    }
    const paragraphs = {
      "Certificat de scolarité": `Nous soussignés, Direction de ${settings.schoolName}, certifions que l'élève ${student.firstName} ${student.lastName}, né(e) le ${Utils.formatDate(student.dob)} à ${student.pob || "-"}, est régulièrement inscrit(e) en classe de ${cls?.name || "-"} au titre de l'année scolaire ${settings.currentYear}.`,
      "Attestation de réussite": `Nous attestons que l'élève ${student.firstName} ${student.lastName} a satisfait aux exigences de passage pour l'année scolaire ${settings.currentYear}.`,
      "Justificatif d'absence": `Ce document atteste que l'élève ${student.firstName} ${student.lastName} a fourni un justificatif d'absence.`,
    };
    return [{ text: paragraphs[doc.type] || doc.content || "", margin: [0, 5, 0, 10] }, ...(doc.content ? [{ text: doc.content }] : [])];
  }

  function buildDocumentHtml(id) {
    const doc = Storage.get("documents", id);
    if (!doc) return null;
    const scoped = Auth.scopedStudentIds();
    if (scoped && !scoped.includes(doc.studentId)) return null;
    const student = Storage.get("students", doc.studentId);
    if (!student) return null;
    const settings = Storage.db().settings;
    return `
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
  }

  return { render, printDocument };
})();
