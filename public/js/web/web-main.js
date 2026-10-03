/**
 * ThriveWoo POS — Commercial Website Interactive Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  initPricingSwitcher();
  initHardwareCart();
  initModals();
  initFaqAccordion();
});

// 1. Pricing Billing Switcher (Monthly vs Annual)
function initPricingSwitcher() {
  const billingToggle = document.getElementById('billingCycleToggle');
  if (!billingToggle) return;

  const monthlyPrices = { starter: 29, pro: 79, enterprise: 149 };
  const annualPrices = { starter: 24, pro: 64, enterprise: 119 };

  billingToggle.addEventListener('change', (e) => {
    const isAnnual = e.target.checked;
    const starterPrice = document.getElementById('price-starter');
    const proPrice = document.getElementById('price-pro');
    const enterprisePrice = document.getElementById('price-enterprise');
    const periodLabels = document.querySelectorAll('.price-period');

    if (starterPrice) starterPrice.textContent = isAnnual ? annualPrices.starter : monthlyPrices.starter;
    if (proPrice) proPrice.textContent = isAnnual ? annualPrices.pro : monthlyPrices.pro;
    if (enterprisePrice) enterprisePrice.textContent = isAnnual ? annualPrices.enterprise : monthlyPrices.enterprise;

    periodLabels.forEach(label => {
      label.textContent = isAnnual ? '/month, billed annually' : '/month';
    });

    const labelMonthly = document.getElementById('lbl-monthly');
    const labelAnnual = document.getElementById('lbl-annual');
    if (labelMonthly && labelAnnual) {
      if (isAnnual) {
        labelMonthly.classList.remove('active');
        labelAnnual.classList.add('active');
      } else {
        labelMonthly.classList.add('active');
        labelAnnual.classList.remove('active');
      }
    }
  });
}

// 2. Hardware Cart System
const hardwareCart = {
  items: JSON.parse(localStorage.getItem('tw_hardware_cart') || '[]'),
  
  add(id, name, price) {
    const existing = this.items.find(i => i.id === id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.items.push({ id, name, price: Number(price), quantity: 1 });
    }
    this.save();
    this.render();
    this.openDrawer();
  },

  remove(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
    this.render();
  },

  save() {
    localStorage.setItem('tw_hardware_cart', JSON.stringify(this.items));
    this.updateBadge();
  },

  updateBadge() {
    const badge = document.getElementById('cartBadgeCount');
    const totalQty = this.items.reduce((sum, i) => sum + i.quantity, 0);
    if (badge) {
      badge.textContent = totalQty;
      badge.style.display = totalQty > 0 ? 'inline-flex' : 'none';
    }
  },

  render() {
    const listEl = document.getElementById('hardwareCartItems');
    const subtotalEl = document.getElementById('hardwareCartSubtotal');
    if (!listEl) return;

    if (this.items.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px 10px;color:#94a3b8;"><i class="fas fa-shopping-basket" style="font-size:36px;margin-bottom:12px;"></i><p>Your hardware cart is empty</p></div>`;
      if (subtotalEl) subtotalEl.textContent = '$0.00';
      return;
    }

    let subtotal = 0;
    listEl.innerHTML = this.items.map(item => {
      const lineTotal = item.price * item.quantity;
      subtotal += lineTotal;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e2e8f0;">
          <div style="max-width:200px;">
            <div style="font-weight:700;font-size:14px;color:#0f172a;">${item.name}</div>
            <div style="font-size:13px;color:#64748b;">$${item.price.toFixed(2)} × ${item.quantity}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-weight:700;font-size:14px;">$${lineTotal.toFixed(2)}</span>
            <button onclick="hardwareCart.remove('${item.id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  },

  openDrawer() {
    const drawer = document.getElementById('hardwareCartDrawer');
    if (drawer) drawer.classList.add('active');
  },

  closeDrawer() {
    const drawer = document.getElementById('hardwareCartDrawer');
    if (drawer) drawer.classList.remove('active');
  }
};

window.hardwareCart = hardwareCart;

function initHardwareCart() {
  hardwareCart.updateBadge();
  hardwareCart.render();

  // Add-to-cart buttons
  document.querySelectorAll('.btn-add-hardware').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.hw-card');
      if (!card) return;
      const id = card.dataset.id;
      const name = card.dataset.name;
      const price = parseFloat(card.dataset.price);
      hardwareCart.add(id, name, price);
    });
  });
}

// 3. Modals System (Trial & Demo Request)
function initModals() {
  // Free trial trigger
  document.querySelectorAll('[data-open-trial]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const plan = btn.getAttribute('data-plan') || 'Professional';
      const modal = document.getElementById('trialModal');
      const planInput = document.getElementById('trialPlanInput');
      if (planInput) planInput.value = plan;
      const planNameDisplay = document.getElementById('trialPlanNameDisplay');
      if (planNameDisplay) planNameDisplay.textContent = plan;
      if (modal) modal.classList.add('active');
    });
  });

  // Demo request trigger
  document.querySelectorAll('[data-open-demo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById('demoModal');
      if (modal) modal.classList.add('active');
    });
  });

  // Close modals
  document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el || el.classList.contains('modal-close')) {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      }
    });
  });

  // Trial form submit
  const trialForm = document.getElementById('trialForm');
  if (trialForm) {
    trialForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const plan = document.getElementById('trialPlanInput')?.value || 'Professional';
      const name = document.getElementById('trialName')?.value;
      const email = document.getElementById('trialEmail')?.value;
      const company = document.getElementById('trialCompany')?.value;

      try {
        const res = await fetch('/api/web/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: plan, customer_name: name, email, company })
        });
        const data = await res.json();
        if (data.status) {
          alert(`Success! Your 14-day free trial for ThriveWoo POS has been activated!\n\nYour License Key: ${data.data.license_key}\n\nRedirecting to your customer license portal...`);
          window.location.href = '/portal';
        } else {
          alert(data.message || 'Error activating trial');
        }
      } catch (err) {
        console.error(err);
        window.location.href = '/portal';
      }
    });
  }

  // Demo form submit
  const demoForm = document.getElementById('demoForm');
  if (demoForm) {
    demoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('demoName')?.value;
      const email = document.getElementById('demoEmail')?.value;
      const phone = document.getElementById('demoPhone')?.value;
      const company = document.getElementById('demoCompany')?.value;

      try {
        const res = await fetch('/api/web/demo-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, company })
        });
        const data = await res.json();
        alert(data.message || 'Thank you! We will contact you shortly.');
        document.getElementById('demoModal')?.classList.remove('active');
        demoForm.reset();
      } catch (err) {
        alert('Thank you! Demo request recorded.');
        document.getElementById('demoModal')?.classList.remove('active');
      }
    });
  }
}

// 4. FAQ Accordion
function initFaqAccordion() {
  document.querySelectorAll('.faq-item-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const isOpen = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!isOpen) item.classList.add('active');
    });
  });
}
