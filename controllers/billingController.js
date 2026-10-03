const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const dataDir = path.join(__dirname, '..', 'data');
const productsFile = path.join(dataDir, 'pos-products.json');
const salesFile = path.join(dataDir, 'pos-sales.json');
const heldFile = path.join(dataDir, 'held-sales.json');
const shiftsFile = path.join(dataDir, 'shifts.json');
const settingsFile = path.join(dataDir, 'pos-settings.json');

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  // 1. Process Sale & Final Checkout
  processCheckout: (req, res) => {
    try {
      const { items, customer, payment_method, amount_paid, discount_code, discount_val, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ status: false, message: "Cart cannot be empty" });
      }

      const products = readJson(productsFile, []);
      const settings = readJson(settingsFile, {});
      const shifts = readJson(shiftsFile, { currentShift: null });

      let calculatedSubtotal = 0;
      let calculatedTax = 0;
      const verifiedItems = [];

      // Verify each line item against catalog
      for (const item of items) {
        const prod = products.find(p => p.id === item.id || p.sku === item.sku || p.barcode === item.barcode);
        const unitPrice = prod ? prod.price : parseFloat(item.price || 0);
        const qty = parseInt(item.qty, 10) || 1;
        const lineTotal = unitPrice * qty;
        const taxRate = prod ? (prod.tax_rate !== undefined ? prod.tax_rate : 10) : 10;
        
        // Tax math (inclusive calculation)
        const lineTax = taxRate > 0 ? (lineTotal - (lineTotal / (1 + (taxRate / 100)))) : 0;

        calculatedSubtotal += lineTotal;
        calculatedTax += lineTax;

        // Deduct inventory if product exists
        if (prod) {
          prod.stock_qty = Math.max(0, (prod.stock_qty || 0) - qty);
        }

        verifiedItems.push({
          id: prod ? prod.id : item.id,
          sku: prod ? prod.sku : (item.sku || 'SKU'),
          barcode: prod ? prod.barcode : (item.barcode || ''),
          name: prod ? prod.name : item.name,
          qty: qty,
          unit_price: unitPrice,
          total: parseFloat(lineTotal.toFixed(2)),
          tax_rate: taxRate,
          tax_amount: parseFloat(lineTax.toFixed(2))
        });
      }

      // Update inventory file
      writeJson(productsFile, products);

      // Discount calculation
      let finalDiscount = 0;
      if (discount_val) {
        finalDiscount = parseFloat(discount_val) || 0;
      }

      const grandTotal = Math.max(0, calculatedSubtotal - finalDiscount);
      const paid = parseFloat(amount_paid || grandTotal);
      const change = Math.max(0, paid - grandTotal);

      // Generate invoice number
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const invoiceNo = `POS-${dateStr}-${randomSuffix}`;

      const saleRecord = {
        invoice_no: invoiceNo,
        created_at: now.toISOString(),
        register_id: settings.register_id || 'REG-01',
        cashier_id: shifts.currentShift ? shifts.currentShift.cashier_id : 'STF-001',
        cashier_name: shifts.currentShift ? shifts.currentShift.cashier_name : 'Staff Member',
        shift_id: shifts.currentShift ? shifts.currentShift.id : null,
        customer_id: customer?.code || customer?.id || 'CUST-WALKIN',
        customer_name: customer?.name || 'Walk-in Customer / Guest',
        customer_phone: customer?.phone || '',
        items: verifiedItems,
        subtotal: parseFloat(calculatedSubtotal.toFixed(2)),
        discount_code: discount_code || null,
        discount_amount: parseFloat(finalDiscount.toFixed(2)),
        tax_amount: parseFloat(calculatedTax.toFixed(2)),
        grand_total: parseFloat(grandTotal.toFixed(2)),
        payment_method: payment_method || 'Cash',
        amount_paid: parseFloat(paid.toFixed(2)),
        change_given: parseFloat(change.toFixed(2)),
        notes: notes || '',
        status: 'completed'
      };

      // Save to sales ledger
      const sales = readJson(salesFile, []);
      sales.unshift(saleRecord);
      writeJson(salesFile, sales);

      // Persist sale and live deduct stock in MySQL
      const companyId = req.session?.user?.company_id || 1;
      const adminId = req.session?.user?.id || 1;

      // 1. Live Deduct inventory in MySQL
      for (const item of verifiedItems) {
        if (item.id) {
          db.query('UPDATE product_variation SET stock = GREATEST(0, stock - ?) WHERE id = ?', [item.qty, item.id]).catch(() => {});
        }
      }

      // 2. Insert into MySQL order table
      db.query(`
        INSERT INTO busskit_new.order (
          order_id, customer_id, salesman_id, payment_status, payment_type, payment_detail,
          order_status, order_total, received_amount, generated_date, order_creat_at, company_id, order_source
        ) VALUES (
          ?, ?, ?, 'paid', ?, ?,
          'completed', ?, ?, CURDATE(), NOW(), ?, 'pos'
        )
      `, [
        invoiceNo,
        customer?.id || null,
        adminId,
        payment_method || 'Cash',
        notes || 'POS Counter Sale',
        grandTotal,
        paid,
        companyId
      ]).catch(err => {
        console.warn('[billingController order save note]:', err.message);
      });

      // Update active shift summary
      if (shifts.currentShift && shifts.currentShift.status === 'open') {
        const sum = shifts.currentShift.summary;
        sum.transaction_count = (sum.transaction_count || 0) + 1;
        sum.total_sales = parseFloat(((sum.total_sales || 0) + grandTotal).toFixed(2));
        sum.total_tax = parseFloat(((sum.total_tax || 0) + calculatedTax).toFixed(2));
        sum.total_discount = parseFloat(((sum.total_discount || 0) + finalDiscount).toFixed(2));

        const methodKey = (payment_method || 'Cash').toLowerCase();
        if (methodKey.includes('cash')) sum.cash_sales = parseFloat(((sum.cash_sales || 0) + grandTotal).toFixed(2));
        else if (methodKey.includes('card')) sum.card_sales = parseFloat(((sum.card_sales || 0) + grandTotal).toFixed(2));
        else if (methodKey.includes('upi')) sum.upi_sales = parseFloat(((sum.upi_sales || 0) + grandTotal).toFixed(2));
        else sum.other_sales = parseFloat(((sum.other_sales || 0) + grandTotal).toFixed(2));

        writeJson(shiftsFile, shifts);
      }

      return res.json({
        status: true,
        message: "Sale completed successfully",
        data: saleRecord
      });

    } catch (err) {
      console.error("[billingController] checkout error:", err);
      return res.status(500).json({ status: false, message: "Checkout failed: " + err.message });
    }
  },

  // 2. Hold / Park Active Sale
  holdSale: (req, res) => {
    try {
      const { items, customer, note, discount_val } = req.body;
      if (!items || !items.length) {
        return res.status(400).json({ status: false, message: "No items to hold" });
      }

      const held = readJson(heldFile, []);
      const holdId = `HOLD-${Date.now().toString().slice(-6)}`;
      const subtotal = items.reduce((acc, it) => acc + (parseFloat(it.price || 0) * (parseInt(it.qty, 10) || 1)), 0);

      const newHold = {
        hold_id: holdId,
        held_at: new Date().toISOString(),
        customer: customer || { name: "Guest" },
        items: items,
        discount_val: discount_val || 0,
        subtotal: parseFloat(subtotal.toFixed(2)),
        item_count: items.reduce((acc, it) => acc + (parseInt(it.qty, 10) || 1), 0),
        note: note || "Parked Cart"
      };

      held.unshift(newHold);
      writeJson(heldFile, held);

      return res.json({
        status: true,
        message: "Sale parked successfully",
        hold_id: holdId,
        total_held: held.length
      });
    } catch (e) {
      return res.status(500).json({ status: false, message: e.message });
    }
  },

  // 3. Get All Held Sales
  getHeldSales: (req, res) => {
    const held = readJson(heldFile, []);
    return res.json({ status: true, data: held });
  },

  // 4. Resume Held Sale
  resumeHeldSale: (req, res) => {
    const { hold_id } = req.params;
    let held = readJson(heldFile, []);
    const index = held.findIndex(h => h.hold_id === hold_id);
    if (index === -1) {
      return res.status(404).json({ status: false, message: "Held sale not found" });
    }

    const resumed = held.splice(index, 1)[0];
    writeJson(heldFile, held);

    return res.json({
      status: true,
      message: "Sale resumed",
      data: resumed
    });
  },

  // 5. Discard Held Sale
  discardHeldSale: (req, res) => {
    const { hold_id } = req.params;
    let held = readJson(heldFile, []);
    held = held.filter(h => h.hold_id !== hold_id);
    writeJson(heldFile, held);
    return res.json({ status: true, message: "Held sale discarded" });
  }
};
