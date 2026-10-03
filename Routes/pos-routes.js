const { Router } = require('express');
const path = require('path');

const router = Router();
const viewsDir = path.join(__dirname, '..', 'views');

// Navigation root redirects
router.get('/pos', (req, res) => res.redirect('/pos/dashboard'));

// 1. Primary POS Billing Terminal
router.get(['/pos/sale', '/pos/billing'], (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosBilling.html'));
});

// 2. Operational POS Dashboard
router.get('/pos/dashboard', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosDashboard.html'));
});

// 3. Held & Parked Sales
router.get('/pos/held', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosHeldSales.html'));
});

// 4. Sales History & Ledger
router.get('/pos/history', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosHistory.html'));
});

// 5. Products & Barcodes
router.get('/pos/products', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosProducts.html'));
});

// 6. Customers
router.get('/pos/customers', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosCustomers.html'));
});

// 7. Promotions & Discounts
router.get('/pos/promotions', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosPromotions.html'));
});

// 8. Inventory & Stock Levels
router.get('/pos/inventory', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosInventory.html'));
});

// 9. Shifts & Cash Drawer
router.get('/pos/shifts', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosShifts.html'));
});

// 10. Financial & Sales Reports
router.get('/pos/reports', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosReports.html'));
});

// 11. POS Store, Register, Printer Settings
router.get('/pos/settings', (req, res) => {
  res.sendFile(path.join(viewsDir, 'pos', 'PosSettings.html'));
});

module.exports = router;
