const db = require('../config/db');
const config = require('../config/config');
const ejs = require('ejs');
const path = require('path');
const cron = require('node-cron');
const { sendPosMail } = require('../services/posEmailService');

const emailViewsDir = path.join(__dirname, '..', 'views', 'email');

function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Resolve user's country timezone or map from country name
function resolveStoreTimezone(tz, country) {
  if (tz && typeof tz === 'string' && tz.trim() && tz !== 'UTC' && tz !== 'undefined' && tz !== 'null') {
    return tz.trim();
  }
  const c = (country || '').toLowerCase().trim();
  if (c.includes('australia')) return 'Australia/Melbourne';
  if (c.includes('india')) return 'Asia/Kolkata';
  if (c.includes('united states') || c === 'usa' || c === 'us') return 'America/New_York';
  if (c.includes('united kingdom') || c === 'uk' || c === 'great britain') return 'Europe/London';
  if (c.includes('canada')) return 'America/Toronto';
  if (c.includes('new zealand')) return 'Pacific/Auckland';
  if (c.includes('uae') || c.includes('dubai') || c.includes('emirates')) return 'Asia/Dubai';
  if (c.includes('singapore')) return 'Asia/Singapore';
  if (tz === 'UTC') return 'UTC';
  return 'Australia/Melbourne'; // Default ThriveWoo headquarters
}

// Calculate the current local date and hour for a given timezone
function getStoreLocalDateTime(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    const hour = parseInt(map.hour, 10);
    return { dateStr, hour, fullString: `${dateStr} ${map.hour}:${map.minute}:${map.second}` };
  } catch (e) {
    const today = new Date().toISOString().split('T')[0];
    return { dateStr: today, hour: new Date().getHours(), fullString: today };
  }
}

// Helper: send renewal receipt/confirmation email
async function sendRenewalConfirmationEmail({
  sub,
  transactionId,
  paymentMethod,
  amountCharged,
  nextBillingDate
}) {
  try {
    const templatePath = path.join(emailViewsDir, 'subscription_renewed_mail.ejs');
    const customerName = `${sub.admin_firstname || ''} ${sub.admin_lastname || ''}`.trim() || sub.admin_name || 'Store Owner';

    const html = await ejs.renderFile(templatePath, {
      name: customerName,
      store_name: sub.store_name,
      plan_name: (sub.plan_name || 'POS').charAt(0).toUpperCase() + (sub.plan_name || 'POS').slice(1),
      billing_cycle: sub.billing_cycle === 'annual' ? 'Annual' : 'Monthly',
      amount: parseFloat(amountCharged).toFixed(2),
      currency: sub.currency || 'USD',
      payment_method: paymentMethod,
      transaction_id: transactionId,
      renewal_date: formatDate(new Date()),
      next_billing_date: nextBillingDate,
      login_url: 'http://localhost:5000/login'
    });

    const planTitle = (sub.plan_name || 'POS').charAt(0).toUpperCase() + (sub.plan_name || 'POS').slice(1);
    const subject = `Receipt: Your ThriveWoo POS Subscription has been renewed (${planTitle} Plan)`;

    const sendRes = await sendPosMail({
      to: sub.admin_email,
      subject,
      html
    });

    console.log(`📧 [POS Renewal Mail] Renewal invoice sent to ${sub.admin_email} for Sub #${sub.id}`);
    return { success: true, email: sub.admin_email, subject, sendRes };
  } catch (err) {
    console.error(`❌ [POS Renewal Mail] Failed to send renewal confirmation to ${sub.admin_email}:`, err.message);
    return { success: false, email: sub.admin_email, error: err.message };
  }
}

// Main Routine: Process Automatic POS Subscription Renewals
async function processPosRenewals(options = {}) {
  const { forceAll = false } = options;
  const results = { processed: 0, succeeded: 0, failed: 0, skippedTimezone: 0, logs: [] };
  
  try {
    // Select all trialing and active subscriptions with store country & timezone info
    const subs = await db.query(`
      SELECT 
        s.id, s.company_id, s.admin_id, s.store_name, s.admin_email, s.plan_name,
        s.billing_cycle, s.amount, s.currency, s.registers_licensed, s.status,
        s.trial_start, s.trial_end, s.next_billing_date,
        s.stripe_customer_id, s.stripe_payment_method_id, s.card_token,
        s.paypal_subscription_id, s.paypal_order_id, s.payment_method_type,
        u.name AS admin_name, u.admin_firstname, u.admin_lastname, u.country AS admin_country,
        c.time_zone AS company_timezone, c.country AS company_country
      FROM pos_subscriptions s
      LEFT JOIN admin_info u ON s.admin_id = u.id_admin
      LEFT JOIN company c ON s.company_id = c.id
      WHERE s.status IN ('trialing', 'active')
    `);

    results.processed = subs.length;

    for (const sub of subs) {
      const dueDateRaw = sub.next_billing_date || sub.trial_end;
      if (!dueDateRaw) continue;

      const dueDateStr = new Date(dueDateRaw).toISOString().split('T')[0];
      const storeTimezone = resolveStoreTimezone(sub.company_timezone, sub.company_country || sub.admin_country);
      const localStoreTime = getStoreLocalDateTime(storeTimezone);

      // Verify if midnight or expiration date has arrived in the user's country
      const isDueInUserCountry = forceAll || (localStoreTime.dateStr >= dueDateStr);

      if (!isDueInUserCountry) {
        results.skippedTimezone++;
        results.logs.push(`⏳ Sub #${sub.id} (${sub.store_name}): Due ${dueDateStr}, currently ${localStoreTime.dateStr} in ${storeTimezone} (${sub.company_country || 'Default'}). Waiting for midnight in user's country.`);
        continue;
      }

      const chargeAmount = parseFloat(sub.amount) || 0;
      const isStripe = !!sub.stripe_customer_id && sub.stripe_customer_id.startsWith('cus_');
      const isPayPal = sub.payment_method_type === 'paypal' || (!!sub.paypal_subscription_id && !isStripe);
      const daysToAdd = sub.billing_cycle === 'annual' ? 365 : 30;

      // Calculate the new next_billing_date for the receipt email
      const baseDate = new Date(dueDateRaw);
      const newNextDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      const formattedNextBillingDate = formatDate(newNextDate);

      try {
        if (isStripe && chargeAmount > 0) {
          const stripeSecretKey = config.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
          const stripe = require('stripe')(stripeSecretKey);

          const token = sub.card_token || sub.stripe_payment_method_id;
          if (!token) {
            throw new Error(`No card_token or stripe_payment_method_id for sub #${sub.id}`);
          }

          // Off-session recurring PaymentIntent (auto charge customer card on file)
          const pi = await stripe.paymentIntents.create({
            amount: Math.round(chargeAmount * 100),
            currency: (sub.currency || 'USD').toLowerCase(),
            customer: sub.stripe_customer_id,
            payment_method: token,
            off_session: true,
            confirm: true,
            description: `ThriveWoo POS Recurring Renewal - Sub #${sub.id} (${sub.plan_name})`,
            metadata: {
              subscription_id: sub.id.toString(),
              admin_id: sub.admin_id.toString(),
              company_id: sub.company_id.toString()
            }
          });

          if (pi.status === 'succeeded') {
            await db.query(`
              UPDATE pos_subscriptions
              SET status = 'active',
                  next_billing_date = DATE_ADD(COALESCE(next_billing_date, trial_end, NOW()), INTERVAL ? DAY),
                  last_mail_sent_status = 'renewed',
                  last_mail_sent_at = NOW(),
                  updated_at = NOW()
              WHERE id = ?
            `, [daysToAdd, sub.id]);

            // Record transaction detail
            await db.query(`
              INSERT INTO transaction_details (user_id, subscription_id, amount, tax_amt, tax_in_percentage, payment_method, transaction_date, status)
              VALUES (?, ?, ?, 0, 0, ?, NOW(), 'completed')
            `, [sub.admin_id, sub.id, chargeAmount, sub.payment_method_type || 'card']).catch(() => {});

            // Send automated renewal confirmation invoice email
            await sendRenewalConfirmationEmail({
              sub,
              transactionId: pi.id,
              paymentMethod: sub.payment_method_type === 'apple_pay' ? 'Apple Pay (Stripe)' : 'Credit / Debit Card (Stripe)',
              amountCharged: chargeAmount,
              nextBillingDate: formattedNextBillingDate
            });

            results.succeeded++;
            results.logs.push(`✅ Stripe renewal charged $${chargeAmount} for Sub #${sub.id} (${sub.store_name}) in ${storeTimezone} - TX ${pi.id}`);
          } else {
            throw new Error(`Stripe payment intent status: ${pi.status}`);
          }
        } else if (isPayPal && chargeAmount > 0) {
          // PayPal recurring renewal
          await db.query(`
            UPDATE pos_subscriptions
            SET status = 'active',
                next_billing_date = DATE_ADD(COALESCE(next_billing_date, trial_end, NOW()), INTERVAL ? DAY),
                last_mail_sent_status = 'renewed',
                last_mail_sent_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
          `, [daysToAdd, sub.id]);

          const txId = sub.paypal_order_id || `PP-RENEW-${Date.now()}`;

          await db.query(`
            INSERT INTO transaction_details (user_id, subscription_id, amount, tax_amt, tax_in_percentage, payment_method, transaction_date, status)
            VALUES (?, ?, ?, 0, 0, 'paypal', NOW(), 'completed')
          `, [sub.admin_id, sub.id, chargeAmount]).catch(() => {});

          // Send automated renewal confirmation invoice email
          await sendRenewalConfirmationEmail({
            sub,
            transactionId: txId,
            paymentMethod: 'PayPal Account',
            amountCharged: chargeAmount,
            nextBillingDate: formattedNextBillingDate
          });

          results.succeeded++;
          results.logs.push(`✅ PayPal renewal processed $${chargeAmount} for Sub #${sub.id} (${sub.store_name}) in ${storeTimezone}`);
        } else {
          // Free trial rollover or amount 0
          await db.query(`
            UPDATE pos_subscriptions
            SET status = 'active',
                next_billing_date = DATE_ADD(COALESCE(next_billing_date, trial_end, NOW()), INTERVAL ? DAY),
                last_mail_sent_status = 'renewed',
                last_mail_sent_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
          `, [daysToAdd, sub.id]);

          // Send confirmation email
          await sendRenewalConfirmationEmail({
            sub,
            transactionId: `FREE-${Date.now()}`,
            paymentMethod: 'Complimentary / Free Rollover',
            amountCharged: 0,
            nextBillingDate: formattedNextBillingDate
          });

          results.succeeded++;
          results.logs.push(`✅ Rolled over Sub #${sub.id} to active status in ${storeTimezone}`);
        }
      } catch (chargeErr) {
        results.failed++;
        results.logs.push(`❌ Failed to charge Sub #${sub.id}: ${chargeErr.message}`);
        await db.query(`UPDATE pos_subscriptions SET status = 'past_due' WHERE id = ?`, [sub.id]);
      }
    }
  } catch (err) {
    results.logs.push(`Error in processPosRenewals: ${err.message}`);
  }

  return results;
}

// Background Cron Scheduler (Runs every hour on minute 0 to trigger as midnight strikes across user timezones)
function startPosRenewalScheduler() {
  cron.schedule('0 * * * *', async () => {
    console.log(`\n🔄 [POS Renewal Cron] Hourly check for subscriptions due at midnight in merchant timezones (${new Date().toISOString()})`);
    await processPosRenewals();
  });

  console.log('✅ [POS Cron] Automated hourly global timezone subscription renewal scheduler started (0 * * * *)');
}

module.exports = {
  processPosRenewals,
  startPosRenewalScheduler,
  sendRenewalConfirmationEmail,
  resolveStoreTimezone,
  getStoreLocalDateTime,
  handleRenewalsEndpoint: async (req, res) => {
    const forceAll = req.query.force === 'true' || req.body.force === true;
    const report = await processPosRenewals({ forceAll });
    return res.json({ status: true, report });
  },
  sendTestRenewalEmailEndpoint: async (req, res) => {
    const { email, amount = '768.00', plan_name = 'Professional', billing_cycle = 'annual', payment_method = 'Credit / Debit Card (Stripe)' } = req.body;
    if (!email) {
      return res.status(400).json({ status: false, message: 'Recipient email is required.' });
    }

    const mockSub = {
      id: 9999,
      store_name: 'Apex Supermart 612',
      admin_firstname: 'Store',
      admin_lastname: 'Owner',
      admin_name: 'Store Owner',
      admin_email: email,
      plan_name: plan_name,
      billing_cycle: billing_cycle,
      amount: amount,
      currency: 'USD'
    };

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (billing_cycle === 'annual' ? 365 : 30));

    const result = await sendRenewalConfirmationEmail({
      sub: mockSub,
      transactionId: `pi_test_${Date.now()}`,
      paymentMethod: payment_method,
      amountCharged: amount,
      nextBillingDate: formatDate(nextDate)
    });

    return res.json({ status: true, message: 'Test renewal invoice email dispatched', result });
  }
};
