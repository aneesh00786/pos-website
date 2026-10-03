/**
 * THRIVEWOO POS — OPERATIONAL DASHBOARD
 * File: /public/js/pos/pos-dashboard.js
 */

(function (window) {
  'use strict';

  const PosDashboard = {
    init: async function () {
      await this.loadStats();
    },

    loadStats: async function () {
      const res = await PosAPI.getDashboardStats();
      if (!res || !res.status || !res.data) return;

      const d = res.data;
      const today = d.today || {};

      // 1. KPI Cards
      document.getElementById('pos-dash-revenue').textContent = PosUtils.formatCurrency(today.revenue || 0);
      document.getElementById('pos-dash-txns').textContent = today.transactions || 0;
      document.getElementById('pos-dash-avg-ticket').textContent = PosUtils.formatCurrency(today.avgTicket || 0);
      document.getElementById('pos-dash-tax').textContent = PosUtils.formatCurrency(today.tax || 0);

      // 2. Payment Breakdown
      const payments = today.paymentBreakdown || {};
      document.getElementById('pos-dash-cash-vol').textContent = PosUtils.formatCurrency(payments.Cash || 0);
      document.getElementById('pos-dash-card-vol').textContent = PosUtils.formatCurrency(payments.Card || 0);
      document.getElementById('pos-dash-upi-vol').textContent = PosUtils.formatCurrency(payments.UPI || 0);

      // 3. Shift Status
      const shiftCard = document.getElementById('pos-dash-shift-status');
      if (d.currentShift && d.currentShift.status === 'open') {
        const s = d.currentShift;
        shiftCard.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge bg-success-subtle text-success border border-success">SHIFT ACTIVE</span>
            <small class="text-muted">${s.id}</small>
          </div>
          <div class="fw-bold fs-6 mb-1">Cashier: ${s.cashier_name}</div>
          <div class="small text-muted mb-2">Opened: ${PosUtils.formatDate(s.opened_at)}</div>
          <div class="d-flex justify-content-between small text-muted border-top pt-2">
            <span>Float: <strong>${PosUtils.formatCurrency(s.opening_float)}</strong></span>
            <span>Sales: <strong>${PosUtils.formatCurrency(s.summary.total_sales)}</strong></span>
          </div>
        `;
      } else {
        shiftCard.innerHTML = `
          <div class="text-center py-3 text-muted">
            <i class="bi bi-clock-history fs-3 d-block mb-1 text-warning"></i>
            <strong>No active register shift</strong>
            <p class="small mb-2">Open a shift to track drawer cash float</p>
            <a href="/pos/shifts" class="btn btn-sm btn-outline-primary">Open Shift Now</a>
          </div>
        `;
      }

      // 4. Low stock table
      const lowStockTbody = document.getElementById('pos-dash-low-stock-tbody');
      if (lowStockTbody) {
        if (!d.lowStockProducts || d.lowStockProducts.length === 0) {
          lowStockTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">All inventory items sufficiently stocked.</td></tr>';
        } else {
          lowStockTbody.innerHTML = d.lowStockProducts.map(p => `
            <tr>
              <td><strong>${p.name}</strong><br><small class="text-muted">${p.sku}</small></td>
              <td>${p.category}</td>
              <td class="fw-bold ${p.stock_qty <= 0 ? 'text-danger' : 'text-warning'}">${p.stock_qty} left</td>
              <td><a href="/pos/inventory" class="btn btn-sm btn-outline-secondary py-0">Restock</a></td>
            </tr>
          `).join('');
        }
      }

      // 5. Recent Sales
      const recentTbody = document.getElementById('pos-dash-recent-tbody');
      if (recentTbody) {
        if (!d.recentTransactions || d.recentTransactions.length === 0) {
          recentTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No sales processed today yet.</td></tr>';
        } else {
          recentTbody.innerHTML = d.recentTransactions.map(t => `
            <tr>
              <td><strong>${t.invoice_no}</strong></td>
              <td>${t.customer_name}</td>
              <td><span class="badge bg-light text-dark border">${t.payment_method}</span></td>
              <td class="fw-bold text-primary">${PosUtils.formatCurrency(t.grand_total)}</td>
            </tr>
          `).join('');
        }
      }
    }
  };

  window.PosDashboard = PosDashboard;
})(window);
