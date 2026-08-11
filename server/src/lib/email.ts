import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

// SMTP credentials are optional (see env.ts) - when they're not configured
// (a fresh checkout, CI, etc.) this falls back to a disposable Ethereal test
// account (https://ethereal.email) instead of failing to start. Ethereal
// never delivers to a real inbox; it just gives back a preview URL, which is
// logged so the whole flow can still be exercised end-to-end without real
// credentials. The real account's SMTP details are supplied via env vars in
// whatever's actually deploying (Vercel).
let transporterPromise: Promise<Transporter> | null = null;
let usingEthereal = false;

async function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      return nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
      });
    }

    usingEthereal = true;
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  })();

  return transporterPromise;
}

export async function sendVerificationEmail(to: string, token: string) {
  const transporter = await getTransporter();
  const verifyUrl = `${env.APP_URL}/verify-email/${token}`;

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Verify your Mindflow email address',
    text: `Confirm your email to finish setting up your Mindflow account:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `
      <p>Confirm your email to finish setting up your Mindflow account.</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="color:#888">This link expires in 24 hours.</p>
    `
  });

  if (usingEthereal) {
    // No real inbox to check in this mode - the preview URL is the only way
    // to see what would have been sent.
    console.log('[email] Ethereal test mode - preview:', nodemailer.getTestMessageUrl(info));
  }
}

// Both fields here are user-editable (task/map name), unlike
// sendVerificationEmail's server-generated token/URL - escape before
// interpolating into HTML so a task or map named with markup can't render
// as live HTML (links, styling, etc.) in the assignee's inbox.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendTaskAssignmentEmail(to: string, taskName: string, mapName: string) {
  const transporter = await getTransporter();
  const safeTaskName = escapeHtml(taskName);
  const safeMapName = escapeHtml(mapName);

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `You've been assigned "${taskName}" in ${mapName}`,
    text: `You've been assigned a task in the Mindflow map "${mapName}":\n\n${taskName}\n\n${env.APP_URL}`,
    html: `
      <p>You've been assigned a task in the Mindflow map <strong>${safeMapName}</strong>:</p>
      <p style="font-size: 1.1em"><strong>${safeTaskName}</strong></p>
      <p><a href="${env.APP_URL}">${env.APP_URL}</a></p>
    `
  });

  if (usingEthereal) {
    console.log('[email] Ethereal test mode - preview:', nodemailer.getTestMessageUrl(info));
  }
}

export async function sendDueSoonEmail(to: string, taskName: string, mapName: string, dueDate: Date) {
  const transporter = await getTransporter();
  const safeTaskName = escapeHtml(taskName);
  const safeMapName = escapeHtml(mapName);
  const dueDateText = dueDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Due soon: "${taskName}" in ${mapName}`,
    text: `A task assigned to you is due soon, in the Mindflow map "${mapName}":\n\n${taskName}\nDue ${dueDateText}\n\n${env.APP_URL}`,
    html: `
      <p>A task assigned to you is due soon, in the Mindflow map <strong>${safeMapName}</strong>:</p>
      <p style="font-size: 1.1em"><strong>${safeTaskName}</strong></p>
      <p>Due ${dueDateText}</p>
      <p><a href="${env.APP_URL}">${env.APP_URL}</a></p>
    `
  });

  if (usingEthereal) {
    console.log('[email] Ethereal test mode - preview:', nodemailer.getTestMessageUrl(info));
  }
}

export async function sendReminderEmail(to: string, title: string, note: string | null, remindAt: Date) {
  const transporter = await getTransporter();
  const safeTitle = escapeHtml(title);
  const safeNote = note ? escapeHtml(note) : null;
  const whenText = remindAt.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Reminder: ${title}`,
    text: `${title}\n${whenText}${note ? `\n\n${note}` : ''}\n\n${env.APP_URL}`,
    html: `
      <p style="font-size: 1.1em"><strong>${safeTitle}</strong></p>
      <p>${whenText}</p>
      ${safeNote ? `<p>${safeNote}</p>` : ''}
      <p><a href="${env.APP_URL}">${env.APP_URL}</a></p>
    `
  });

  if (usingEthereal) {
    console.log('[email] Ethereal test mode - preview:', nodemailer.getTestMessageUrl(info));
  }
}
