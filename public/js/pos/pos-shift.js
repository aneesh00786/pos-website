/**
 * THRIVEWOO POS — SHIFT & CASH DRAWER CONTROLLER
 * File: /public/js/pos/pos-shift.js
 */

(function (window) {
  'use strict';

  const PosShift = {
    init: async function () {
      await this.loadActiveShift();
      await this.loadShiftHistory();
    },

    loadActiveShift: async function () {
      const res = await PosAPI.getCurrentShift();
      const statusBadge = document.getElementById('pos-shift-status-badge');
      const cashierDisplay = document.getElementById('pos-shift-cashier');
      const floatDisplay = document.getElementById('pos-shift-float');
      const salesDisplay = document.getElementById('pos-shift-cash-sales');
      const expectedDisplay = document.getElementById('pos-shift-expected-cash');
      const closeBtn = document.getElementById('pos-close-shift-btn');
      const openBtn = document.getElementById('pos-open-shift-btn');

      if (res && res.status && res.hasActiveShift && res.shift) {
        const s = res.shift;
        if (statusBadge) statusBadge.innerHTML = '<span class="badge bg-success-subtle text-success border border-success">SHIFT ACTIVE (OPEN)</span>';
        if (cashierDisplay) cashierDisplay.textContent = s.cashier_name;
        if (floatDisplay) floatDisplay.textContent = PosUtils.formatCurrency(s.opening_float);
        if (salesDisplay) salesDisplay.textContent = PosUtils.formatCurrency(s.summary.cash_sales);
        if (expectedDisplay) expectedDisplay.textContent = PosUtils.formatCurrency(s.expected_cash_drawer);
        if (closeBtn) closeBtn.style.display = 'inline-block';
        if (openBtn) openBtn.style.display = 'none';
      } else {
        if (statusBadge) statusBadge.innerHTML = '<span class="badge bg-warning-subtle text-warning border border-warning">REGISTER CLOSED (NO ACTIVE SHIFT)</span>';
        if (cashierDisplay) cashierDisplay.textContent = 'None';
        if (floatDisplay) floatDisplay.textContent = PosUtils.formatCurrency(0);
        if (salesDisplay) salesDisplay.textContent = PosUtils.formatCurrency(0);
        if (expectedDisplay) expectedDisplay.textContent = PosUtils.formatCurrency(0);
        if (closeBtn) closeBtn.style.display = 'none';
        if (openBtn) openBtn.style.display = 'inline-block';
      }
    },

    openShiftModal: function () {
      const modalEl = document.getElementById('posOpenShiftModal');
      if (typeof bootstrap !== 'undefined' && modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    },

    submitOpenShift: async function () {
      const floatInput = document.getElementById('pos-open-float-input');
      const cashierInput = document.getElementById('pos-open-cashier-input');

      const floatAmt = parseFloat(floatInput?.value || 0);
      const cashier = cashierInput?.value || window.currentUser?.name || "Store Cashier";

      const res = await PosAPI.openShift({
        opening_float: floatAmt,
        cashier_name: cashier
      });

      if (res && res.status) {
        const modalEl = document.getElementById('posOpenShiftModal');
        if (typeof bootstrap !== 'undefined' && modalEl) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }
        PosUtils.showToast("Register shift opened!", 'success');
        this.loadActiveShift();
      } else {
        alert(res.message || "Failed to open shift");
      }
    },

    closeShiftModal: function () {
      const modalEl = document.getElementById('posCloseShiftModal');
      if (typeof bootstrap !== 'undefined' && modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    },

    submitCloseShift: async function () {
      const countedInput = document.getElementById('pos-counted-cash-input');
      const notesInput = document.getElementById('pos-close-shift-notes');

      const counted = parseFloat(countedInput?.value || 0);
      const notes = notesInput?.value || '';

      const res = await PosAPI.closeShift({
        actual_cash_counted: counted,
        notes: notes
      });

      if (res && res.status) {
        const modalEl = document.getElementById('posCloseShiftModal');
        if (typeof bootstrap !== 'undefined' && modalEl) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        PosUtils.showToast("Shift closed! Z-Report ready", 'success');
        this.loadActiveShift();
        this.loadShiftHistory();
      } else {
        alert(res.message || "Failed to close shift");
      }
    },

    loadShiftHistory: async function () {
      const res = await fetch('/api/pos/shifts/history');
      const json = await res.json();
      const tbody = document.getElementById('pos-shifts-history-tbody');
      if (!tbody) return;

      if (!json || !json.status || !Array.isArray(json.data) || json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No closed shifts recorded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = json.data.map(s => {
        const isOver = s.cash_variance > 0;
        const isShort = s.cash_variance < 0;
        let varBadge = '<span class="badge bg-success">Exact ($0.00)</span>';
        if (isOver) varBadge = `<span class="badge bg-primary">Overage (+${PosUtils.formatCurrency(s.cash_variance)})</span>`;
        if (isShort) varBadge = `<span class="badge bg-danger">Shortage (${PosUtils.formatCurrency(s.cash_variance)})</span>`;

        return `
          <tr>
            <td class="fw-bold">${s.id}</td>
            <td>${s.cashier_name}</td>
            <td>${PosUtils.formatDate(s.opened_at)}</td>
            <td>${PosUtils.formatDate(s.closed_at)}</td>
            <td>${PosUtils.formatCurrency(s.summary.total_sales)} (${s.summary.transaction_count} txns)</td>
            <td>${PosUtils.formatCurrency(s.actual_cash_counted)}</td>
            <td>${varBadge}</td>
          </tr>
        `;
      }).join('');
    }
  };

  window.PosShift = PosShift;
})(window);
