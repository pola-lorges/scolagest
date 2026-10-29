/**
 * Fonctions utilitaires partagées : id, dates, modales, toasts, CSV, impression.
 */
const Utils = (() => {
  const loadingTasks = new Map();
  let loadingSequence = 0;
  let loadingTimer = null;

  function updateLoaderMessage() {
    const message = document.getElementById("globalLoaderMessage");
    if (message && loadingTasks.size) message.textContent = [...loadingTasks.values()].at(-1);
  }

  function beginLoading(message = "Chargement…") {
    const id = ++loadingSequence;
    loadingTasks.set(id, message);
    updateLoaderMessage();
    if (loadingTasks.size === 1) {
      loadingTimer = setTimeout(() => {
        const loader = document.getElementById("globalLoader");
        if (loader && loadingTasks.size) {
          loader.classList.add("is-visible");
          loader.setAttribute("aria-hidden", "false");
        }
      }, 160);
    }
    return id;
  }

  function endLoading(id) {
    loadingTasks.delete(id);
    if (loadingTasks.size) {
      updateLoaderMessage();
      return;
    }
    clearTimeout(loadingTimer);
    loadingTimer = null;
    const loader = document.getElementById("globalLoader");
    if (loader) {
      loader.classList.remove("is-visible");
      loader.setAttribute("aria-hidden", "true");
    }
  }

  async function withLoading(message, operation) {
    const id = beginLoading(message);
    try {
      return await operation();
    } finally {
      endLoading(id);
    }
  }

  async function withButtonLoading(button, message, operation) {
    if (!button || button.disabled) return;
    const originalText = button.innerHTML;
    const originalLabel = button.getAttribute("aria-label");
    const loadingId = beginLoading(message);
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
    try {
      return await operation();
    } finally {
      button.innerHTML = originalText;
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      if (originalLabel === null) button.removeAttribute("aria-label");
      else button.setAttribute("aria-label", originalLabel);
      endLoading(loadingId);
    }
  }

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pad(n, len) {
    return String(n).padStart(len, "0");
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function formatDate(d) {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  function formatMoney(n) {
    n = Number(n) || 0;
    // Les espaces ins\u00e9cables de fr-FR (U+202F/U+00A0) ne sont pas rendus par la police Roboto de pdfmake
    return n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ") + " FCFA";
  }
  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function compareFrenchNames(first, second) {
    return String(first || "").localeCompare(String(second || ""), "fr", { sensitivity: "base", numeric: true });
  }

  function comparePeople(first, second) {
    return compareFrenchNames(`${first?.lastName || ""} ${first?.firstName || ""}`, `${second?.lastName || ""} ${second?.firstName || ""}`);
  }

  // ---------- Toast ----------
  function toast(message, type = "info") {
    const root = document.getElementById("toastRoot");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function validateRequired(root) {
    const requiredFields = [...root.querySelectorAll("input[required], select[required], textarea[required]")];
    const invalidField = requiredFields.find((field) => {
      if (field.disabled || field.getClientRects().length === 0) return false;
      return !String(field.value ?? "").trim() || !field.checkValidity();
    });
    if (!invalidField) return true;
    invalidField.reportValidity();
    invalidField.focus();
    toast("Veuillez remplir correctement tous les champs obligatoires", "error");
    return false;
  }

  // ---------- Modal ----------
  function openModal({ title, bodyHtml, footerHtml, onMount, width }) {
    closeModal();
    const root = document.getElementById("modalRoot");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "activeModalOverlay";
    overlay.innerHTML = `
      <div class="modal" style="${width ? `max-width:${width}` : ""}">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" id="modalCloseBtn">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
      </div>
    `;
    root.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    overlay.addEventListener("click", (e) => {
      const saveButton = e.target.closest(".modal-footer .btn:not(.btn-secondary):not(.btn-danger)");
      if (saveButton && !validateRequired(overlay)) e.stopImmediatePropagation();
    }, true);
    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    if (onMount) onMount(overlay);
    return overlay;
  }

  function closeModal() {
    const el = document.getElementById("activeModalOverlay");
    if (el) el.remove();
  }

  function confirmDialog(message, onConfirm) {
    openModal({
      title: "Confirmation",
      bodyHtml: `<p>${escapeHtml(message)}</p>`,
      footerHtml: `
        <button class="btn btn-secondary" id="cancelConfirm">Annuler</button>
        <button class="btn btn-danger" id="okConfirm">Confirmer</button>
      `,
      onMount: (overlay) => {
        overlay.querySelector("#cancelConfirm").addEventListener("click", closeModal);
        overlay.querySelector("#okConfirm").addEventListener("click", () => {
          closeModal();
          onConfirm();
        });
      },
    });
  }

  // ---------- CSV import/export ----------
  function toCSV(rows, columns) {
    const header = columns.map((c) => c.label).join(",");
    const lines = rows.map((row) =>
      columns
        .map((c) => {
          let v = c.get(row);
          if (v === undefined || v === null) v = "";
          v = String(v).replace(/"/g, '""');
          if (v.includes(",") || v.includes("\n") || v.includes('"')) v = `"${v}"`;
          return v;
        })
        .join(",")
    );
    return [header, ...lines].join("\n");
  }

  function downloadFile(filename, content, mime = "text/csv;charset=utf-8;") {
    const blob = new Blob(["\uFEFF" + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { header: [], rows: [] };
    const parseLine = (line) => {
      const result = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
          if (c === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (c === '"') {
            inQuotes = false;
          } else {
            cur += c;
          }
        } else {
          if (c === '"') inQuotes = true;
          else if (c === ",") {
            result.push(cur);
            cur = "";
          } else cur += c;
        }
      }
      result.push(cur);
      return result;
    };
    const header = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { header, rows };
  }

  function readFileAsText(file) {
    return withLoading("Lecture du fichier…", () => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    }));
  }

  function readFileAsDataURL(file) {
    return withLoading("Lecture du fichier…", () => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }));
  }

  function printElement(html, title = "Impression") {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast("Autorisez les fenêtres contextuelles pour imprimer le bulletin", "error");
      return;
    }
    const stylesheet = new URL("css/style.css", window.location.href).href;
    win.onload = () => {
      win.focus();
      win.print();
    };
    win.document.write(`
      <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="${escapeHtml(stylesheet)}">
        <style>body{padding:24px;} .bulletin{border:none;}</style>
      </head>
      <body>${html}</body>
      </html>
    `);
    win.document.close();
  }

  function downloadPdfMake(definition, filename) {
    if (typeof pdfMake !== "object" || typeof pdfMake.createPdf !== "function") {
      toast("PDFMake n'est pas disponible", "error");
      return Promise.reject(new Error("PDFMake indisponible"));
    }
    const loadingId = beginLoading("Préparation du PDF…");
    return new Promise((resolve, reject) => {
      try {
        pdfMake.createPdf(definition).getBlob((blob) => {
          try {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            endLoading(loadingId);
          }
        });
      } catch (error) {
        endLoading(loadingId);
        reject(error);
      }
    });
  }

  return {
    uid, rand, pad, today, formatDate, formatMoney, escapeHtml, compareFrenchNames, comparePeople, validateRequired,
    toast, openModal, closeModal, confirmDialog, beginLoading, endLoading, withLoading, withButtonLoading,
    toCSV, downloadFile, parseCSV, readFileAsText, readFileAsDataURL, printElement, downloadPdfMake,
  };
})();
