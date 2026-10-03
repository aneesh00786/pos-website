const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { port, sharedUploadsDir, sessionSecret } = require('./config/config');

const app = express();
const { startPosEmailScheduler } = require('./controllers/posMailController');
const { startPosRenewalScheduler } = require('./controllers/posTrialEndController');

// Base middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Staff Shift & Account Session
app.use(session({
  name: 'thrivewoo_pos_sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours session
  }
}));

// 1. Public Commercial & Authentication Routes (Home, Register, Login, Payment)
const authRoutes = require('./Routes/authRoutes');
app.use(authRoutes);

// 2. POS API, Terminal & Billing App Routes
const posApiRoutes = require('./Routes/pos-api-routes');
const terminalRoutes = require('./Routes/terminal-routes');
const posViewRoutes = require('./Routes/pos-routes');

app.use(posApiRoutes);
app.use(terminalRoutes);
app.use(posViewRoutes);

// Static uploads & media (Independent of webstore server)
if (sharedUploadsDir && fs.existsSync(sharedUploadsDir)) {
  app.use('/uploads', express.static(sharedUploadsDir));
} else {
  app.use('/uploads', express.static(path.join(__dirname, 'public', 'img')));
}

// Static Assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// Provide default fallback avatar and product images
app.get(['/uploads/customer/user-new.png', '/uploads/admin/user-new.png', '/uploads/user-new.png', '/img/user-new.png'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'img', 'user-new.png'));
});

app.get(['/img/default-product.png', '/uploads/product/default.png'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'img', 'default-product.png'));
});

// Socket.io mock fallback to prevent 404 polling if included
app.get('/socket.io/socket.io.js', (req, res) => {
  res.type('application/javascript').send('window.io = function() { return { on: function(){}, emit: function(){}, connect: function(){}, disconnect: function(){} }; };');
});

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;max-width:550px;margin:50px auto;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;box-shadow:0 10px 25px rgba(0,0,0,0.05);">
      <h2 style="font-size:28px;font-weight:800;color:#0f172a;margin-bottom:12px;">404 - Page Not Found</h2>
      <p style="color:#64748b;font-size:15px;line-height:1.6;margin-bottom:24px;">The requested URL <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;color:#0f172a;">${req.originalUrl}</code> was not found on ThriveWoo POS.</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <a href="/" style="padding:10px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Home Showcase</a>
        <a href="/login" style="padding:10px 20px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Sign In to POS</a>
      </div>
    </div>
  `);
});

// Start Server
// Start automated subscription schedulers
startPosEmailScheduler();
startPosRenewalScheduler();

app.listen(port, () => {
  console.log(`\n======================================================`);
  console.log(`🌟 ThriveWoo POS Standalone Platform Running on http://localhost:${port}`);
  console.log(`------------------------------------------------------`);
  console.log(`🏠 Commercial Home:      http://localhost:${port}/`);
  console.log(`📝 Register & Purchase:  http://localhost:${port}/register`);
  console.log(`🔐 Store & Staff Login:  http://localhost:${port}/login`);
  console.log(`------------------------------------------------------`);
  console.log(`📊 POS Dashboard:        http://localhost:${port}/pos/dashboard`);
  console.log(`🛒 POS Billing Screen:   http://localhost:${port}/pos/sale`);
  console.log(`⏸️  Held Sales:           http://localhost:${port}/pos/held`);
  console.log(`📜 Sales History:         http://localhost:${port}/pos/history`);
  console.log(`📦 Products:              http://localhost:${port}/pos/products`);
  console.log(`👥 Customers:             http://localhost:${port}/pos/customers`);
  console.log(`🏷️  Promotions:            http://localhost:${port}/pos/promotions`);
  console.log(`📋 Inventory:             http://localhost:${port}/pos/inventory`);
  console.log(`💵 Shifts:                http://localhost:${port}/pos/shifts`);
  console.log(`📈 Reports:               http://localhost:${port}/pos/reports`);
  console.log(`⚙️  Settings:              http://localhost:${port}/pos/settings`);
  console.log(`======================================================\n`);
});
