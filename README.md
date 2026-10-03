# ThriveWoo POS — Modern Retail Point of Sale & Billing Platform

ThriveWoo POS is a full-featured, standalone web-based Point of Sale (POS) and retail terminal application engineered for retail stores, supermarkets, and multi-lane merchants. It connects with MySQL (`busskit_new`), supports barcode scanning, multi-tender payment processing (Cash, Card, Apple Pay, Stripe, Pine Labs), cashier shift & cash drawer float tracking, and automated subscription renewal with multi-timezone midnight processing and invoice email delivery.

---

## 🌟 Key Features

- **Billing Terminal (`/pos/sale`):**
  - High-speed product search and barcode scanner support (USB & camera scan).
  - Real-time tax math, promotions, itemized discount engine, and change calculator.
  - Multi-tender checkout: Cash, Stripe Card, Apple Pay, PayPal, and Split Tender.
  - Held & parked sales with quick resume.
  - Receipt formatting and automatic inventory deduction.

- **Operational Dashboard (`/pos/dashboard`):**
  - Real-time today's sales metrics, transactions count, and average ticket size.
  - Payment breakdown charts (Cash, Card, UPI/Other).
  - Low-stock inventory alert feed directly from MySQL `product_variation`.
  - Cashier shift status and active drawer float.
  - Dynamic store owner and store profile header.

- **Shift & Cash Drawer Reconciliation (`/pos/shifts`):**
  - Cash drawer opening float recording and cashier assignment.
  - Cash-in / Cash-out audit ledger.
  - Shift closing summary and discrepancy reporting.

- **Product & Customer Management:**
  - Dynamic multi-tenant product catalog from MySQL `product_variation`.
  - Customer directory with credit limit, balance tracking, and customer search.

- **Automated Recurring Subscriptions & Renewals:**
  - Automated off-session recurring billing via Stripe and PayPal.
  - Global multi-timezone resolution (`resolveStoreTimezone`, `getStoreLocalDateTime`) executing renewals at local midnight in the merchant's country.
  - Automated invoice and receipt confirmation email delivery via ZeptoMail API.
  - Timezone-aware expiration reminder notifications (7-day, 1-day, and expired).

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- MySQL Server (database: `busskit_new`)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aneesh00786/pos-website.git
   cd pos-website
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your database credentials and API keys:
   ```env
   PORT=5000
   SESSION_SECRET=thrivewoo_pos_terminal_vault_2026_@#!

   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=busskit_new

   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...

   PAYPAL_API=https://api-m.sandbox.paypal.com
   PAYPAL_CLIENT_ID=...
   PAYPAL_SECRET=...
   ```

4. **Start the Application:**
   ```bash
   npm start
   # or development mode:
   npm run dev
   ```

5. **Access the Application:**
   - Commercial Home: `http://localhost:5000/`
   - Merchant Registration & Subscription: `http://localhost:5000/register`
   - Store & Cashier Sign In: `http://localhost:5000/login`
   - POS Operational Dashboard: `http://localhost:5000/pos/dashboard`
   - POS Billing Terminal: `http://localhost:5000/pos/sale`

---

## 🛠️ Tech Stack
- **Backend:** Node.js, Express.js, MySQL2, `node-cron`, `ejs`, `nodemailer`
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3, Bootstrap 5, Bootstrap Icons
- **Payment Gateways:** Stripe API (Off-session PaymentIntents & Elements), PayPal REST API
- **Email Service:** ZeptoMail API
