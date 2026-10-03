const db = require('../config/db');
const ejs = require('ejs');
const path = require('path');
const cron = require('node-cron');
const { sendPosMail } = require('../services/posEmailService');
const { resolveStoreTimezone, getStoreLocalDateTime } = require('./posTrialEndController');

const emailViewsDir = path.join(__dirname, '..', 'views', 'email');

// Helper: send subscription reminder/expired email
async function sendExpiryEmail(sub, daysLeft, status) {
  try {
    const templatePath = path.join(emailViewsDir, 'subscription_expiry_mail.ejs');
    const expiryDateFormatted = sub.effective_end_date 
      ? new Date(sub.effective_end_date).toLocaleDateString('en-GB')
      : 'N/A';

    const html = await ejs.renderFile(templatePath, {
      name: `${sub.admin_firstname || ''} ${sub.admin_lastname || ''}`.trim() || sub.admin_name || 'Store Owner',
      store_name: sub.store_name,
      plan_name: sub.plan_name,
      billing_cycle: sub.billing_cycle === 'annual' ? 'Annual' : 'Monthly',
      amount: sub.amount,
      currency: sub.currency || 'USD',
      days_left: daysLeft,
      end_date: expiryDateFormatted,
      status: status,
      login_url: 'http://localhost:5000/login'
    });

    let subject;
    const planTitle = sub.plan_name.charAt(0).toUpperCase() + sub.plan_name.slice(1);
    if (status === 'expired') {
      subject = `Your ThriveWoo POS Account for ${planTitle} plan has expired`;
    } else if (status === 'expiring') {
      subject = `Reminder: ${planTitle} plan for ThriveWoo POS is expiring today`;
    } else if (status === 'expiring_tomorrow') {
      subject = `Reminder: ${planTitle} plan for ThriveWoo POS is expiring tomorrow`;
    } else {
      subject = `Reminder: ${planTitle} plan for ThriveWoo POS expires in ${daysLeft} days`;
    }

    const sendRes = await sendPosMail({
      to: sub.admin_email,
      subject,
      html
    });

    // Mark last sent status in DB to prevent duplicate emails on same day
    await db.query(`
      UPDATE pos_subscriptions
      SET last_mail_sent_status = ?,
          last_mail_sent_at = NOW()
      WHERE id = ?
    `, [status, sub.subscription_id]);

    return { success: true, email: sub.admin_email, status, subject };
  } catch (err) {
    console.error(`❌ [POS Mail] Error sending expiry email to ${sub.admin_email}:`, err.message);
    return { success: false, email: sub.admin_email, error: err.message };
  }
}

// Helper: send trial ending reminder email
async function sendTrialReminderEmail(sub, daysLeft) {
  try {
    const templatePath = path.join(emailViewsDir, 'trial_reminder_mail.ejs');
    const expiryDateFormatted = sub.effective_end_date 
      ? new Date(sub.effective_end_date).toLocaleDateString('en-GB')
      : 'N/A';

    const html = await ejs.renderFile(templatePath, {
      name: `${sub.admin_firstname || ''} ${sub.admin_lastname || ''}`.trim() || sub.admin_name || 'Store Owner',
      store_name: sub.store_name,
      plan_name: sub.plan_name,
      amount: sub.amount,
      currency: sub.currency || 'USD',
      days_left: daysLeft,
      end_date: expiryDateFormatted,
      login_url: 'http://localhost:5000/login'
    });

    const subject = daysLeft === 1
      ? 'Final Reminder: Your ThriveWoo POS Trial ends tomorrow (Payment will be auto-debited)'
      : `Reminder: Your ThriveWoo POS Trial ends in ${daysLeft} days (Payment will be auto-debited)`;

    const sendRes = await sendPosMail({
      to: sub.admin_email,
      subject,
      html
    });

    await db.query(`
      UPDATE pos_subscriptions
      SET last_mail_sent_status = ?,
          last_mail_sent_at = NOW()
      WHERE id = ?
    `, [`trial_reminder_${daysLeft}d`, sub.subscription_id]);

    return { success: true, email: sub.admin_email, status: 'trial_reminder', subject };
  } catch (err) {
    console.error(`❌ [POS Mail] Error sending trial reminder to ${sub.admin_email}:`, err.message);
    return { success: false, email: sub.admin_email, error: err.message };
  }
}

// Main Routine: Check and Send Plan Expiry and Trial Reminders
async function checkAndSendPosEmails() {
  console.log('🔄 [POS Mail Engine] Checking subscriptions for expiration and reminders...');
  const report = {
    timestamp: new Date().toISOString(),
    checked: 0,
    sent: 0,
    skipped: 0,
    details: []
  };

  try {
    const querySql = `
      SELECT 
        s.id AS subscription_id, s.company_id, s.admin_id, s.store_name, s.admin_email,
        s.plan_name, s.billing_cycle, s.amount, s.currency, s.status,
        s.trial_start, s.trial_end, s.next_billing_date,
        s.mail_send, s.last_mail_sent_status, s.last_mail_sent_at,
        COALESCE(s.next_billing_date, s.trial_end) AS effective_end_date,
        u.name AS admin_name, u.admin_firstname, u.admin_lastname, u.country AS admin_country,
        c.time_zone AS company_timezone, c.country AS company_country
      FROM pos_subscriptions s
      JOIN admin_info u ON s.admin_id = u.id_admin
      LEFT JOIN company c ON s.company_id = c.id
      WHERE s.mail_send = 0
        AND s.status IN ('active', 'trialing', 'past_due')
    `;

    const subs = await db.query(querySql);
    report.checked = subs.length;

    for (const sub of subs) {
      if (!sub.effective_end_date) continue;

      // Determine the store's local calendar day based on their country & timezone
      const storeTimezone = resolveStoreTimezone(sub.company_timezone, sub.company_country || sub.admin_country);
      const storeLocal = getStoreLocalDateTime(storeTimezone);
      const today = new Date(storeLocal.dateStr + 'T00:00:00');

      const endDate = new Date(sub.effective_end_date);
      const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      const daysLeft = Math.round((endDay - today) / (1000 * 60 * 60 * 24));

      // 1. Paid / Active Subscriptions Expiry Checks
      if (sub.status === 'active' || sub.status === 'past_due') {
        if (daysLeft < 0) {
          // Has expired
          if (sub.last_mail_sent_status !== 'expired') {
            console.log(`⚠️ [POS Mail] Subscription #${sub.subscription_id} (${sub.admin_email}) expired ${Math.abs(daysLeft)} days ago. Sending expiry email.`);
            const res = await sendExpiryEmail(sub, 0, 'expired');
            report.details.push(res);
            report.sent++;
          } else {
            report.skipped++;
          }
        } else if (daysLeft === 0) {
          // Expiring today
          if (sub.last_mail_sent_status !== 'expiring') {
            console.log(`⏳ [POS Mail] Subscription #${sub.subscription_id} (${sub.admin_email}) expires today. Sending notification.`);
            const res = await sendExpiryEmail(sub, 0, 'expiring');
            report.details.push(res);
            report.sent++;
          } else {
            report.skipped++;
          }
        } else if (daysLeft === 1) {
          // Expiring tomorrow
          if (sub.last_mail_sent_status !== 'expiring_tomorrow') {
            console.log(`📬 [POS Mail] Subscription #${sub.subscription_id} (${sub.admin_email}) expires tomorrow. Sending notice.`);
            const res = await sendExpiryEmail(sub, 1, 'expiring_tomorrow');
            report.details.push(res);
            report.sent++;
          } else {
            report.skipped++;
          }
        } else if ([90, 45, 22, 11, 5].includes(daysLeft)) {
          // Interval milestone reminder
          const statusKey = `reminder_${daysLeft}d`;
          if (sub.last_mail_sent_status !== statusKey) {
            console.log(`📬 [POS Mail] Subscription #${sub.subscription_id} (${sub.admin_email}) ends in ${daysLeft} days. Sending advance reminder.`);
            const res = await sendExpiryEmail(sub, daysLeft, 'reminder');
            report.details.push(res);
            report.sent++;
          } else {
            report.skipped++;
          }
        }
      }

      // 2. Free Trial Reminders (7-day and 1-day advance warnings)
      else if (sub.status === 'trialing') {
        if (daysLeft === 7 || daysLeft === 1) {
          const statusKey = `trial_reminder_${daysLeft}d`;
          if (sub.last_mail_sent_status !== statusKey) {
            console.log(`📬 [POS Mail] Trial for Sub #${sub.subscription_id} (${sub.admin_email}) ends in ${daysLeft} days. Sending trial reminder.`);
            const res = await sendTrialReminderEmail(sub, daysLeft);
            report.details.push(res);
            report.sent++;
          } else {
            report.skipped++;
          }
        }
      }
    }

    console.log(`✅ [POS Mail Engine] Check completed: ${report.sent} sent, ${report.skipped} skipped out of ${report.checked} checked.`);
  } catch (err) {
    console.error('❌ [POS Mail Engine] Expiry check error:', err.message);
    report.error = err.message;
  }

  return report;
}

// Background Cron Scheduler (Runs every hour on minute 0 so notifications dispatch aligned with merchant local midnight)
function startPosEmailScheduler() {
  cron.schedule('0 * * * *', async () => {
    console.log(`\n🔔 [Cron] Running automated hourly POS subscription expiry email check at ${new Date().toISOString()}`);
    await checkAndSendPosEmails();
  });

  console.log('✅ [POS Cron] Hourly automated global timezone email scheduler started (0 * * * *)');
}

module.exports = {
  checkAndSendPosEmails,
  startPosEmailScheduler,
  sendExpiryEmail,

  // Manual HTTP API Trigger endpoint
  triggerExpiryCheckEndpoint: async (req, res) => {
    const report = await checkAndSendPosEmails();
    return res.json({ status: true, report });
  },

  // Test Email Endpoint (send sample expiry or reminder email)
  sendTestEmailEndpoint: async (req, res) => {
    const { email, status = 'expired' } = req.body;
    if (!email) {
      return res.status(400).json({ status: false, message: 'Recipient email is required.' });
    }

    const mockSub = {
      subscription_id: 9999,
      store_name: 'Sample Retail Mart',
      admin_firstname: 'Store',
      admin_lastname: 'Manager',
      admin_name: 'Store Manager',
      admin_email: email,
      plan_name: 'Professional',
      billing_cycle: 'annual',
      amount: '768.00',
      currency: 'USD',
      effective_end_date: new Date()
    };

    const result = await sendExpiryEmail(mockSub, 0, status);
    return res.json({ status: true, message: 'Test email dispatched', result });
  }
};
