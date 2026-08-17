/**
 * Module Paiements & Frais scolaires : inscription, scolarité, examen, cantine,
 * transport, uniformes, autres frais ; paiements partiels/complets, reçus, relances.
 */
const Payments = (() => {
  const FEE_TYPES = ["Inscription", "Scolarité", "Frais d'examen", "Cantine", "Transport", "Uniformes", "Autre"];

  function render(container) {
    const canEdit = Permissions.canEdit("payments");
    container.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <input type="text" id="paySearch" placeholder="🔍 Rechercher un élève...">
          <span class="spacer"></span>
          ${canEdit ? `<button class="btn" id="btnAddPayment">+ Dossier de paiement</button>` : ""}
        </div>
        <div class="table-wrap" id="paymentsTableWrap"></div>
      </div>
    `;
    container.querySelector("#btnAddPayment")?.addEventListener("click", () => openStudentPicker());
    container.querySelector("#paySearch").addEventListener("input", (e) => renderTable(e.target.value));
    renderTable("");
  }

  function computeTotals(record) {
    const total = (record.items || []).reduce((a, i) => a + Number(i.amount), 0);
    const paid = (record.transactions || []).reduce((a, t) => a + Number(t.amount), 0);
    return { total, paid, remaining: total - paid };
  }

  function renderTable(q = "") {
    const wrap = document.getElementById("paymentsTableWrap");
    if (!wrap) return;
    q = q.trim().toLowerCase();
    const canEdit = Permissions.canEdit("payments");
    const scoped = Auth.scopedStudentIds();
    const students = Storage.all("students");
    const records = Storage.all("payments").filter((r) => {
      if (scoped && !scoped.includes(r.studentId)) return false;
      const s = students.find((x) => x.id === r.studentId);
      return !q || (s && `${s.firstName} ${s.lastName} ${s.matricule}`.toLowerCase().includes(q));
    });
    if (records.length === 0) {
      wrap.innerHTML = `<div class="empty-state">Aucun dossier de paiement.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Élève</th><th>Total dû</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${records
            .map((r) => {
              const s = students.find((x) => x.id === r.studentId);
              const { total, paid, remaining } = computeTotals(r);
              const status = remaining <= 0 ? '<span class="badge badge-success">Soldé</span>' : paid > 0 ? '<span class="badge badge-warning">Partiel</span>' : '<span class="badge badge-danger">Impayé</span>';
              return `
              <tr>
                <td>${s ? Utils.escapeHtml(s.firstName + " " + s.lastName) : "-"}</td>
                <td>${Utils.formatMoney(total)}</td>
                <td>${Utils.formatMoney(paid)}</td>
                <td>${Utils.formatMoney(remaining)}</td>
                <td>${status}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-secondary" data-view="${r.id}">👁️ Détails</button>
                  ${canEdit && remaining > 0 ? `<button class="btn btn-sm btn-secondary" data-remind="${r.id}">📩 Relance</button>` : ""}
                  ${canEdit ? `<button class="btn btn-sm btn-danger" data-del="${r.id}">🗑️</button>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewRecord(b.dataset.view)));
    wrap.querySelectorAll("[data-remind]").forEach((b) => b.addEventListener("click", () => sendReminder(b.dataset.remind)));
    wrap.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        Utils.confirmDialog("Supprimer ce dossier de paiement ?", () => {
          Storage.remove("payments", b.dataset.del);
          Utils.toast("Dossier supprimé", "success");
          renderTable();
        });
      })
    );
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
        <div class="field"><label>Élève</label>
          <select id="pickStudent">${(withoutRecord.length ? withoutRecord : students).map((s) => `<option value="${s.id}">${Utils.escapeHtml(s.firstName + " " + s.lastName)} (${Utils.escapeHtml(s.matricule)})</option>`).join("") || "<option>Aucun élève</option>"}</select>
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
          <thead><tr><th>Date</th><th>Montant</th><th>Mode</th><th>Reçu N°</th><th></th></tr></thead>
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
            renderTable();
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
          <div class="field"><label>Type de frais</label><select id="fType">${FEE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></div>
          <div class="field"><label>Montant (FCFA)</label><input type="number" id="fAmount" min="0"></div>
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
          renderTable();
        });
      },
    });
  }

  function addTransaction(recordId, remaining) {
    Utils.openModal({
      title: "Enregistrer un paiement",
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Montant (FCFA)</label><input type="number" id="fAmount" value="${remaining > 0 ? remaining : ""}"></div>
          <div class="field"><label>Mode de paiement</label>
            <select id="fMode"><option>Espèces</option><option>Mobile Money</option><option>Virement</option><option>Chèque</option></select>
          </div>
          <div class="field"><label>Date</label><input type="date" id="fDate" value="${Utils.today()}"></div>
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
          renderTable();
        });
      },
    });
  }

  function printReceipt(recordId, txIdx) {
    const record = Storage.get("payments", recordId);
    const s = Storage.get("students", record.studentId);
    const tx = record.transactions[txIdx];
    const settings = Storage.db().settings;
    const html = `
      <div class="bulletin">
        <h2>${Utils.escapeHtml(settings.schoolName)}</h2>
        <h3>Reçu de paiement N° ${Utils.escapeHtml(tx.receiptNo)}</h3>
        <p>Élève : <strong>${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</strong> (${Utils.escapeHtml(s.matricule)})</p>
        <p>Date : ${Utils.formatDate(tx.date)}</p>
        <p>Mode de paiement : ${Utils.escapeHtml(tx.mode)}</p>
        <h2>Montant : ${Utils.formatMoney(tx.amount)}</h2>
        <div class="signature-row"><div>Signature du caissier</div><div>Cachet de l'établissement</div></div>
      </div>
    `;
    Utils.printElement(html, "Reçu de paiement");
  }

  function printInvoice(recordId) {
    const record = Storage.get("payments", recordId);
    const s = Storage.get("students", record.studentId);
    const { total, paid, remaining } = computeTotals(record);
    const settings = Storage.db().settings;
    const html = `
      <div class="bulletin">
        <h2>${Utils.escapeHtml(settings.schoolName)}</h2>
        <h3>Facture — ${Utils.escapeHtml(s.firstName)} ${Utils.escapeHtml(s.lastName)}</h3>
        <table><thead><tr><th>Frais</th><th>Montant</th></tr></thead>
          <tbody>${(record.items || []).map((it) => `<tr><td>${Utils.escapeHtml(it.type)}</td><td>${Utils.formatMoney(it.amount)}</td></tr>`).join("")}</tbody>
        </table>
        <hr class="sep">
        <p><strong>Total dû :</strong> ${Utils.formatMoney(total)}</p>
        <p><strong>Déjà payé :</strong> ${Utils.formatMoney(paid)}</p>
        <p><strong>Reste à payer :</strong> ${Utils.formatMoney(remaining)}</p>
      </div>
    `;
    Utils.printElement(html, "Facture");
  }

  return { render, computeTotals };
})();
