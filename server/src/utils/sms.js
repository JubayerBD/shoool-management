/**
 * Pluggable SMS sender. Provider chosen via SMS_PROVIDER:
 *   - "log"     (default) — logs the message, never sends. Great for dev.
 *   - "twilio"  — lazy-loads the twilio package (install it when using this).
 *   - "webhook" — POSTs { to, message } to SMS_WEBHOOK_URL (generic gateway).
 *
 * sendSms never throws to the caller — failures are logged.
 */
const PROVIDER = process.env.SMS_PROVIDER || 'log';

async function sendViaTwilio(to, message) {
  let twilioMod;
  try {
    twilioMod = await import('twilio');
  } catch {
    throw new Error('SMS_PROVIDER=twilio requires the "twilio" package. Run: npm i twilio');
  }
  const client = twilioMod.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const from = process.env.TWILIO_FROM;
  await Promise.all(
    to.map((num) => client.messages.create({ to: num, from, body: message }))
  );
}

async function sendViaWebhook(to, message) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url) throw new Error('SMS_WEBHOOK_URL is not set');
  await Promise.all(
    to.map((num) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: num, message }),
      })
    )
  );
}

/**
 * @param {string[]} to        Recipient phone numbers.
 * @param {string} message     Text body.
 */
export async function sendSms(to, message) {
  const numbers = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!numbers.length) return;
  try {
    if (PROVIDER === 'twilio') {
      await sendViaTwilio(numbers, message);
      // eslint-disable-next-line no-console
      console.log(`[sms] sent to ${numbers.length} number(s) via twilio`);
    } else if (PROVIDER === 'webhook') {
      await sendViaWebhook(numbers, message);
      // eslint-disable-next-line no-console
      console.log(`[sms] sent to ${numbers.length} number(s) via webhook`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[sms] (dev) would send to ${numbers.join(', ')}: "${message}"`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[sms] send failed:', err.message);
  }
}

export const smsProvider = PROVIDER;
