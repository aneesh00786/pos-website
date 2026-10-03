const path = require('path');
const fs = require('fs');

const plansFile = path.join(__dirname, '../data/web-plans.json');
const hardwareFile = path.join(__dirname, '../data/hardware-products.json');
const licensesFile = path.join(__dirname, '../data/customer-licenses.json');
const leadsFile = path.join(__dirname, '../data/leads-and-tickets.json');

const readJson = (file, fallback = {}) => {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, ''));
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return fallback;
  }
};

const writeJson = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
};

module.exports = {
  // 1. Get Pricing Plans & Addons
  getPricingData: (req, res) => {
    const data = readJson(plansFile, { plans: [], addons: [] });
    return res.json({ status: true, data });
  },

  // 2. Get Hardware Catalog
  getHardwareProducts: (req, res) => {
    const products = readJson(hardwareFile, []);
    const category = req.query.category;
    let filtered = products;
    if (category && category !== 'All') {
      filtered = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }
    return res.json({ status: true, total: filtered.length, data: filtered });
  },

  // 3. Get Single Hardware Item
  getHardwareById: (req, res) => {
    const products = readJson(hardwareFile, []);
    const item = products.find(p => p.id === req.params.id);
    if (!item) {
      return res.status(404).json({ status: false, message: 'Hardware product not found' });
    }
    return res.json({ status: true, data: item });
  },

  // 4. Submit Lead / Book a Live 1-on-1 Demo
  submitDemoRequest: (req, res) => {
    const { name, email, phone, company, registers_count, notes } = req.body;
    if (!name || !email) {
      return res.status(400).json({ status: false, message: 'Name and email are required' });
    }

    const leadsData = readJson(leadsFile, { demo_requests: [], newsletter_subscribers: [], support_tickets: [] });
    const newLead = {
      id: `DEMO-${Date.now().toString().slice(-6)}`,
      name,
      email,
      phone: phone || '',
      company: company || 'Retail Business',
      registers_count: registers_count || '1-3',
      notes: notes || '',
      created_at: new Date().toISOString(),
      status: 'pending_contact'
    };

    leadsData.demo_requests.push(newLead);
    writeJson(leadsFile, leadsData);

    return res.json({
      status: true,
      message: 'Thank you! Your personalized ThriveWoo POS demo has been booked. Our retail specialist will reach out within 1 business hour.',
      data: newLead
    });
  },

  // 5. Subscribe to Plan / 14-Day Free Trial
  createSubscription: (req, res) => {
    const { plan_id, billing_cycle, customer_name, email, company } = req.body;
    if (!email) {
      return res.status(400).json({ status: false, message: 'Email is required' });
    }

    const plansData = readJson(plansFile, { plans: [] });
    const selectedPlan = plansData.plans.find(p => p.id === plan_id) || plansData.plans[1];

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newLicenseKey = `TWPOS-${(selectedPlan.name || 'PRO').substring(0, 3).toUpperCase()}-${new Date().getFullYear()}-${randomSuffix}`;

    return res.json({
      status: true,
      message: 'Subscription confirmed! Your 14-day free trial has been activated.',
      data: {
        plan: selectedPlan.name,
        billing_cycle: billing_cycle || 'annual',
        license_key: newLicenseKey,
        portal_url: '/portal',
        trial_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    });
  },

  // 6. Hardware Cart Checkout
  checkoutHardware: (req, res) => {
    const { items, shipping, payment_method } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ status: false, message: 'Cart cannot be empty' });
    }

    const orderId = `HW-${Date.now().toString().slice(-6)}`;
    let total = 0;
    items.forEach(i => { total += (Number(i.price) || 0) * (Number(i.quantity) || 1); });

    return res.json({
      status: true,
      message: 'Hardware order placed successfully! A tracking confirmation has been sent to your email.',
      data: {
        order_id: orderId,
        items_count: items.length,
        total: total.toFixed(2),
        shipping_method: 'Standard Express (2-3 Business Days)',
        status: 'Processing'
      }
    });
  },

  // 7. Get Customer Portal Details
  getCustomerPortalData: (req, res) => {
    const portalData = readJson(licensesFile, {});
    return res.json({ status: true, data: portalData });
  },

  // 8. Generate New Register License Key
  generateRegisterKey: (req, res) => {
    const { station_name, device_type } = req.body;
    const portalData = readJson(licensesFile, { customer: {}, licenses: [] });

    const key = `TWPOS-PRO-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newLicense = {
      key,
      assigned_to: station_name || `Register #${portalData.licenses.length + 1}`,
      created_at: new Date().toISOString().split('T')[0],
      device_type: device_type || 'Windows 11 POS Terminal',
      last_sync: 'Just generated',
      status: 'active'
    };

    portalData.licenses.unshift(newLicense);
    if (portalData.customer) {
      portalData.customer.registers_active = (portalData.customer.registers_active || 0) + 1;
    }
    writeJson(licensesFile, portalData);

    return res.json({
      status: true,
      message: 'New register license key generated successfully!',
      data: newLicense
    });
  },

  // 9. Submit Support Helpdesk Ticket
  submitSupportTicket: (req, res) => {
    const { name, email, subject, category, message, priority } = req.body;
    if (!email || !message) {
      return res.status(400).json({ status: false, message: 'Email and description are required' });
    }

    const leadsData = readJson(leadsFile, { demo_requests: [], newsletter_subscribers: [], support_tickets: [] });
    const ticketId = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
    const newTicket = {
      id: ticketId,
      name: name || 'Valued Retailer',
      email,
      subject: subject || 'POS Inquiries',
      category: category || 'General Help',
      priority: priority || 'Normal',
      message,
      status: 'Open',
      created_at: new Date().toISOString()
    };

    leadsData.support_tickets.unshift(newTicket);
    writeJson(leadsFile, leadsData);

    return res.json({
      status: true,
      message: `Support ticket #${ticketId} created. Our technical engineering team will reply to ${email} shortly.`,
      ticket_id: ticketId
    });
  }
};
