const https = require('https');
const nodemailer = require('nodemailer');

const ZEPTO_URL = 'api.zeptomail.com';
const ZEPTO_TOKEN = 'Zoho-enczapikey wSsVR61//UbyX/wryDaudrhsmgsAVF31Rk9721WiuHeqGvGQocc6kRfGBg+mTvQaRW5gF2RH8LkonBgE0TMG2o8lzlsBXCiF9mqRe1U4J3x17qnvhDzKXWlYkxaMJYMOxAtsm2djFs8l+g==';

async function sendPosMail({ to, subject, html, attachments = [] }) {
  // 1. Try ZeptoMail API (Verified production token from webstore)
  try {
    const payload = {
      from: {
        address: 'sales@thrivewoo.com',
        name: 'ThriveWoo POS'
      },
      to: [{
        email_address: {
          address: to,
          name: ''
        }
      }],
      subject,
      htmlbody: html
    };

    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        name: att.filename || 'attachment',
        content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content).toString('base64'),
        mime_type: att.contentType || 'application/octet-stream'
      }));
    }

    const postData = JSON.stringify(payload);

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: ZEPTO_URL,
        path: '/v1.1/email',
        method: 'POST',
        headers: {
          'Authorization': ZEPTO_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, service: 'zeptomail', response: body });
          } else {
            reject(new Error(`ZeptoMail HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    console.log(`📧 [POS Mail] Successfully sent via ZeptoMail to ${to}: "${subject}"`);
    return result;
  } catch (zeptoErr) {
    console.warn(`⚠️ [POS Mail] ZeptoMail delivery error (${zeptoErr.message}), falling back...`);
    return { success: false, error: zeptoErr.message };
  }
}

module.exports = {
  sendPosMail
};
