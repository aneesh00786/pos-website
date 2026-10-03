const express = require('express');
const path = require('path');
const router = express.Router();
const webController = require('../controllers/webController');

// 1. Website Page Views
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/index.html'));
});

router.get('/features', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/features.html'));
});

router.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/pricing.html'));
});

router.get('/hardware', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/hardware.html'));
});

router.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/portal.html'));
});

router.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/docs.html'));
});

router.get('/support', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/web/docs.html'));
});

router.get('/demo', (req, res) => {
  res.redirect('/pos/sale?mode=demo');
});

// 2. Commercial Web APIs
router.get('/api/web/plans', webController.getPricingData);
router.get('/api/web/hardware', webController.getHardwareProducts);
router.get('/api/web/hardware/:id', webController.getHardwareById);
router.post('/api/web/subscribe', webController.createSubscription);
router.post('/api/web/demo-request', webController.submitDemoRequest);
router.post('/api/web/hardware/checkout', webController.checkoutHardware);
router.get('/api/web/portal', webController.getCustomerPortalData);
router.post('/api/web/portal/generate-key', webController.generateRegisterKey);
router.post('/api/web/tickets/submit', webController.submitSupportTicket);

module.exports = router;
