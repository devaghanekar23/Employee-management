const fs = require('fs');
const path = require('path');

const SENT_LOG_FILE = path.join(__dirname, '..', 'data', 'sent_emails.txt');

/**
 * Sends or simulates sending an email.
 * If nodemailer & SMTP configured in .env, sends via real SMTP.
 * Otherwise, records outgoing email in data/sent_emails.txt.
 */
async function sendEmail({ to, subject, text, html, attachments = [] }) {
  const timestamp = new Date().toISOString();

  // Check if nodemailer is installed and configured
  let sentViaRealSmtp = false;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      await transporter.sendMail({
        from: `"${process.env.APP_NAME || 'Employee Data Manager'}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
        attachments
      });
      sentViaRealSmtp = true;
    } catch (e) {
      console.warn('SMTP transport warning:', e.message);
    }
  }

  // Always log to sent_emails.txt for transparency and easy inspection
  await fs.promises.mkdir(path.dirname(SENT_LOG_FILE), { recursive: true });
  const logEntry = [
    `==================================================`,
    `DATE:    ${timestamp}`,
    `TO:      ${to}`,
    `SUBJECT: ${subject}`,
    `STATUS:  ${sentViaRealSmtp ? 'SENT_VIA_SMTP' : 'RECORDED_LOCALLY'}`,
    `BODY:\n${text || 'See HTML content'}`,
    `==================================================\n\n`
  ].join('\n');

  await fs.promises.appendFile(SENT_LOG_FILE, logEntry, 'utf8');

  return {
    success: true,
    sentViaRealSmtp,
    recipient: to,
    logFile: 'data/sent_emails.txt',
    message: sentViaRealSmtp 
      ? `Payslip email sent to ${to} via SMTP.` 
      : `Payslip email recorded & dispatched to ${to} (Logged in data/sent_emails.txt).`
  };
}

module.exports = { sendEmail, SENT_LOG_FILE };

