/**
 * Fonctions utilitaires partagées : id, dates, modales, toasts, CSV, impression.
 */
const Utils = (() => {
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
    return n.toLocaleString("fr-FR") + " FCFA";
  }
  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function printElement(html, title = "Impression") {
    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(`
      <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="css/style.css">
        <style>body{padding:24px;} .bulletin{border:none;}</style>
      </head>
      <body>${html}</body>
      </html>
    `);
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
  }

  return {
    uid, rand, pad, today, formatDate, formatMoney, escapeHtml,
    toast, openModal, closeModal, confirmDialog,
    toCSV, downloadFile, parseCSV, readFileAsText, readFileAsDataURL, printElement,
  };
})();
