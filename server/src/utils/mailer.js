import nodemailer from 'nodemailer';

let transporter;

/**
 * Build (once) the mail transport. If SMTP_HOST is configured a real SMTP
 * transport is used; otherwise a JSON transport is used which "sends" by
 * logging the message — handy for development without credentials.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

const isReal = () => Boolean(process.env.SMTP_HOST);

/**
 * Send an email. Never throws to the caller — failures are logged so that
 * notifications can't break the request that triggered them.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to || (Array.isArray(to) && to.length === 0)) return;
  const from = process.env.MAIL_FROM || 'School Management <no-reply@school.local>';
  try {
    const info = await getTransporter().sendMail({ from, to, subject, text, html });
    if (!isReal()) {
      // Dev transport: show what would have been sent.
      // eslint-disable-next-line no-console
      console.log(`[mail] (dev) would send "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[mail] sent "${subject}" (id ${info.messageId})`);
    }
    return info;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mail] send failed:', err.message);
    return null;
  }
}

export const mailerIsConfigured = isReal;
