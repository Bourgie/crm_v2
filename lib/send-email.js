const { encryptValue, decryptValue, isEncrypted } = require('./crypto-utils');

function getNodemailer() {
  try { return require('nodemailer') } catch (e) { return null }
}

function getNotificationSMTP() {
  return {
    host: process.env.SMTP_HOST || process.env.NOTIFY_SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || process.env.NOTIFY_SMTP_PORT) || 465,
    user: process.env.SMTP_USER || process.env.NOTIFY_SMTP_USER,
    pass: process.env.SMTP_PASS || process.env.NOTIFY_SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.NOTIFY_SMTP_FROM || 'noreply@unfulanodev.com.ar',
    to: process.env.LEAD_NOTIFICATION_EMAIL || process.env.NOTIFY_EMAIL_TO,
  }
}

function getTenantSMTP(db) {
  try {
    const cfg = db.getConfig();
    return {
      host: cfg.smtp_host,
      port: parseInt(cfg.smtp_port) || 465,
      user: cfg.smtp_user,
      pass: cfg.smtp_pass,
      from: cfg.smtp_from || 'noreply@unfulanodev.com.ar',
      configured: !!(cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass),
    }
  } catch {
    return { configured: false }
  }
}

async function sendEmail(host, port, smtpUser, smtpPass, from, to, subject, html, attachments) {
  const nodemailer = getNodemailer();
  if (!nodemailer) throw new Error('nodemailer not installed');
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  const mailOpts = { from, to, subject, html };
  if (attachments && attachments.length > 0) mailOpts.attachments = attachments;
  return transporter.sendMail(mailOpts);
}

async function sendNotificationEmail(to, subject, html) {
  const smtp = getNotificationSMTP();
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.to) {
    console.log('[Email] SMTP de notificaciones no configurado. Saltando.');
    return null;
  }
  return sendEmail(smtp.host, smtp.port, smtp.user, smtp.pass, smtp.from, smtp.to, subject, html);
}

async function sendTenantEmail(db, to, subject, html) {
  const smtp = getTenantSMTP(db);
  if (!smtp.configured) {
    console.log('[Email] SMTP no configurado para esta empresa.');
    return null;
  }
  return sendEmail(smtp.host, smtp.port, smtp.user, smtp.pass, smtp.from, to, subject, html);
}

function buildNotificationHtml(title, message, details, actionLink) {
  return `<html><body style="font-family:Arial,Helvetica,sans-serif;background:#f8f9fa;padding:30px">
<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="padding:30px">
<div style="text-align:center;margin-bottom:20px">
  <span style="font-size:28px;font-weight:800;color:#F97316">FlexCRM</span>
</div>
<h2 style="font-size:18px;color:#1f2937;margin:0 0 12px">${title}</h2>
<p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px">${message}</p>
${details ? `<table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin:0 0 20px">
${details.split('\n').filter(Boolean).map(d => `<tr><td style="padding:4px 0;font-size:13px;color:#374151">${d}</td></tr>`).join('')}
</table>` : ''}
${actionLink ? `<table cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="${actionLink}" style="display:inline-block;padding:12px 32px;background:#F97316;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px">Ver en FlexCRM</a>
</td></tr></table>` : ''}
</td></tr></table></body></html>`;
}

module.exports = { sendEmail, sendNotificationEmail, sendTenantEmail, buildNotificationHtml, getNotificationSMTP, getTenantSMTP };
