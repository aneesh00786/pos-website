const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
  port: process.env.PORT || 5000,
  sharedUploadsDir: process.env.SHARED_UPLOADS_DIR || null,
  buskitWebUrl: process.env.BUSKIT_WEB_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'thrivewoo_pos_vault_2026',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  paypalApi: process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com',
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalSecret: process.env.PAYPAL_SECRET || ''
};

