/**
 * Module Paiements & Frais scolaires : inscription, scolarité, examen, cantine,
 * transport, uniformes, autres frais ; paiements partiels/complets, reçus, relances.
 */
const Payments = (() => {
  const FEE_TYPES = ["Inscription", "Scolarité", "Frais d'examen", "Cantine", "Transport", "Uniformes", "Autre"];
  let rootContainer = null;
  let selectedClassId = "";
  let searchQuery = "";

  function render(container, preserveState = false) {
    rootContainer = container;
    if (!preserveState) {
      selectedClassId = "";
      searchQuery = "";
    }
    const canEdit = Permissions.canEdit("payments");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input type="text" id="paySearch" value="${Utils.escapeHtml(searchQuery)}" placeholder="🔍 Rechercher une classe..." aria-label="Rechercher une classe">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddPayment">+ Dossier de paiement</button>` : ""}
        </div>
        <div class="table-wrap" id="paymentsTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddPayment")?.addEventListener("click", () => openStudentPicker());
    container.querySelector("#paySearch").addEventListener("input", (event) => { searchQuery = event.target.value; renderView(); });
    renderView();
  }

  function computeTotals(record) {
    const total = (record.items || []).reduce((a, i) => a + Number(i.amount), 0);
    const paid = (record.transactions || []).reduce((a, t) => a + Number(t.amount), 0);
    return { total, paid, remaining: total - paid };
  }

  function paymentForStudent(student, classYear) {
    const records = Storage.all("payments").filter((record) => record.studentId === student.id);
    return records.find((record) => record.year === classYear) || records.sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")))[0] || null;
  }

  function visibleStudents() {
    const scoped = Auth.scopedStudentIds();
    return Storage.all("students").filter((student) => !scoped || scoped.includes(student.id));
  }

  function renderView() {
    const wrap = document.getElementById("paymentsTableWrap");
    if (!wrap) return;
    const query = searchQuery.trim().toLowerCase();
    const currentClass = Storage.get("classes", selectedClassId);
    if (selectedClassId && !currentClass) selectedClassId = "";
    rootContainer.querySelector("#paySearch").hidden = Boolean(selectedClassId);
    if (selectedClassId) renderClassPayments(wrap, currentClass);
    else renderClassCards(wrap, query);
  }

  function renderClassCards(wrap, query) {
    const classes = Storage.all("classes");
    const students = visibleStudents();
    const visibleClasses = classes.filter((classItem) => classItem.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (visibleClasses.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucune classe correspondante.</div>`;
      return;
    }
    wrap.innerHTML = `<div class="payment-class-grid">${visibleClasses.map((classItem) => {
      const roster = students.filter((student) => student.classId === classItem.id);
      const totals = roster.reduce((sum, student) => {
        const record = paymentForStudent(student, classItem.year);
        if (!record) return sum;
        const paymentTotals = computeTotals(record);
        sum.due += paymentTotals.total;
        sum.paid += paymentTotals.paid;
        sum.remaining += paymentTotals.remaining;
        return sum;
      }, { due: 0, paid: 0, remaining: 0 });
      return `<button type="button" class="panel payment-class-card" data-open-class="${classItem.id}">
        <h3>${Utils.escapeHtml(classItem.name)}</h3>
        <div class="text-muted">${Utils.escapeHtml(classItem.level || classItem.name)} — ${Utils.escapeHtml(classItem.year || "")}</div>
        <div class="payment-class-count">${roster.length} élève(s)</div>
        <div class="payment-class-totals"><span>Payé</span><strong class="payment-total-paid">${Utils.formatMoney(totals.paid)}</strong><span>Montant à verser</span><strong class="payment-total-due">${Utils.formatMoney(totals.due)}</strong><span>Reste</span><strong class="payment-total-remaining">${Utils.formatMoney(totals.remaining)}</strong></div>
      </button>`;
    }).join("")}</div>`;
    wrap.querySelectorAll("[data-open-class]").forEach((card) => card.addEventListener("click", () => {
      selectedClassId = card.dataset.openClass;
      renderView();
    }));
  }

  function renderClassPayments(wrap, classItem) {
    const canEdit = Permissions.canEdit("payments");
    const students = visibleStudents().filter((student) => student.classId === classItem.id)
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr"));
    const summaries = students.map((student) => ({ student, record: paymentForStudent(student, classItem.year) }));
    const totals = summaries.reduce((sum, entry) => {
      if (!entry.record) return sum;
      const paymentTotals = computeTotals(entry.record);
      sum.due += paymentTotals.total;
      sum.paid += paymentTotals.paid;
      sum.remaining += paymentTotals.remaining;
      return sum;
    }, { due: 0, paid: 0, remaining: 0 });
    wrap.innerHTML = `
      <div class="toolbar payment-detail-toolbar">
        <button type="button" class="btn btn-secondary" id="btnBackToPaymentClasses">← Toutes les classes</button>
        <strong>${Utils.escapeHtml(classItem.name)}</strong>
        <span class="text-muted">${Utils.escapeHtml(classItem.year || "")} · ${students.length} élève(s)</span>
        <span class="spacer"></span>
        <span class="payment-summary"><span>Payé <strong class="payment-total-paid">${Utils.formatMoney(totals.paid)}</strong></span><span>Montant à verser <strong class="payment-total-due">${Utils.formatMoney(totals.due)}</strong></span><span>Reste <strong class="payment-total-remaining">${Utils.formatMoney(totals.remaining)}</strong></span></span>
      </div>
      ${students.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>#</th><th>Matricule</th><th>Élève</th><th>Total dû</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${summaries.map(({ student, record }, index) => {
          if (!record) return `<tr><td>${index + 1}</td><td>${Utils.escapeHtml(student.matricule || "-")}</td><td>${Utils.escapeHtml(`${student.firstName} ${student.lastName}`)}</td><td>-</td><td>-</td><td>-</td><td><span class="badge badge-muted">Sans dossier</span></td><td>${canEdit ? `<button type="button" class="btn btn-sm btn-secondary" data-create-payment="${student.id}">+ Créer</button>` : ""}</td></tr>`;
          const { total, paid, remaining } = computeTotals(record);
          const status = total === 0 && paid === 0 ? '<span class="badge badge-muted">À compléter</span>' : remaining <= 0 ? '<span class="badge badge-success">Soldé</span>' : paid > 0 ? '<span class="badge badge-warning">Partiel</span>' : '<span class="badge badge-danger">Impayé</span>';
          return `<tr><td>${index + 1}</td><td>${Utils.escapeHtml(student.matricule || "-")}</td><td>${Utils.escapeHtml(`${student.firstName} ${student.lastName}`)}</td><td>${Utils.formatMoney(total)}</td><td>${Utils.formatMoney(paid)}</td><td>${Utils.formatMoney(remaining)}</td><td>${status}</td><td class="table-actions"><button type="button" class="btn btn-sm btn-secondary" data-view="${record.id}">👁️ Détails</button>${canEdit && remaining > 0 ? `<button type="button" class="btn btn-sm btn-secondary" data-remind="${record.id}">📩 Relance</button>` : ""}${canEdit ? `<button type="button" class="btn btn-sm btn-danger" data-del="${record.id}">🗑️</button>` : ""}</td></tr>`;
        }).join("")}</tbody>
      </table></div>` : `<div class="empty-state">Aucun élève dans cette classe.</div>`}`;
    wrap.querySelector("#btnBackToPaymentClasses").addEventListener("click", () => { selectedClassId = ""; renderView(); });
    wrap.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => viewRecord(button.dataset.view)));
    wrap.querySelectorAll("[data-remind]").forEach((button) => button.addEventListener("click", () => sendReminder(button.dataset.remind)));
    wrap.querySelectorAll("[data-create-payment]").forEach((button) => button.addEventListener("click", () => {
      const student = Storage.get("students", button.dataset.createPayment);
      const record = Storage.insert("payments", { studentId: student.id, year: classItem.year || Storage.db().settings.currentYear, items: [], transactions: [] });
      viewRecord(record.id);
      renderView();
    }));
    wrap.querySelectorAll("[data-del]").forEach((button) => button.addEventListener("click", () => {
      Utils.confirmDialog("Supprimer ce dossier de paiement ?", () => {
        Storage.remove("payments", button.dataset.del);
        Utils.toast("Dossier supprimé", "success");
        renderView();
      });
    }));
  }

  function sendReminder(id) {
    const r = Storage.get("payments", id);
    const s = Storage.get("students", r.studentId);
    const { remaining } = computeTotals(r);
    Utils.toast(`📩 Relance envoyée à ${s.parent?.name || "le parent"} : reste à payer ${Utils.formatMoney(remaining)}`, "info");
  }

  function openStudentPicker() {
    const students = Storage.all("students");
    const withoutRecord = students.filter((s) => !Storage.all("payments").find((r) => r.studentId === s.id));
    Utils.openModal({
      title: "Nouveau dossier de paiement",
      bodyHtml: `
        <div class="field"><label>Élève *</label>
          <select id="pickStudent" required>${(withoutRecord.length ? withoutRecord : students).map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)} (${Utils.escapeHtml(s.matricule)})</option>`).join("") || '<option value="">Aucun élève</option>'}</select>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="createRecord">Créer</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#createRecord").addEventListener("click", () => {
          const studentId = overlay.querySelector("#pickStudent").value;
          if (!studentId) return;
          let record = Storage.all("payments").find((r) => r.studentId === studentId);
          if (!record) {
            record = Storage.insert("payments", { studentId, year: Storage.db().settings.currentYear, items: [], transactions: [] });
          }
          Utils.closeModal();
          viewRecord(record.id);
        });
      },
    });
  }

  function viewRecord(id) {
    const record = Storage.get("payments", id);
    const s = Storage.get("students", record.studentId);
    const { total, paid, remaining } = computeTotals(record);
    const canEdit = Permissions.canEdit("payments");

    Utils.openModal({
      title: `Paiements — ${s.firstName} ${s.lastName}`,
      width: "750px",
      bodyHtml: `
        <div class="cards-grid" style="margin-bottom:12px;">
          <div class="stat-card"><div class="stat-value">${Utils.formatMoney(total)}</div><div class="stat-label">Total dû</div></div>
          <div class="stat-card"><div class="stat-value">${Utils.formatMoney(paid)}</div><div class="stat-label">Déjà payé</div></div>
          <div class="stat-card"><div class="stat-value">${Utils.formatMoney(remaining)}</div><div class="stat-label">Reste à payer</div></div>
        </div>
        <div class="toolbar no-print">
          ${canEdit ? `<button class="btn btn-secondary btn-sm" id="btnAddItem">+ Ajouter un frais</button>
          <button class="btn btn-sm" id="btnAddTx">+ Enregistrer un paiement</button>` : ""}
          <span class="spacer"></span>
          <button class="btn btn-secondary btn-sm" id="btnPrintInvoice">🖨️ Facture</button>
        </div>
        <h4>Frais</h4>
        <table class="data-table">
          <thead><tr><th>Type</th><th>Montant</th><th></th></tr></thead>
          <tbody>
            ${(record.items || []).map((it, idx) => `<tr><td>${Utils.escapeHtml(it.type)}</td><td>${Utils.formatMoney(it.amount)}</td><td>${canEdit ? `<button class="btn btn-sm btn-danger" data-delitem="${idx}">🗑️</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="3">Aucun frais</td></tr>`}
          </tbody>
        </table>
        <h4>Transactions / Reçus</h4>
        <table class="data-table">
      renderView();
          <tbody>
            ${(record.transactions || []).map((t, idx) => `<tr><td>${Utils.formatDate(t.date)}</td><td>${Utils.formatMoney(t.amount)}</td><td>${Utils.escapeHtml(t.mode)}</td><td>${Utils.escapeHtml(t.receiptNo)}</td><td><button class="btn btn-sm btn-secondary" data-receipt="${idx}">🧾</button></td></tr>`).join("") || `<tr><td colspan="5">Aucune transaction</td></tr>`}
          </tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeBtn">Fermer</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#btnAddItem")?.addEventListener("click", () => addItem(record.id));
        overlay.querySelector("#btnAddTx")?.addEventListener("click", () => addTransaction(record.id, remaining));
        overlay.querySelector("#btnPrintInvoice").addEventListener("click", () => printInvoice(record.id));
        overlay.querySelectorAll("[data-delitem]").forEach((b) =>
          b.addEventListener("click", () => {
            const items = [...record.items];
            items.splice(Number(b.dataset.delitem), 1);
            Storage.update("payments", record.id, { items });
            Utils.closeModal();
            viewRecord(record.id);
            renderView();
          })
        );
        overlay.querySelectorAll("[data-receipt]").forEach((b) =>
          b.addEventListener("click", () => printReceipt(record.id, Number(b.dataset.receipt)))
        );
      },
    });
  }

  function addItem(recordId) {
    Utils.openModal({
      title: "Ajouter un frais",
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Type de frais *</label><select id="fType" required>${FEE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></div>
          <div class="field"><label>Montant (FCFA) *</label><input type="number" id="fAmount" min="0.01" step="any" required></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveItem">Ajouter</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveItem").addEventListener("click", () => {
          const amount = Number(overlay.querySelector("#fAmount").value);
          if (!amount) return Utils.toast("Montant invalide", "error");
          const record = Storage.get("payments", recordId);
          const items = [...(record.items || []), { type: overlay.querySelector("#fType").value, amount }];
          Storage.update("payments", recordId, { items });
          Utils.closeModal();
          viewRecord(recordId);
            renderView();
        });
      },
    });
  }

  function addTransaction(recordId, remaining) {
    Utils.openModal({
      title: "Enregistrer un paiement",
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Montant (FCFA) *</label><input type="number" id="fAmount" min="0.01" step="any" value="${remaining > 0 ? remaining : ""}" required></div>
          <div class="field"><label>Mode de paiement</label>
            <select id="fMode" required><option>Espèces</option><option>Mobile Money</option><option>Virement</option><option>Chèque</option></select>
          </div>
          <div class="field"><label>Date *</label><input type="date" id="fDate" value="${Utils.today()}" required></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveTx">Enregistrer</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveTx").addEventListener("click", () => {
          const amount = Number(overlay.querySelector("#fAmount").value);
          if (!amount) return Utils.toast("Montant invalide", "error");
          const record = Storage.get("payments", recordId);
          const receiptNo = "REC-" + Utils.pad((record.transactions || []).length + 1, 4);
          const transactions = [...(record.transactions || []), { id: Utils.uid(), date: overlay.querySelector("#fDate").value, amount, mode: overlay.querySelector("#fMode").value, receiptNo }];
          Storage.update("payments", recordId, { transactions });
          Utils.toast("Paiement enregistré", "success");
          Utils.closeModal();
          viewRecord(recordId);
          renderView();
        });
      },
    });
  }

  async function printReceipt(recordId, txIdx) {
    const record = Storage.get("payments", recordId);
    const s = Storage.get("students", record.studentId);
    const tx = record.transactions[txIdx];
    const settings = Storage.db().settings;
    let logo = "";
    try { logo = await Bulletins.loadLogoDataUrl(); } catch (e) { console.warn("Logo indisponible", e); }
    const definition = {
      pageSize: "A4",
      pageMargins: [40, 40, 40, 40],
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      content: [
        { columns: [
          logo ? { image: "establishmentLogo", width: 60 } : { text: "", width: 60 },
          { text: settings.bulletin?.institution || settings.schoolName, bold: true, fontSize: 14, margin: [12, 18, 0, 0] },
        ], margin: [0, 0, 0, 20] },
        { text: "REÇU DE PAIEMENT N° " + tx.receiptNo, bold: true, fontSize: 16, alignment: "center", margin: [0, 0, 0, 16] },
        { text: [{ text: "Élève : " }, { text: s.firstName + " " + s.lastName, bold: true }, { text: " (" + (s.matricule || "-") + ")" }], margin: [0, 0, 0, 6] },
        { text: "Date : " + Utils.formatDate(tx.date), margin: [0, 0, 0, 6] },
        { text: "Mode de paiement : " + tx.mode, margin: [0, 0, 0, 12] },
        { text: "Montant : " + Utils.formatMoney(tx.amount), bold: true, fontSize: 16, margin: [0, 0, 0, 50] },
        { columns: [{ text: "Signature du caissier", alignment: "center" }, { text: "Cachet de l'établissement", alignment: "center" }] },
      ],
      defaultStyle: { font: "Roboto", fontSize: 11 },
    };
    try {
      await Utils.downloadPdfMake(definition, `Recu-${tx.receiptNo}.pdf`);
      Utils.toast("Reçu PDF téléchargé", "success");
    } catch (error) {
      console.error("Erreur de génération du reçu PDF", error);
      Utils.toast("Impossible de générer le reçu", "error");
    }
  }

  async function printInvoice(recordId) {
    const record = Storage.get("payments", recordId);
    const s = Storage.get("students", record.studentId);
    const { total, paid, remaining } = computeTotals(record);
    const settings = Storage.db().settings;
    const institution = settings.bulletin?.institution || settings.schoolName;
    let logo = "";
    try { logo = await Bulletins.loadLogoDataUrl(); } catch (e) { console.warn("Logo indisponible", e); }
    const definition = {
      pageSize: "A4",
      pageMargins: [40, 40, 40, 40],
      ...(logo ? { images: { establishmentLogo: logo } } : {}),
      content: [
        { columns: [
          logo ? { image: "establishmentLogo", width: 60 } : { text: "", width: 60 },
          { stack: [{ text: institution, bold: true, fontSize: 14 }, { text: settings.bulletin?.address || "", fontSize: 9 }, { text: settings.bulletin?.phone ? "Tél. : " + settings.bulletin.phone : "", fontSize: 9 }], margin: [12, 6, 0, 0] },
        ], margin: [0, 0, 0, 20] },
        { text: "FACTURE", bold: true, fontSize: 18, alignment: "center", margin: [0, 0, 0, 14] },
        { text: [{ text: "Élève : " }, { text: s.firstName + " " + s.lastName, bold: true }, { text: "   Matricule : " + (s.matricule || "-") }, { text: "   Année : " + (record.year || settings.currentYear) }], margin: [0, 0, 0, 12] },
        { table: { headerRows: 1, widths: ["*", 120], body: [
          [{ text: "Frais", style: "th" }, { text: "Montant", style: "th", alignment: "right" }],
          ...(record.items || []).map((it) => [it.type, { text: Utils.formatMoney(it.amount), alignment: "right" }]),
        ] }, margin: [0, 0, 0, 14] },
        { table: { widths: ["*", 120], body: [
          [{ text: "Total dû", bold: true }, { text: Utils.formatMoney(total), alignment: "right", bold: true }],
          ["Déjà payé", { text: Utils.formatMoney(paid), alignment: "right" }],
          [{ text: "Reste à payer", bold: true }, { text: Utils.formatMoney(remaining), alignment: "right", bold: true }],
        ] }, layout: "lightHorizontalLines" },
      ],
      styles: { th: { bold: true, color: "white", fillColor: "2f6fed" } },
      defaultStyle: { font: "Roboto", fontSize: 10 },
    };
    try {
      await Utils.downloadPdfMake(definition, `Facture-${s.firstName}-${s.lastName}.pdf`);
      Utils.toast("Facture PDF téléchargée", "success");
    } catch (error) {
      console.error("Erreur de génération de la facture PDF", error);
      Utils.toast("Impossible de générer la facture", "error");
    }
  }

  return { render, computeTotals };
})();
