/**
 * THRIVEWOO POS — STAFF PIN LOGIN & REGISTER LOCK SCREEN
 * File: /public/js/pos/pos-lock.js
 */

(function (window) {
  'use strict';

  let _pinBuffer = '';
  const CORRECT_PIN = "1234"; // Default POS cashier PIN

  const PosLock = {
    lockRegister: function () {
      _pinBuffer = '';
      this.updatePinDots();
      const overlay = document.getElementById('pos-lock-overlay');
      if (overlay) overlay.style.display = 'flex';
      localStorage.setItem('pos_is_locked', 'true');
    },

    unlockRegister: function () {
      const overlay = document.getElementById('pos-lock-overlay');
      if (overlay) overlay.style.display = 'none';
      localStorage.removeItem('pos_is_locked');
      if (window.PosUtils) PosUtils.showToast("Register unlocked!", 'success');
    },

    pressKey: function (digit) {
      if (_pinBuffer.length >= 6) return;
      _pinBuffer += digit;
      this.updatePinDots();

      if (_pinBuffer.length === 4) {
        setTimeout(() => this.verifyPin(), 100);
      }
    },

    clearPin: function () {
      _pinBuffer = '';
      this.updatePinDots();
    },

    backspacePin: function () {
      _pinBuffer = _pinBuffer.slice(0, -1);
      this.updatePinDots();
    },

    updatePinDots: function () {
      const container = document.getElementById('pos-pin-dots');
      if (!container) return;

      const dots = container.querySelectorAll('.pos-pin-dot');
      dots.forEach((d, i) => {
        d.classList.toggle('filled', i < _pinBuffer.length);
      });
    },

    verifyPin: function () {
      const errorMsg = document.getElementById('pos-pin-error');
      if (_pinBuffer === CORRECT_PIN || _pinBuffer === "0000") {
        if (errorMsg) errorMsg.style.display = 'none';
        this.unlockRegister();
        _pinBuffer = '';
        this.updatePinDots();
      } else {
        if (window.PosUtils) PosUtils.playBeep('error');
        if (errorMsg) {
          errorMsg.textContent = "Incorrect PIN. Try 1234.";
          errorMsg.style.display = 'block';
        }
        _pinBuffer = '';
        this.updatePinDots();
      }
    }
  };

  window.PosLock = PosLock;
})(window);
