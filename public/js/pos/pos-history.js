/**
 * THRIVEWOO POS — TRANSACTION HISTORY & REPRINT CONTROLLER
 * File: /public/js/pos/pos-history.js
 */

(function (window) {
  'use strict';

  let _allSales = [];

  const PosHistory = {
    init: async function () {
      await this.loadSales();
    },

    loadSales: async function (filters = {}) {
      const tbody = document.getElementById('pos-history-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">Loading transactions...</td></tr>';

      const res = await PosAPI.getSales(filters);
      if (!res || !res.status || !Array.isArray(res.data) || res.data.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No sales records found.</td></tr>';
        return;
      }

      _allSales = res.data;
      this.renderTable(_allSales);
    },

    renderTable: function (sales) {
      const tbody = document.getElementById('pos-history-tbody');
      if (!tbody) return;

      tbody.innerHTML = sales.map((s, i) => {
        const isVoided = (s.status === 'voided');
        return `
          <tr class="${isVoided ? 'table-danger text-muted text-decoration-line-through' : ''}">
            <td class="fw-bold">${i + 1}</td>
            <td><strong>${s.invoice_no}</strong></td>
            <td>${PosUtils.formatDate(s.created_at)}</td>
            <td>${s.customer_name || 'Walk-in'}</td>
            <td><span class="badge bg-light text-dark border">${s.payment_method || 'Cash'}</span></td>
            <td>${s.items ? s.items.length : 0} items</td>
            <td class="fw-bold ${isVoided ? 'text-danger' : 'text-primary'}">${PosUtils.formatCurrency(s.grand_total)}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-primary me-1" onclick="PosHistory.reprint('${s.invoice_no}')" title="Reprint Receipt">
                <i class="bi bi-printer me-1"></i>Receipt
              </button>
              ${!isVoided ? `
              <button class="btn btn-sm btn-outline-danger" onclick="PosHistory.voidSale('${s.invoice_no}')" title="Void Transaction">
                <i class="bi bi-x-circle"></i>
              </button>` : '<span class="badge bg-danger">Voided</span>'}
            </td>
          </tr>
        `;
      }).join('');
    },

    reprint: async function (invoiceNo) {
      const sale = _allSales.find(s => s.invoice_no === invoiceNo);
      if (!sale) return;

      if (window.PosReceipt) {
        PosReceipt.renderAndOpenReceipt(sale);
      }
    },

    voidSale: async function (invoiceNo) {
      const reason = prompt(`Enter reason to VOID receipt ${invoiceNo}:`, "Customer return");
      if (!reason) return;

      const res = await fetch(`/api/pos/sales/${encodeURIComponent(invoiceNo)}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.status) {
        if (window.PosUtils) PosUtils.showToast("Transaction voided and stock restored!", 'warning');
        this.loadSales();
      } else {
        alert(data.message || "Void failed");
      }
    }
  };

  window.PosHistory = PosHistory;
})(window);
