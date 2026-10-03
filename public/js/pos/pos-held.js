/**
 * THRIVEWOO POS — PARKED / HELD SALES CONTROLLER
 * File: /public/js/pos/pos-held.js
 */

(function (window) {
  'use strict';

  const PosHeld = {
    loadHeldList: async function () {
      const tbody = document.getElementById('pos-held-sales-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Loading held sales...</td></tr>';

      const res = await PosAPI.getHeldSales();
      if (!res || !res.status || !Array.isArray(res.data) || res.data.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">No parked sales currently held.</td></tr>';
        return;
      }

      if (tbody) {
        tbody.innerHTML = res.data.map((h, i) => `
          <tr>
            <td class="fw-bold">${i + 1}</td>
            <td><span class="badge bg-warning-subtle text-warning border">${h.hold_id}</span></td>
            <td><strong>${h.customer ? h.customer.name : 'Walk-in'}</strong></td>
            <td>${h.note || 'Parked Sale'}</td>
            <td>${h.item_count} items</td>
            <td class="fw-bold text-primary">${PosUtils.formatCurrency(h.subtotal)}</td>
            <td class="text-muted small">${PosUtils.formatDate(h.held_at)}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-primary me-1" onclick="PosHeld.resume('${h.hold_id}')">
                <i class="bi bi-arrow-clockwise me-1"></i>Resume
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="PosHeld.discard('${h.hold_id}')">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        `).join('');
      }
    },

    resume: async function (holdId) {
      if (window.PosBilling) {
        const cartState = PosBilling.getCartState();
        if (cartState.items.length > 0) {
          if (!confirm("Your current active sale will be replaced by the resumed sale. Proceed?")) {
            return;
          }
        }
      }

      const res = await PosAPI.resumeHeldSale(holdId);
      if (res && res.status && res.data) {
        const heldData = res.data;
        if (window.PosBilling) {
          PosBilling.clearCart(false);
          heldData.items.forEach(it => PosBilling.addToCart(it, 0)); // Resets items
          heldData.items.forEach(it => {
            // direct restore
          });
          // direct state update
          if (heldData.customer) PosBilling.setCustomer(heldData.customer);
          heldData.items.forEach(it => PosBilling.addToCart(it, it.qty));
          PosBilling.updateHeldCounter();
        }

        // Close modal if open
        const modalEl = document.getElementById('posHeldModal');
        if (typeof bootstrap !== 'undefined' && modalEl) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        if (window.PosUtils) PosUtils.showToast("Parked sale resumed to cart", 'success');
        if (window.location.pathname.includes('/held')) {
          this.loadHeldList();
        }
      }
    },

    discard: async function (holdId) {
      if (!confirm(`Discard parked sale ${holdId}?`)) return;

      const res = await PosAPI.discardHeldSale(holdId);
      if (res && res.status) {
        if (window.PosUtils) PosUtils.showToast("Parked sale discarded", 'info');
        if (window.PosBilling) PosBilling.updateHeldCounter();
        this.loadHeldList();
      }
    }
  };

  window.PosHeld = PosHeld;
})(window);
