import { config, smtpConfigured } from '../config.js';
import type { Database, Sql } from '../db/index.js';
import { logger } from './logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: import('nodemailer').Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigured) return null;
  const nodemailer = await import('nodemailer');
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailLayout(options: {
  preheader?: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
}): string {
  const preheader = options.preheader ? escapeHtml(options.preheader) : '';
  const cta = options.cta
    ? `<p style="margin:32px 0 8px"><a href="${escapeHtml(options.cta.url)}" style="background:#002560;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(
        options.cta.label,
      )}</a></p>
       <p style="color:#64748b;font-size:12px;word-break:break-all;margin:16px 0 0">${
         options.cta.label
       } link: ${escapeHtml(options.cta.url)}</p>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#002560;padding:22px 28px">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Nile Mart</span>
          <span style="color:#c8a24a;font-size:20px;font-weight:700">.</span>
        </td></tr>
        <tr><td style="padding:32px 28px 28px">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#002560">${escapeHtml(
            options.heading,
          )}</h1>
          <div style="font-size:15px;line-height:1.65;color:#334155">${options.body}</div>
          ${cta}
        </td></tr>
        <tr><td style="padding:20px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">
          Nile Mart Trading PLC - Bole Road, Addis Ababa, Ethiopia<br>
          Questions? Reply to this email or contact support@nilemart.et.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Queues the message in the outbox and sends it when SMTP is configured.
 * Without SMTP the message stays queued and its content is logged so local
 * development can continue (verification links are surfaced in dev responses).
 */
export async function sendEmail(db: Database | Sql, message: MailMessage): Promise<void> {
  const inserted = await db.query<{ id: string }>(
    `insert into email_outbox (to_email, subject, html, text)
     values ($1, $2, $3, $4) returning id`,
    [message.to, message.subject, message.html, message.text],
  );
  const id = inserted.rows[0]?.id;

  const transport = await getTransporter();
  if (!transport) {
    logger.info('Email queued (SMTP not configured)', {
      to: message.to,
      subject: message.subject,
    });
    if (config.isDev) {
      const text = message.text.replace(/\s+/g, ' ').slice(0, 400);
      logger.debug(`Email preview: ${text}`);
    }
    return;
  }

  try {
    await transport.sendMail({
      from: config.smtp.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (id) {
      await db.query(`update email_outbox set status = 'sent', sent_at = now() where id = $1`, [id]);
    }
  } catch (error) {
    logger.error('Failed to send email', { to: message.to, error: String(error) });
    if (id) {
      await db.query(`update email_outbox set status = 'failed', error = $2 where id = $1`, [
        id,
        String(error).slice(0, 500),
      ]);
    }
  }
}
