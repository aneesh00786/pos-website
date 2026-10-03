/**
 * THRIVEWOO POS — BILLING TERMINAL & ACTIVE CART ENGINE
 * File: /public/js/pos/pos-billing.js
 */

(function (window) {
  'use strict';

  let _products = [];
  let _categories = [];
  let _activeCategory = 'All';
  let _currentCart = [];
  let _selectedCustomer = { code: 'CUST-WALKIN', name: 'Walk-in Customer / Guest' };
  let _appliedPromo = null;
  let _manualDiscount = 0;

  // Barcode Scanner Keystroke Buffer
  let _barcodeBuffer = '';
  let _lastKeyTime = 0;

  const PosBilling = {
    init: async function () {
      await this.loadCatalog();
      this.initBarcodeScannerListener();
      this.renderCart();
      this.updateHeldCounter();
      if (window.PosUtils) PosUtils.initNetworkMonitor();
    },

    loadCatalog: async function () {
      const grid = document.getElementById('pos-product-grid');
      if (grid) grid.innerHTML = '<div class="text-center py-5 text-muted col-span-full"><div class="spinner-border text-primary me-2"></div>Loading product catalog...</div>';

      const res = await PosAPI.getProducts();
      if (res && res.status && Array.isArray(res.data)) {
        _products = res.data;
        _categories = res.categories || ['All'];
        this.renderCategories();
        this.renderProducts(_products);
      }
    },

    renderCategories: function () {
      const container = document.getElementById('pos-categories-slider');
      if (!container) return;

      container.innerHTML = _categories.map(cat => `
        <button class="pos-category-pill ${_activeCategory.toLowerCase() === cat.toLowerCase() ? 'active' : ''}" onclick="PosBilling.selectCategory('${cat}', this)">
          ${cat}
        </button>
      `).join('');
    },

    selectCategory: function (cat, btn) {
      _activeCategory = cat;
      document.querySelectorAll('.pos-category-pill').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');

      if (cat === 'All') {
        this.renderProducts(_products);
      } else {
        const filtered = _products.filter(p => p.category.toLowerCase() === cat.toLowerCase());
        this.renderProducts(filtered);
      }
    },

    renderProducts: function (list) {
      const grid = document.getElementById('pos-product-grid');
      if (!grid) return;

      if (!list || list.length === 0) {
        grid.innerHTML = '<div class="text-center py-5 text-muted" style="grid-column:1/-1;">No products found in this category.</div>';
        return;
      }

      grid.innerHTML = list.map(p => {
        const isOutOfStock = (p.stock_qty <= 0);
        let stockClass = 'ok';
        let stockText = `${p.stock_qty} in stock`;
        if (isOutOfStock) {
          stockClass = 'out';
          stockText = 'Out of stock';
        } else if (p.stock_qty <= (p.low_stock_threshold || 10)) {
          stockClass = 'low';
          stockText = `Low: ${p.stock_qty}`;
        }

        return `
          <div class="pos-product-card ${isOutOfStock ? 'opacity-75' : ''}" onclick="PosBilling.addToCartById(${p.id})">
            <img src="${p.image || '/img/default-product.png'}" class="pos-product-img" alt="${p.name}" onerror="this.src='/img/default-product.png'">
            <div class="pos-product-title" title="${p.name}">${p.name}</div>
            <div class="pos-product-meta">
              <span>${p.sku || ''}</span>
              <span class="pos-stock-badge ${stockClass}">${stockText}</span>
            </div>
            <div class="pos-product-bottom">
              <span class="pos-product-price">${PosUtils.formatCurrency(p.price)}</span>
              <button class="btn btn-sm btn-outline-primary py-0 px-2 fw-bold" style="border-radius:6px;">+ Add</button>
            </div>
          </div>
        `;
      }).join('');
    },

    searchCatalog: function (query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        this.selectCategory(_activeCategory);
        return;
      }

      const filtered = _products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.includes(q))
      );
      this.renderProducts(filtered);
    },

    // ─── Cart Operations ─────────────────────────────────
    addToCartById: function (productId) {
      const prod = _products.find(p => p.id === productId);
      if (!prod) return;
      this.addToCart(prod, 1);
    },

    addToCart: function (product, qty = 1) {
      const existing = _currentCart.find(it => it.id === product.id || (product.sku && it.sku === product.sku));

      if (existing) {
        existing.qty += qty;
      } else {
        _currentCart.push({
          id: product.id,
          sku: product.sku || '',
          barcode: product.barcode || '',
          name: product.name,
          category: product.category || '',
          price: parseFloat(product.price || 0),
          tax_rate: product.tax_rate !== undefined ? product.tax_rate : 10,
          qty: qty
        });
      }

      if (window.PosUtils) PosUtils.playBeep('success');
      this.renderCart();
    },

    updateQty: function (index, delta) {
      if (!_currentCart[index]) return;
      _currentCart[index].qty += delta;
      if (_currentCart[index].qty <= 0) {
        _currentCart.splice(index, 1);
      }
      this.renderCart();
    },

    setQtyDirect: function (index, val) {
      const q = parseInt(val, 10);
      if (isNaN(q) || q <= 0) {
        _currentCart.splice(index, 1);
      } else {
        _currentCart[index].qty = q;
      }
      this.renderCart();
    },

    removeItem: function (index) {
      _currentCart.splice(index, 1);
      this.renderCart();
    },

    clearCart: function (confirmPrompt = true) {
      if (confirmPrompt && _currentCart.length > 0) {
        if (!confirm("Are you sure you want to clear the active sale ticket?")) return;
      }
      _currentCart = [];
      _appliedPromo = null;
      _manualDiscount = 0;
      this.renderCart();
    },

    // ─── Render Cart Ticket ──────────────────────────────
    renderCart: function () {
      const container = document.getElementById('pos-ticket-items');
      const emptyState = document.getElementById('pos-empty-cart');
      const countBadge = document.getElementById('pos-cart-count');
      const subtotalEl = document.getElementById('pos-cart-subtotal');
      const discountEl = document.getElementById('pos-cart-discount');
      const taxEl = document.getElementById('pos-cart-tax');
      const totalEl = document.getElementById('pos-cart-total');
      const payBtn = document.getElementById('pos-pay-btn');

      if (!container) return;

      const totalItems = _currentCart.reduce((sum, it) => sum + it.qty, 0);
      if (countBadge) countBadge.textContent = totalItems;

      if (_currentCart.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        if (subtotalEl) subtotalEl.textContent = PosUtils.formatCurrency(0);
        if (discountEl) discountEl.textContent = PosUtils.formatCurrency(0);
        if (taxEl) taxEl.textContent = PosUtils.formatCurrency(0);
        if (totalEl) totalEl.textContent = PosUtils.formatCurrency(0);
        if (payBtn) payBtn.disabled = true;
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      if (payBtn) payBtn.disabled = false;

      let subtotal = 0;
      let totalTax = 0;

      container.innerHTML = _currentCart.map((item, idx) => {
        const lineTotal = item.price * item.qty;
        subtotal += lineTotal;

        const taxRate = item.tax_rate !== undefined ? item.tax_rate : 10;
        const lineTax = taxRate > 0 ? (lineTotal - (lineTotal / (1 + (taxRate / 100)))) : 0;
        totalTax += lineTax;

        return `
          <div class="pos-line-item">
            <div class="pos-item-desc">
              <div class="pos-item-name">${item.name}</div>
              <div class="pos-item-sub">${PosUtils.formatCurrency(item.price)} each • SKU: ${item.sku || 'N/A'}</div>
            </div>
            <div class="pos-qty-controls">
              <button type="button" class="pos-qty-btn" onclick="PosBilling.updateQty(${idx}, -1)">&minus;</button>
              <input type="number" class="pos-qty-input" value="${item.qty}" min="1" onchange="PosBilling.setQtyDirect(${idx}, this.value)">
              <button type="button" class="pos-qty-btn" onclick="PosBilling.updateQty(${idx}, 1)">&#43;</button>
            </div>
            <div class="d-flex align-items-center">
              <div class="pos-item-total">${PosUtils.formatCurrency(lineTotal)}</div>
              <span class="pos-item-del" onclick="PosBilling.removeItem(${idx})" title="Remove item"><i class="bi bi-trash"></i></span>
            </div>
          </div>
        `;
      }).join('');

      let discountVal = _manualDiscount;
      if (_appliedPromo && _appliedPromo.discount_amount) {
        discountVal += _appliedPromo.discount_amount;
      }

      const grandTotal = Math.max(0, subtotal - discountVal);

      if (subtotalEl) subtotalEl.textContent = PosUtils.formatCurrency(subtotal);
      if (discountEl) discountEl.textContent = PosUtils.formatCurrency(discountVal);
      if (taxEl) taxEl.textContent = PosUtils.formatCurrency(totalTax);
      if (totalEl) totalEl.textContent = PosUtils.formatCurrency(grandTotal);
    },

    // ─── Hardware USB/HID Barcode Scanner Listener ───────
    initBarcodeScannerListener: function () {
      window.addEventListener('keydown', (e) => {
        // If focus is in a standard text input (and not barcode scanner), do not intercept
        if (e.target.tagName === 'INPUT' && e.target.id !== 'pos-search-input') {
          return;
        }

        const now = Date.now();
        // Hardware scanners typically dump characters at < 40ms interval
        if (now - _lastKeyTime > 80) {
          _barcodeBuffer = '';
        }
        _lastKeyTime = now;

        if (e.key === 'Enter') {
          if (_barcodeBuffer.length >= 3) {
            e.preventDefault();
            this.handleScannedBarcode(_barcodeBuffer);
            _barcodeBuffer = '';
          }
        } else if (e.key.length === 1) {
          _barcodeBuffer += e.key;
        }
      });
    },

    handleScannedBarcode: async function (code) {
      const cleanCode = code.trim();
      const res = await PosAPI.lookupBarcode(cleanCode);
      if (res && res.status && res.data) {
        this.addToCart(res.data, 1);
        if (window.PosUtils) PosUtils.showToast(`Scanned: ${res.data.name}`, 'success');
      } else {
        if (window.PosUtils) {
          PosUtils.playBeep('error');
          PosUtils.showToast(`Barcode not recognized: ${cleanCode}`, 'error');
        }
      }
    },

    // ─── Park / Hold Sale ────────────────────────────────
    parkActiveSale: async function () {
      if (_currentCart.length === 0) {
        alert("Cart is empty! Add products before parking.");
        return;
      }

      const note = prompt("Enter reference note or table/customer name for this held sale:", _selectedCustomer.name || "Counter 1");
      if (note === null) return;

      const payload = {
        items: _currentCart,
        customer: _selectedCustomer,
        note: note,
        discount_val: _manualDiscount
      };

      const res = await PosAPI.holdSale(payload);
      if (res && res.status) {
        if (window.PosUtils) PosUtils.showToast(res.message, 'success');
        this.clearCart(false);
        this.updateHeldCounter();
      } else {
        alert("Failed to park sale: " + (res.message || "Unknown error"));
      }
    },

    updateHeldCounter: async function () {
      try {
        const res = await PosAPI.getHeldSales();
        const badge = document.getElementById('pos-held-count-badge');
        if (badge && res && res.status && Array.isArray(res.data)) {
          badge.textContent = res.data.length;
          badge.style.display = res.data.length > 0 ? 'inline-block' : 'none';
        }
      } catch (_) {}
    },

    getCartState: function () {
      return {
        items: [..._currentCart],
        customer: { ..._selectedCustomer },
        promo: _appliedPromo,
        manualDiscount: _manualDiscount
      };
    },

    setCustomer: function (cust) {
      _selectedCustomer = cust;
      const el = document.getElementById('pos-customer-name-display');
      if (el) el.textContent = cust.name;
    }
  };

  window.PosBilling = PosBilling;
})(window);
