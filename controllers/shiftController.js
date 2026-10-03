const fs = require('fs');
const path = require('path');

const shiftsFile = path.join(__dirname, '..', 'data', 'shifts.json');
const settingsFile = path.join(__dirname, '..', 'data', 'pos-settings.json');

function readJson(file, fallback = {}) {
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
  getCurrentShift: (req, res) => {
    const data = readJson(shiftsFile, { currentShift: null });
    const shift = data.currentShift;

    if (!shift || shift.status !== 'open') {
      return res.json({ status: true, hasActiveShift: false, shift: null });
    }

    const expectedCashInDrawer = (parseFloat(shift.opening_float || 0) + parseFloat(shift.summary.cash_sales || 0));

    return res.json({
      status: true,
      hasActiveShift: true,
      shift: {
        ...shift,
        expected_cash_drawer: parseFloat(expectedCashInDrawer.toFixed(2))
      }
    });
  },

  openShift: (req, res) => {
    try {
      const { opening_float, cashier_name, cashier_id } = req.body;
      const data = readJson(shiftsFile, { currentShift: null, history: [] });
      const settings = readJson(settingsFile, {});

      if (data.currentShift && data.currentShift.status === 'open') {
        return res.status(400).json({
          status: false,
          message: "A shift is already active on this register. Please close it first."
        });
      }

      const floatAmt = parseFloat(opening_float || 0);
      const shiftId = `SHIFT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      const newShift = {
        id: shiftId,
        register_id: settings.register_id || 'REG-01',
        cashier_id: cashier_id || 'STF-001',
        cashier_name: cashier_name || 'Alex Morgan',
        opened_at: new Date().toISOString(),
        opening_float: floatAmt,
        status: 'open',
        summary: {
          cash_sales: 0,
          card_sales: 0,
          upi_sales: 0,
          other_sales: 0,
          total_sales: 0,
          total_tax: 0,
          total_discount: 0,
          transaction_count: 0
        }
      };

      data.currentShift = newShift;
      writeJson(shiftsFile, data);

      return res.json({
        status: true,
        message: "Shift opened successfully",
        shift: newShift
      });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  closeShift: (req, res) => {
    try {
      const { actual_cash_counted, notes } = req.body;
      const data = readJson(shiftsFile, { currentShift: null, history: [] });

      if (!data.currentShift || data.currentShift.status !== 'open') {
        return res.status(400).json({ status: false, message: "No active shift to close" });
      }

      const shift = data.currentShift;
      const counted = parseFloat(actual_cash_counted || 0);
      const expectedCash = parseFloat(shift.opening_float || 0) + parseFloat(shift.summary.cash_sales || 0);
      const variance = parseFloat((counted - expectedCash).toFixed(2));

      const closedRecord = {
        ...shift,
        status: 'closed',
        closed_at: new Date().toISOString(),
        actual_cash_counted: counted,
        expected_cash_drawer: parseFloat(expectedCash.toFixed(2)),
        cash_variance: variance,
        variance_status: variance === 0 ? 'exact' : (variance > 0 ? 'overage' : 'shortage'),
        notes: notes || ''
      };

      data.currentShift = null;
      if (!data.history) data.history = [];
      data.history.unshift(closedRecord);
      writeJson(shiftsFile, data);

      return res.json({
        status: true,
        message: "Shift closed and Z-Report generated",
        zReport: closedRecord
      });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  },

  getShiftHistory: (req, res) => {
    const data = readJson(shiftsFile, { history: [] });
    return res.json({ status: true, data: data.history || [] });
  }
};
