/**
 * Module Paiements & Frais scolaires : inscription, scolarité, examen, cantine,
 * transport, uniformes, autres frais ; paiements partiels/complets, reçus, relances.
 */
const Payments = (() => {
  const REQUIRED_FEES = ["Inscription", "1ère tranche", "2ème tranche", "3ème tranche"];
  let rootContainer = null;
  let selectedClassId = "";
  let searchQuery = "";

  function render(container, preserveState = false) {
    rootContainer = container;
    if (!preserveState) {
      selectedClassId = "";
      searchQuery = "";
    }
    ensureRequiredFeePlans();
    const canEdit = Permissions.canEdit("payments");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input type="text" id="paySearch" value="${Utils.escapeHtml(searchQuery)}" placeholder="🔍 Rechercher une classe..." aria-label="Rechercher une classe">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddPayment">Ouvrir un dossier de paiement</button>` : ""}
        </div>
        <div class="table-wrap" id="paymentsTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddPayment")?.addEventListener("click", () => openStudentPicker());
    container.querySelector("#paySearch").addEventListener("input", (event) => { searchQuery = event.target.value; renderView(); });
    renderView();
  }

  function computeTotals(record) {
    const planConfigured = requiredFeesConfigured(record);
    const total = (record.items || []).reduce((sum, item) => {
      if (item.legacy && planConfigured) return sum;
      return sum + Number(item.amount || 0);
    }, 0);
    const paid = (record.transactions || []).reduce((a, t) => a + Number(t.amount), 0);
    return { total, paid, remaining: total - paid };
  }

  function feeAmount(record, feeType) {
    return (record.items || []).filter((item) => item.type === feeType).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  function feePaid(record, feeType) {
    return (record.transactions || []).filter((transaction) => transaction.feeType === feeType).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  }

  function requiredFeesConfigured(record) {
    return REQUIRED_FEES.every((feeType) => feeAmount(record, feeType) > 0);
  }

  function paymentStatus(record, totals = computeTotals(record)) {
    if (!requiredFeesConfigured(record)) return '<span class="badge badge-muted">À compléter</span>';
    if (totals.remaining <= 0) return '<span class="badge badge-success">Soldé</span>';
    if (totals.paid > 0) return '<span class="badge badge-warning">Partiel</span>';
    return '<span class="badge badge-danger">Impayé</span>';
  }

  function createPaymentRecord(studentId, year) {
    return Storage.insert("payments", {
      studentId,
      year,
      items: REQUIRED_FEES.map((type) => ({ type, amount: 0, required: true })),
      transactions: [],
    });
  }

  function ensureRequiredFeePlans() {
    const scoped = Auth.scopedStudentIds();
    Storage.all("students").filter((student) => !scoped || scoped.includes(student.id)).forEach((student) => {
      const classItem = Storage.get("classes", student.classId);
      const record = paymentForStudent(student, classItem?.year);
      if (!record) {
        createPaymentRecord(student.id, classItem?.year || student.year || Storage.db().settings.currentYear);
        return;
      }
      const items = (record.items || []).map((item) => {
        if (REQUIRED_FEES.includes(item.type) || item.legacy) return item;
        return { ...item, legacy: true };
      });
      const missingFees = REQUIRED_FEES.filter((feeType) => !items.some((item) => item.type === feeType));
      const legacyFlagsChanged = items.some((item, index) => item !== (record.items || [])[index]);
      if (missingFees.length || legacyFlagsChanged) {
        Storage.update("payments", record.id, {
          items: [...items, ...missingFees.map((type) => ({ type, amount: 0, required: true }))],
        });
      }
    });
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
    const visibleClassIds = new Set(visibleStudents().map((student) => student.classId));
    if (selectedClassId && (!currentClass || !visibleClassIds.has(selectedClassId))) selectedClassId = "";
    rootContainer.querySelector("#paySearch").hidden = Boolean(selectedClassId);
    if (selectedClassId) renderClassPayments(wrap, currentClass);
    else renderClassCards(wrap, query);
  }

  function renderClassCards(wrap, query) {
    const students = visibleStudents();
    const studentClassIds = new Set(students.map((student) => student.classId));
    const visibleClasses = Storage.all("classes").filter((classItem) => studentClassIds.has(classItem.id) && classItem.name.toLowerCase().includes(query)).sort((a, b) => Utils.compareFrenchNames(a.name, b.name));
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
          const status = paymentStatus(record, { total, paid, remaining });
          return `<tr><td>${index + 1}</td><td>${Utils.escapeHtml(student.matricule || "-")}</td><td>${Utils.escapeHtml(`${student.firstName} ${student.lastName}`)}</td><td>${Utils.formatMoney(total)}</td><td>${Utils.formatMoney(paid)}</td><td>${Utils.formatMoney(remaining)}</td><td>${status}</td><td class="table-actions"><button type="button" class="btn btn-sm btn-secondary" data-view="${record.id}">👁️ Détails</button>${canEdit && remaining > 0 ? `<button type="button" class="btn btn-sm btn-secondary" data-remind="${record.id}">📩 Relance</button>` : ""}${canEdit ? `<button type="button" class="btn btn-sm btn-danger" data-del="${record.id}">🗑️</button>` : ""}</td></tr>`;
        }).join("")}</tbody>
      </table></div>` : `<div class="empty-state">Aucun élève dans cette classe.</div>`}`;
    wrap.querySelector("#btnBackToPaymentClasses").addEventListener("click", () => { selectedClassId = ""; renderView(); });
    wrap.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => viewRecord(button.dataset.view)));
    wrap.querySelectorAll("[data-remind]").forEach((button) => button.addEventListener("click", () => sendReminder(button.dataset.remind)));
    wrap.querySelectorAll("[data-create-payment]").forEach((button) => button.addEventListener("click", () => {
      const student = Storage.get("students", button.dataset.createPayment);
      const record = createPaymentRecord(student.id, classItem.year || Storage.db().settings.currentYear);
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
    if (!r) return;
    const s = Storage.get("students", r.studentId);
    if (!s) return;
    const { remaining } = computeTotals(r);
    Storage.insert("messages", {
      studentId: s.id,
      paymentId: r.id,
      type: "payment-reminder",
      title: "Relance de paiement",
      body: `Un solde de ${Utils.formatMoney(remaining)} reste à régler pour les frais scolaires${r.year ? ` de l'année ${r.year}` : ""}.`,
      createdAt: new Date().toISOString(),
    });
    Utils.toast(`Relance enregistrée dans les messages du portail parent de ${s.parent?.name || "la famille"}.`, "success");
  }

  function openStudentPicker() {
    const students = [...Storage.all("students")].sort(Utils.comparePeople);
    const withoutRecord = students.filter((s) => !Storage.all("payments").find((r) => r.studentId === s.id));
    Utils.openModal({
      title: "Ouvrir un dossier de paiement",
      bodyHtml: `
        <div class="field"><label>Élève *</label>
          <select id="pickStudent" required>${(withoutRecord.length ? withoutRecord : students).map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)} (${Utils.escapeHtml(s.matricule)})</option>`).join("") || '<option value="">Aucun élève</option>'}</select>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="createRecord">Ouvrir</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#createRecord").addEventListener("click", () => {
          const studentId = overlay.querySelector("#pickStudent").value;
          if (!studentId) return;
          let record = Storage.all("payments").find((r) => r.studentId === studentId);
          if (!record) {
            record = createPaymentRecord(studentId, Storage.db().settings.currentYear);
          }
          Utils.closeModal();
          viewRecord(record.id);
        });
      },
    });
  }

  function viewRecord(id) {
    const record = Storage.get("payments", id);
    if (!record) return;
    const scoped = Auth.scopedStudentIds();
    if (scoped && !scoped.includes(record.studentId)) return Utils.toast("Ce dossier de paiement n'est pas associé à votre compte.", "error");
    const s = Storage.get("students", record.studentId);
    if (!s) return;
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
          ${canEdit ? `<button class="btn btn-secondary btn-sm" id="btnSetFees">${requiredFeesConfigured(record) ? "✏️ Modifier les montants" : "+ Configurer les 4 frais obligatoires"}</button>
          <button class="btn btn-sm" id="btnAddTx" ${requiredFeesConfigured(record) ? "" : "disabled"}>+ Enregistrer un paiement</button>` : ""}
          <span class="spacer"></span>
          <button class="btn btn-secondary btn-sm" id="btnPrintInvoice">🖨️ Facture</button>
        </div>
        <h4>Frais</h4>
        <table class="data-table">
          <thead><tr><th>Frais obligatoire</th><th>Montant à verser</th><th>Déjà affecté</th><th>Reste de cette ligne</th><th>État</th></tr></thead>
          <tbody>
            ${REQUIRED_FEES.map((feeType) => {
              const amount = feeAmount(record, feeType);
              const paidForFee = feePaid(record, feeType);
              const feeRemaining = Math.max(0, amount - paidForFee);
              const label = amount <= 0 ? '<span class="badge badge-muted">Montant à définir</span>' : feeRemaining <= 0 ? '<span class="badge badge-success">Soldée</span>' : paidForFee > 0 ? '<span class="badge badge-warning">Partiellement payée</span>' : '<span class="badge badge-danger">À payer</span>';
              return `<tr><td><strong>${Utils.escapeHtml(feeType)}</strong></td><td>${amount > 0 ? Utils.formatMoney(amount) : "À définir"}</td><td>${Utils.formatMoney(paidForFee)}</td><td>${amount > 0 ? Utils.formatMoney(feeRemaining) : "-"}</td><td>${label}</td></tr>`;
            }).join("")}
            ${(record.items || []).filter((item) => !REQUIRED_FEES.includes(item.type)).map((item) => `<tr><td>${Utils.escapeHtml(item.type)} <span class="badge badge-muted">Ancienne ligne</span></td><td>${Utils.formatMoney(item.amount)}</td><td>-</td><td>-</td><td><span class="badge badge-muted">${requiredFeesConfigured(record) ? "Hors plan courant" : "À vérifier"}</span></td></tr>`).join("")}
          </tbody>
        </table>
        ${!requiredFeesConfigured(record) ? '<p class="payment-legacy-note">Renseignez le montant de chacun des quatre frais obligatoires avant d’enregistrer un versement.</p>' : ""}
        ${(record.transactions || []).some((transaction) => !transaction.feeType) ? '<p class="payment-legacy-note">Des versements historiques ne sont pas affectés à une tranche. Ils restent inclus dans le total payé, mais pas dans les soldes individuels des quatre lignes.</p>' : ""}
        <h4>Transactions / Reçus</h4>
        <table class="data-table">
            <thead><tr><th>Date</th><th>Frais concerné</th><th>Montant</th><th>Mode</th><th>Reçu N°</th><th></th></tr></thead>
            <tbody>
              ${(record.transactions || []).map((t, idx) => `<tr><td>${Utils.formatDate(t.date)}</td><td>${Utils.escapeHtml(t.feeType || "Ancien versement non ventilé")}</td><td>${Utils.formatMoney(t.amount)}</td><td>${Utils.escapeHtml(t.mode)}</td><td>${Utils.escapeHtml(t.receiptNo)}</td><td><button class="btn btn-sm btn-secondary" data-receipt="${idx}">🧾</button></td></tr>`).join("") || `<tr><td colspan="6">Aucune transaction</td></tr>`}
          </tbody>
        </table>
      `,
      footerHtml: `<button class="btn btn-secondary" id="closeBtn">Fermer</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#closeBtn").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#btnSetFees")?.addEventListener("click", () => configureRequiredFees(record.id));
        overlay.querySelector("#btnAddTx")?.addEventListener("click", () => addTransaction(record.id));
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

  function configureRequiredFees(recordId) {
    const record = Storage.get("payments", recordId);
    if (!record) return;
    Utils.openModal({
      title: "Montants des frais scolaires obligatoires",
      bodyHtml: `
        <div class="form-grid">
          ${REQUIRED_FEES.map((feeType, index) => `<div class="field full"><label for="feeAmount${index}">${Utils.escapeHtml(feeType)} (FCFA) *</label><input type="number" id="feeAmount${index}" min="0.01" step="any" value="${feeAmount(record, feeType) || ""}" required></div>`).join("")}
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveFees">Enregistrer les quatre montants</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        overlay.querySelector("#saveFees").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Enregistrement des frais…", async () => {
          const amounts = REQUIRED_FEES.map((_, index) => Number(overlay.querySelector(`#feeAmount${index}`).value));
          if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) return Utils.toast("Saisissez un montant positif pour chacun des quatre frais", "error");
          const current = Storage.get("payments", recordId);
          const legacyItems = (current.items || []).filter((item) => !REQUIRED_FEES.includes(item.type));
          const items = [...legacyItems, ...REQUIRED_FEES.map((type, index) => ({ type, amount: amounts[index], required: true }))];
          Storage.update("payments", recordId, { items });
          Utils.closeModal();
          viewRecord(recordId);
          renderView();
        }));
      },
    });
  }

  function addTransaction(recordId) {
    const record = Storage.get("payments", recordId);
    if (!record || !requiredFeesConfigured(record)) return Utils.toast("Configurez d’abord les montants des quatre frais", "error");
    const feeOptions = REQUIRED_FEES.map((feeType) => {
      const remaining = Math.max(0, feeAmount(record, feeType) - feePaid(record, feeType));
      return { feeType, remaining };
    }).filter((entry) => entry.remaining > 0);
    if (!feeOptions.length) return Utils.toast("Les quatre frais sont déjà soldés", "info");
    const initialFee = feeOptions[0];
    Utils.openModal({
      title: "Enregistrer un versement",
      bodyHtml: `
        <div class="form-grid">
          <div class="field full"><label>Frais à régler *</label><select id="fFeeType" required>${feeOptions.map(({ feeType, remaining }) => `<option value="${Utils.escapeHtml(feeType)}" data-remaining="${remaining}">${Utils.escapeHtml(feeType)} — reste ${Utils.formatMoney(remaining)}</option>`).join("")}</select></div>
          <div class="field"><label>Montant (FCFA) *</label><input type="number" id="fAmount" min="0.01" max="${initialFee.remaining}" step="any" value="${initialFee.remaining}" required></div>
          <div class="field"><label>Mode de paiement</label>
            <select id="fMode" required><option>Espèces</option><option>Mobile Money</option><option>Virement</option><option>Chèque</option></select>
          </div>
          <div class="field"><label>Date *</label><input type="date" id="fDate" value="${Utils.today()}" required></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" id="cancelForm">Annuler</button><button class="btn" id="saveTx">Enregistrer le versement</button>`,
      onMount: (overlay) => {
        overlay.querySelector("#cancelForm").addEventListener("click", Utils.closeModal);
        const feeSelect = overlay.querySelector("#fFeeType");
        const amountInput = overlay.querySelector("#fAmount");
        feeSelect.addEventListener("change", () => {
          const selected = feeSelect.selectedOptions[0];
          const remaining = Number(selected.dataset.remaining);
          amountInput.max = String(remaining);
          amountInput.value = String(remaining);
        });
        overlay.querySelector("#saveTx").addEventListener("click", (event) => Utils.withButtonLoading(event.currentTarget, "Enregistrement du versement…", async () => {
          const amount = Number(overlay.querySelector("#fAmount").value);
          const feeType = feeSelect.value;
          const latestRecord = Storage.get("payments", recordId);
          const feeRemaining = Math.max(0, feeAmount(latestRecord, feeType) - feePaid(latestRecord, feeType));
          if (!Number.isFinite(amount) || amount <= 0) return Utils.toast("Montant invalide", "error");
          if (amount > feeRemaining) return Utils.toast("Le versement dépasse le reste de ce frais", "error");
          const receiptNo = "REC-" + Utils.pad((record.transactions || []).length + 1, 4);
          const transactions = [...(latestRecord.transactions || []), { id: Utils.uid(), date: overlay.querySelector("#fDate").value, amount, mode: overlay.querySelector("#fMode").value, receiptNo, feeType }];
          Storage.update("payments", recordId, { transactions });
          Utils.toast("Paiement enregistré", "success");
          Utils.closeModal();
          viewRecord(recordId);
          renderView();
        }));
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
        { text: "Frais concerné : " + (tx.feeType || "Ancien versement non ventilé"), margin: [0, 0, 0, 6] },
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
          ...(record.items || []).filter((item) => !(item.legacy && requiredFeesConfigured(record))).map((it) => [it.type, { text: Utils.formatMoney(it.amount), alignment: "right" }]),
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
