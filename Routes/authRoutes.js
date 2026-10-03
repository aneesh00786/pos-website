const express = require('express');
const path = require('path');
const router = express.Router();
const authController = require('../controllers/authController');
const { handleRenewalsEndpoint, sendTestRenewalEmailEndpoint } = require('../controllers/posTrialEndController');
const posMailController = require('../controllers/posMailController');

const viewsDir = path.join(__dirname, '..', 'views');

// 1. Web Page Views
router.get('/', (req, res) => {
  res.sendFile(path.join(viewsDir, 'home.html'));
});

router.get('/register', (req, res) => {
  res.sendFile(path.join(viewsDir, 'register.html'));
});

router.get('/login', (req, res) => {
  res.sendFile(path.join(viewsDir, 'login.html'));
});

router.get('/logout', authController.logout);

// 2. Auth & Billing APIs
router.post('/api/auth/register-step1', authController.registerStep1);
router.post('/api/auth/create-payment-intent', authController.createPaymentIntent);
router.post('/api/auth/paypal-create-order', authController.createPaypalOrder);
router.post('/api/auth/complete-registration', authController.completeRegistration);
router.post('/api/auth/login', authController.login);
router.get('/api/auth/session', authController.getCurrentSession);

// 3. Recurring Billing Process Endpoint (Trial End / Renewal Runner)
router.all('/api/pos/subscription/process-renewals', handleRenewalsEndpoint);


// 4. Automated Subscription Expiration & Renewal Email APIs
router.all('/api/pos/subscription/check-expiry-emails', posMailController.triggerExpiryCheckEndpoint);
router.post('/api/pos/subscription/send-test-expiry-email', posMailController.sendTestEmailEndpoint);
router.post('/api/pos/subscription/send-test-renewal-email', sendTestRenewalEmailEndpoint);

module.exports = router;
