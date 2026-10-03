/**
 * THRIVEWOO POS — CORE UTILITY & AUDIO ENGINE
 * File: /public/js/pos/pos-utils.js
 */

(function (window) {
  'use strict';

  const audioCtx = (typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined')
    ? new (window.AudioContext || window.webkitAudioContext)()
    : null;

  const PosUtils = {
    // 1. Currency Formatter
    formatCurrency: function (num, symbol = '$') {
      const val = parseFloat(num) || 0;
      return `${symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    // 2. Date Formatter
    formatDate: function (isoString) {
      if (!isoString) return '';
      const d = new Date(isoString);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },

    // 3. Web Audio Scanner Beep Feedback
    playBeep: function (type = 'success') {
      if (!audioCtx) return;
      try {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'success') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, audioCtx.currentTime); // High pitch crisp chime
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.08);
        } else if (type === 'error') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(320, audioCtx.currentTime); // Low warning buzz
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.25);
        }
      } catch (_) {}
    },

    // 4. Toast Notifications
    showToast: function (message, type = 'info') {
      let toastContainer = document.getElementById('pos-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'pos-toast-container';
        toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(toastContainer);
      }

      const toast = document.createElement('div');
      const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#4f46e5'
      };

      toast.style.cssText = `background:${colors[type] || '#1e293b'};color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 16px rgba(0,0,0,0.15);transition:all 0.2s ease;opacity:0;transform:translateY(10px);pointer-events:auto;`;
      toast.textContent = message;

      toastContainer.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      }, 10);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 250);
      }, 3000);
    },

    // 5. Online/Offline Monitor
    initNetworkMonitor: function () {
      const updateOnlineStatus = () => {
        const dot = document.getElementById('pos-network-status-dot');
        const text = document.getElementById('pos-network-status-text');
        const isOnline = navigator.onLine;

        if (dot) {
          dot.className = isOnline ? 'pos-online-dot' : 'pos-online-dot offline';
        }
        if (text) {
          text.textContent = isOnline ? 'Live Cloud' : 'Offline Mode';
        }

        if (isOnline) {
          PosUtils.showToast('Online — POS synced with cloud', 'success');
        } else {
          PosUtils.showToast('Offline — Transactions will queue locally', 'warning');
        }
      };

      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      updateOnlineStatus();
    },

    // 6. User Session Loader (Inject registered store owner name & store name across headers)
    initUserSession: async function () {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.status && data.authenticated && data.user) {
          const user = data.user;
          window.currentUser = user;

          // 1. Update Staff/User Name elements
          const nameEls = document.querySelectorAll('.pos-user-name, #pos-header-staff-name, .pos-header .dropdown-toggle span');
          nameEls.forEach(el => {
            el.textContent = user.name || 'Store Owner';
          });

          // 2. Update Store Name in Header
          const storeEls = document.querySelectorAll('.pos-store-name, #pos-header-store-name');
          storeEls.forEach(el => {
            if (user.store_name) {
              el.textContent = user.store_name;
            }
          });

          // 3. Update Brand Subtitle if desired
          const brandSub = document.querySelector('.pos-brand-sub');
          if (brandSub && user.store_name) {
            brandSub.textContent = `${user.store_name} • POS Counter`;
          }

          // 4. Update Cashier Inputs
          const cashierInput = document.getElementById('pos-open-cashier-input');
          if (cashierInput) {
            cashierInput.value = user.name || 'Store Cashier';
          }
        }
      } catch (err) {
        console.warn('[PosUtils] Session fetch error:', err);
      }
    }
  };

  // Auto-init session on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PosUtils.initUserSession());
  } else {
    PosUtils.initUserSession();
  }

  window.PosUtils = PosUtils;
})(window);
