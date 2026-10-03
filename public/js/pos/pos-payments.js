/**
 * THRIVEWOO POS — PAYMENT & CHECKOUT CONTROLLER
 * File: /public/js/pos/pos-payments.js
 */

(function (window) {
  'use strict';

  let _activeMethod = 'Cash';
  let _payableTotal = 0;

  const PosPayments = {
    openCheckoutModal: function () {
      const cartState = PosBilling.getCartState();
      if (!cartState.items || cartState.items.length === 0) {
        alert("Cart is empty! Add products before opening checkout.");
        return;
      }

      // Compute exact payable total
      let subtotal = cartState.items.reduce((s, it) => s + (it.price * it.qty), 0);
      let disc = cartState.manualDiscount || 0;
      if (cartState.promo && cartState.promo.discount_amount) disc += cartState.promo.discount_amount;
      _payableTotal = Math.max(0, subtotal - disc);

      const modalEl = document.getElementById('posPaymentModal');
      const totalDisplay = document.getElementById('pos-modal-payable-total');
      const cashReceivedInput = document.getElementById('pos-cash-received-input');

      if (totalDisplay) totalDisplay.textContent = PosUtils.formatCurrency(_payableTotal);
      if (cashReceivedInput) {
        cashReceivedInput.value = _payableTotal.toFixed(2);
        this.calculateChange();
      }

      this.selectMethod('Cash');

      if (typeof bootstrap !== 'undefined' && modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    },

    selectMethod: function (method) {
      _activeMethod = method;
      document.querySelectorAll('.pos-method-tab').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-method') === method);
      });

      // Toggle views
      const cashView = document.getElementById('pos-payment-view-cash');
      const cardView = document.getElementById('pos-payment-view-card');
      const upiView = document.getElementById('pos-payment-view-upi');
      const pineView = document.getElementById('pos-payment-view-pinelabs');

      if (cashView) cashView.style.display = (method === 'Cash') ? 'block' : 'none';
      if (cardView) cardView.style.display = (method === 'Card') ? 'block' : 'none';
      if (upiView) upiView.style.display = (method === 'UPI') ? 'block' : 'none';
      if (pineView) pineView.style.display = (method === 'Pine Labs') ? 'block' : 'none';

      if (method === 'UPI') {
        this.generateUpiQr();
      } else if (method === 'Pine Labs') {
        this.initiatePineLabs();
      }
    },

    setQuickCash: function (amount) {
      const input = document.getElementById('pos-cash-received-input');
      if (input) {
        if (amount === 'exact') {
          input.value = _payableTotal.toFixed(2);
        } else {
          input.value = parseFloat(amount).toFixed(2);
        }
        this.calculateChange();
      }
    },

    calculateChange: function () {
      const input = document.getElementById('pos-cash-received-input');
      const changeEl = document.getElementById('pos-change-amount');
      const alertEl = document.getElementById('pos-cash-insufficient-alert');
      const confirmBtn = document.getElementById('pos-confirm-payment-btn');

      const received = parseFloat(input?.value || 0);
      const diff = received - _payableTotal;

      if (diff >= 0) {
        if (changeEl) changeEl.textContent = PosUtils.formatCurrency(diff);
        if (alertEl) alertEl.style.display = 'none';
        if (confirmBtn) confirmBtn.disabled = false;
      } else {
        if (changeEl) changeEl.textContent = PosUtils.formatCurrency(0);
        if (alertEl) {
          alertEl.style.display = 'block';
          alertEl.textContent = `Insufficient cash. Need ${PosUtils.formatCurrency(Math.abs(diff))} more.`;
        }
        if (confirmBtn) confirmBtn.disabled = true;
      }
    },

    generateUpiQr: async function () {
      const qrImg = document.getElementById('pos-upi-qr-image');
      if (qrImg) qrImg.src = '/img/default-product.png';

      try {
        const res = await fetch('/api/pos/terminal/upi-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: _payableTotal })
        });
        const data = await res.json();
        if (data.status && data.data.qrDataUrl && qrImg) {
          qrImg.src = data.data.qrDataUrl;
        }
      } catch (_) {}
    },

    initiatePineLabs: async function () {
      const statusEl = document.getElementById('pos-pinelabs-status-text');
      if (statusEl) statusEl.textContent = "Connecting to Pine Labs Terminal...";
      try {
        const res = await fetch('/api/pos/terminal/pinelabs-initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: _payableTotal })
        });
        const data = await res.json();
        if (data.status && statusEl) {
          statusEl.textContent = "Swipe or tap customer card on terminal...";
        }
      } catch (_) {}
    },

    finalizePayment: async function () {
      const confirmBtn = document.getElementById('pos-confirm-payment-btn');
      if (confirmBtn) confirmBtn.disabled = true;

      const cartState = PosBilling.getCartState();
      const cashReceivedInput = document.getElementById('pos-cash-received-input');
      const amountPaid = (_activeMethod === 'Cash')
        ? parseFloat(cashReceivedInput?.value || _payableTotal)
        : _payableTotal;

      const payload = {
        items: cartState.items,
        customer: cartState.customer,
        payment_method: _activeMethod,
        amount_paid: amountPaid,
        discount_code: cartState.promo ? cartState.promo.code : null,
        discount_val: cartState.manualDiscount || (cartState.promo ? cartState.promo.discount_amount : 0)
      };

      const res = await PosAPI.checkoutSale(payload);

      if (confirmBtn) confirmBtn.disabled = false;

      if (res && res.status && res.data) {
        // Hide payment modal
        const modalEl = document.getElementById('posPaymentModal');
        if (typeof bootstrap !== 'undefined' && modalEl) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        if (window.PosUtils) {
          PosUtils.playBeep('success');
          PosUtils.showToast("Bill completed!", 'success');
        }

        // Open Receipt Dialog
        if (window.PosReceipt) {
          PosReceipt.renderAndOpenReceipt(res.data);
        }

        // Clear active cart ticket
        PosBilling.clearCart(false);
      } else {
        alert("Payment completion failed: " + (res.message || "Unknown error"));
      }
    }
  };

  window.PosPayments = PosPayments;
})(window);
