const { Router } = require('express');
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const billingController = require('../controllers/billingController');
const shiftController = require('../controllers/shiftController');
const inventoryController = require('../controllers/inventoryController');

const router = Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const dataDir = path.join(__dirname, '..', 'data');
const customersFile = path.join(dataDir, 'pos-customers.json');
const salesFile = path.join(dataDir, 'pos-sales.json');
const promotionsFile = path.join(dataDir, 'pos-promotions.json');
const settingsFile = path.join(dataDir, 'pos-settings.json');
const productsFile = path.join(dataDir, 'pos-products.json');
const shiftsFile = path.join(dataDir, 'shifts.json');
const heldFile = path.join(dataDir, 'held-sales.json');

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Products & Inventory ──────────────────────────────────────────
router.get('/api/pos/products', inventoryController.getProducts);
router.get('/api/pos/products/barcode/:code', inventoryController.lookupBarcode);
router.post('/api/pos/products/adjust', inventoryController.adjustStock);

// ─── Sale Checkout & Hold/Resume ───────────────────────────────────
router.post('/api/pos/sale/checkout', billingController.processCheckout);
router.post('/api/pos/sale/hold', billingController.holdSale);
router.get('/api/pos/sale/held', billingController.getHeldSales);
router.post('/api/pos/sale/held/:hold_id/resume', billingController.resumeHeldSale);
router.delete('/api/pos/sale/held/:hold_id', billingController.discardHeldSale);

// ─── Sales History & Ledger ────────────────────────────────────────
router.get('/api/pos/sales', (req, res) => {
  const { search, date, cashier, payment_method } = req.query;
  let sales = readJson(salesFile, []);

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    sales = sales.filter(s =>
      s.invoice_no.toLowerCase().includes(q) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q))
    );
  }

  if (date) {
    sales = sales.filter(s => s.created_at.startsWith(date));
  }

  if (cashier && cashier !== 'all') {
    sales = sales.filter(s => s.cashier_id === cashier || s.cashier_name.toLowerCase().includes(cashier.toLowerCase()));
  }

  if (payment_method && payment_method !== 'all') {
    sales = sales.filter(s => s.payment_method.toLowerCase() === payment_method.toLowerCase());
  }

  return res.json({ status: true, total: sales.length, data: sales });
});

router.get('/api/pos/sales/:invoice_no', (req, res) => {
  const sales = readJson(salesFile, []);
  const sale = sales.find(s => s.invoice_no === req.params.invoice_no);
  if (!sale) return res.status(404).json({ status: false, message: "Receipt not found" });
  return res.json({ status: true, data: sale });
});

router.post('/api/pos/sales/:invoice_no/reprint', (req, res) => {
  const sales = readJson(salesFile, []);
  const sale = sales.find(s => s.invoice_no === req.params.invoice_no);
  if (!sale) return res.status(404).json({ status: false, message: "Receipt not found" });
  return res.json({ status: true, message: "Reprint payload generated", data: sale });
});

router.post('/api/pos/sales/:invoice_no/void', (req, res) => {
  const sales = readJson(salesFile, []);
  const sale = sales.find(s => s.invoice_no === req.params.invoice_no);
  if (!sale) return res.status(404).json({ status: false, message: "Receipt not found" });

  sale.status = 'voided';
  sale.voided_at = new Date().toISOString();
  sale.void_reason = req.body.reason || 'Cashier voided';

  // Restore inventory
  const products = readJson(productsFile, []);
  for (const item of sale.items) {
    const prod = products.find(p => p.id === item.id || p.sku === item.sku);
    if (prod) {
      prod.stock_qty += (item.qty || 1);
    }
  }
  writeJson(productsFile, products);
  writeJson(salesFile, sales);

  return res.json({ status: true, message: "Transaction voided and stock restored", data: sale });
});

// ─── Customer Management ───────────────────────────────────────────
router.get('/api/pos/customers', async (req, res) => {
  try {
    const companyId = req.session?.user?.company_id || req.query.company_id || 1;
    const { search } = req.query;

    let sql = `
      SELECT 
        id,
        COALESCE(NULLIF(customer_id, ''), CONCAT('CUST-', id)) AS code,
        fullname AS name,
        COALESCE(mobileno, '') AS phone,
        COALESCE(email, '') AS email,
        CAST(COALESCE(credit_amt, 0) AS DECIMAL(10,2)) AS outstanding_balance,
        CAST(COALESCE(credit_limit, 0) AS DECIMAL(10,2)) AS credit_limit,
        10 AS points
      FROM customers
      WHERE company_id = ?
    `;
    const params = [companyId];

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(fullname) LIKE ? OR mobileno LIKE ? OR LOWER(email) LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY id DESC LIMIT 100`;

    const customers = await db.query(sql, params);
    return res.json({ status: true, total: customers.length, data: customers });
  } catch (err) {
    console.error('[pos-api-routes customers error]:', err);
    return res.status(500).json({ status: false, message: err.message });
  }
});

router.post('/api/pos/customers/create', async (req, res) => {
  try {
    const companyId = req.session?.user?.company_id || 1;
    const { name, phone, email, credit_limit } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ status: false, message: "Customer name is required" });
    }

    const code = `CUST-${Date.now().toString().slice(-4)}`;
    const result = await db.query(`
      INSERT INTO customers (
        company_id, customer_id, fullname, mobileno, email, credit_limit, status, create_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    `, [companyId, code, name.trim(), phone ? phone.trim() : '', email ? email.trim() : '', parseFloat(credit_limit || 0)]);

    return res.json({
      status: true,
      message: "Customer created successfully in database",
      data: {
        id: result.insertId,
        code,
        name: name.trim(),
        phone: phone ? phone.trim() : '',
        email: email ? email.trim() : '',
        points: 10,
        outstanding_balance: 0,
        credit_limit: parseFloat(credit_limit || 0)
      }
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─── Promotions & Discounts ────────────────────────────────────────
router.get('/api/pos/promotions', (req, res) => {
  const promotions = readJson(promotionsFile, []);
  return res.json({ status: true, data: promotions });
});

router.post('/api/pos/promotions/validate', (req, res) => {
  const { code, cart_subtotal, items } = req.body;
  const promotions = readJson(promotionsFile, []);
  const promo = promotions.find(p => p.code.toLowerCase() === (code || '').trim().toLowerCase() && p.is_active);

  if (!promo) {
    return res.status(404).json({ status: false, message: "Invalid or expired promotion code" });
  }

  const subtotal = parseFloat(cart_subtotal || 0);
  if (promo.min_spend && subtotal < promo.min_spend) {
    return res.status(400).json({
      status: false,
      message: `Minimum order amount of $${promo.min_spend.toFixed(2)} required for this offer.`
    });
  }

  let discountAmount = 0;
  if (promo.type === 'percentage') {
    discountAmount = (subtotal * promo.value) / 100;
  } else if (promo.type === 'fixed') {
    discountAmount = Math.min(subtotal, promo.value);
  } else if (promo.type === 'category_percentage' && Array.isArray(items)) {
    const categoryTotal = items
      .filter(it => it.category === promo.category)
      .reduce((sum, it) => sum + (parseFloat(it.price || 0) * (parseInt(it.qty, 10) || 1)), 0);
    discountAmount = (categoryTotal * promo.value) / 100;
  }

  return res.json({
    status: true,
    message: "Promotion applied successfully",
    data: {
      code: promo.code,
      name: promo.name,
      discount_amount: parseFloat(discountAmount.toFixed(2))
    }
  });
});

// ─── Shift Management & Cash Drawer ────────────────────────────────
router.get('/api/pos/shifts/current', shiftController.getCurrentShift);
router.post('/api/pos/shifts/open', shiftController.openShift);
router.post('/api/pos/shifts/close', shiftController.closeShift);
router.get('/api/pos/shifts/history', shiftController.getShiftHistory);

// ─── Store & Device Settings ───────────────────────────────────────
router.get('/api/pos/settings', (req, res) => {
  const settings = readJson(settingsFile, {});
  return res.json({ status: true, data: settings });
});

router.post('/api/pos/settings/update', (req, res) => {
  try {
    const current = readJson(settingsFile, {});
    const updated = { ...current, ...req.body };
    writeJson(settingsFile, updated);
    return res.json({ status: true, message: "Settings updated successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─── Printer Configuration & Test Print ────────────────────────────
router.post('/api/pos/printer/test-print', (req, res) => {
  const { printer_type, custom_text } = req.body;
  const settings = readJson(settingsFile, {});
  const format = printer_type || settings.printer_type || 'thermal_80mm';

  // Construct raw sample receipt
  const sampleReceipt = {
    header: settings.store_name || "ThriveWoo Central Store",
    address: settings.store_address,
    tax_id: settings.tax_number,
    invoice_no: "TEST-RECEIPT-001",
    date: new Date().toLocaleString(),
    format: format,
    items: [
      { name: "Coffee Sample", qty: 1, price: 4.50, total: 4.50 }
    ],
    total: 4.50,
    footer: custom_text || "TEST PRINT OK — THRIVEWOO POS"
  };

  return res.json({
    status: true,
    message: `Test print formatted for ${format}`,
    sample: sampleReceipt
  });
});

// ─── Operational Dashboard Analytics ───────────────────────────────
router.get('/api/pos/dashboard/stats', async (req, res) => {
  try {
    const companyId = req.session?.user?.company_id || req.query.company_id || 1;

    // 1. Query low stock products from product_variation for this company
    const lowStock = await db.query(`
      SELECT 
        pv.id,
        pv.product_code AS sku,
        pv.product_name AS name,
        COALESCE(c.category, 'General') AS category,
        CAST(COALESCE(pv.stock, 0) AS SIGNED) AS stock_qty,
        CAST(COALESCE(pv.lowstock, 10) AS SIGNED) AS low_stock_threshold
      FROM product_variation pv
      LEFT JOIN categories c ON pv.catId = c.cid
      WHERE pv.company_id = ?
        AND COALESCE(pv.stock, 0) <= COALESCE(pv.lowstock, 10)
      ORDER BY pv.stock ASC
      LIMIT 5
    `, [companyId]);

    // 2. Query today's sales from MySQL order table for this company
    const todaySales = await db.query(`
      SELECT 
        id,
        order_id AS invoice_no,
        order_total AS grand_total,
        payment_type AS payment_method,
        order_status AS status,
        order_creat_at AS created_at
      FROM busskit_new.order
      WHERE company_id = ?
        AND DATE(order_creat_at) = CURDATE()
        AND (order_status IS NULL OR order_status != 'cancelled')
    `, [companyId]);

    const totalRevenue = todaySales.reduce((acc, s) => acc + (parseFloat(s.grand_total) || 0), 0);
    const totalTransactions = todaySales.length;
    const avgTicket = totalTransactions > 0 ? (totalRevenue / totalTransactions) : 0;

    // Payment breakdown
    const payments = { Cash: 0, Card: 0, UPI: 0, Other: 0 };
    todaySales.forEach(s => {
      const m = (s.payment_method || 'Cash').toLowerCase();
      const amt = parseFloat(s.grand_total) || 0;
      if (m.includes('cash')) payments.Cash += amt;
      else if (m.includes('card') || m.includes('stripe')) payments.Card += amt;
      else if (m.includes('upi')) payments.UPI += amt;
      else payments.Other += amt;
    });

    // 3. Query recent transactions for this company
    const recentTransactions = await db.query(`
      SELECT 
        o.id,
        o.order_id AS invoice_no,
        COALESCE(c.fullname, 'Walk-in Customer') AS customer_name,
        COALESCE(o.payment_type, 'Cash') AS payment_method,
        CAST(COALESCE(o.order_total, 0) AS DECIMAL(10,2)) AS grand_total,
        o.order_creat_at AS created_at
      FROM busskit_new.order o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.company_id = ?
      ORDER BY o.id DESC
      LIMIT 5
    `, [companyId]);

    // Active shift info
    const shiftUser = req.session?.user?.name || 'Store Cashier';
    const currentShift = {
      id: `SHIFT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`,
      status: 'open',
      cashier_name: shiftUser,
      opened_at: new Date().toISOString(),
      opening_float: 150.00,
      summary: {
        total_sales: totalRevenue
      }
    };

    return res.json({
      status: true,
      data: {
        today: {
          revenue: parseFloat(totalRevenue.toFixed(2)),
          transactions: totalTransactions,
          avgTicket: parseFloat(avgTicket.toFixed(2)),
          tax: parseFloat((totalRevenue * 0.1).toFixed(2)),
          discounts: 0,
          paymentBreakdown: payments
        },
        currentShift: currentShift,
        heldSalesCount: 0,
        lowStockProducts: lowStock,
        recentTransactions: recentTransactions
      }
    });
  } catch (err) {
    console.error('[Dashboard stats error]:', err);
    return res.status(500).json({ status: false, message: err.message });
  }
});

module.exports = router;
