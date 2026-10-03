/**
 * THRIVEWOO POS — UNIFIED API & OFFLINE QUEUE CLIENT
 * File: /public/js/pos/pos-api.js
 */

(function (window) {
  'use strict';

  const PosAPI = {
    // ─── Products & Catalog ──────────────────────────────
    getProducts: async function (params = {}) {
      const query = new URLSearchParams(params).toString();
      try {
        const res = await fetch(`/api/pos/products?${query}`);
        if (!res.ok) throw new Error("HTTP error " + res.status);
        const data = await res.json();
        if (data.status && Array.isArray(data.data)) {
          localStorage.setItem('pos_catalog_cache', JSON.stringify(data.data));
        }
        return data;
      } catch (err) {
        console.warn("[PosAPI] Network unavailable, falling back to local catalog cache");
        const cache = localStorage.getItem('pos_catalog_cache');
        const list = cache ? JSON.parse(cache) : [];
        return { status: true, is_cached: true, data: list, categories: ['All'] };
      }
    },

    lookupBarcode: async function (code) {
      try {
        const res = await fetch(`/api/pos/products/barcode/${encodeURIComponent(code)}`);
        return await res.json();
      } catch (err) {
        // Fallback local lookup
        const cache = localStorage.getItem('pos_catalog_cache');
        if (cache) {
          const list = JSON.parse(cache);
          const found = list.find(p => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
          if (found) return { status: true, data: found };
        }
        return { status: false, message: "Barcode not found offline" };
      }
    },

    // ─── Checkout & Billing ──────────────────────────────
    checkoutSale: async function (payload) {
      try {
        const res = await fetch('/api/pos/sale/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        return data;
      } catch (err) {
        // Offline Transaction Queuing
        console.warn("[PosAPI] Checkout offline, queuing transaction for sync");
        const offlineQueue = JSON.parse(localStorage.getItem('pos_offline_sales') || '[]');
        const offlineId = `OFFLINE-${Date.now()}`;
        const offlineRecord = {
          ...payload,
          invoice_no: offlineId,
          created_at: new Date().toISOString(),
          is_offline_pending: true,
          grand_total: payload.items.reduce((s, it) => s + (it.price * it.qty), 0)
        };
        offlineQueue.push(offlineRecord);
        localStorage.setItem('pos_offline_sales', JSON.stringify(offlineQueue));

        return {
          status: true,
          is_offline: true,
          message: "Transaction saved offline. Will sync when connected.",
          data: offlineRecord
        };
      }
    },

    // ─── Park & Resume (Hold Sales) ──────────────────────
    holdSale: async function (payload) {
      const res = await fetch('/api/pos/sale/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    },

    getHeldSales: async function () {
      const res = await fetch('/api/pos/sale/held');
      return await res.json();
    },

    resumeHeldSale: async function (holdId) {
      const res = await fetch(`/api/pos/sale/held/${encodeURIComponent(holdId)}/resume`, {
        method: 'POST'
      });
      return await res.json();
    },

    discardHeldSale: async function (holdId) {
      const res = await fetch(`/api/pos/sale/held/${encodeURIComponent(holdId)}`, {
        method: 'DELETE'
      });
      return await res.json();
    },

    // ─── Shift & Cash Drawer ─────────────────────────────
    getCurrentShift: async function () {
      const res = await fetch('/api/pos/shifts/current');
      return await res.json();
    },

    openShift: async function (payload) {
      const res = await fetch('/api/pos/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    },

    closeShift: async function (payload) {
      const res = await fetch('/api/pos/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    },

    // ─── Customers & Promos ──────────────────────────────
    getCustomers: async function (search = '') {
      const res = await fetch(`/api/pos/customers?search=${encodeURIComponent(search)}`);
      return await res.json();
    },

    createCustomer: async function (payload) {
      const res = await fetch('/api/pos/customers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    },

    validatePromotion: async function (code, subtotal, items) {
      const res = await fetch('/api/pos/promotions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, cart_subtotal: subtotal, items })
      });
      return await res.json();
    },

    // ─── Sales History & Stats ───────────────────────────
    getSales: async function (params = {}) {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`/api/pos/sales?${query}`);
      return await res.json();
    },

    getDashboardStats: async function () {
      const res = await fetch('/api/pos/dashboard/stats');
      return await res.json();
    },

    getSettings: async function () {
      const res = await fetch('/api/pos/settings');
      return await res.json();
    },

    updateSettings: async function (payload) {
      const res = await fetch('/api/pos/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }
  };

  window.PosAPI = PosAPI;
})(window);
