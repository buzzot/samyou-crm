// Outbound transactional email via Resend (https://resend.com). This is a
// separate concern from services/email.js, which only browses an existing
// IMAP mailbox — sending requires its own API and credentials.

const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/**
 * Sends a "you've been assigned a task" email to the assignee. Silently
 * no-ops (with a console warning) if Resend isn't configured yet, so local
 * development without an API key doesn't crash the assignment flow.
 */
async function sendAssignmentEmail({ to, taskName, projectName, assignedByName, taskUrl }) {
  if (!to) return { skipped: true, reason: 'No recipient email.' };
  if (!isConfigured()) {
    console.warn('[notifications] RESEND_API_KEY/RESEND_FROM_EMAIL not set — skipping assignment email to', to);
    return { skipped: true, reason: 'Resend not configured.' };
  }

  const subjectLine = `You've been assigned: ${taskName || 'a task'}`;
  const lines = [
    `<p>Hi,</p>`,
    `<p><strong>${escapeHtml(assignedByName || 'Someone')}</strong> assigned you a task${projectName ? ` on <strong>${escapeHtml(projectName)}</strong>` : ''}:</p>`,
    `<p style="font-size:1.1em;"><strong>${escapeHtml(taskName || '(untitled)')}</strong></p>`,
    taskUrl ? `<p><a href="${escapeHtml(taskUrl)}">View task</a></p>` : ''
  ].filter(Boolean).join('\n');

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject: subjectLine,
      html: lines
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend email failed (${res.status}): ${body}`);
  }

  return res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { isConfigured, sendAssignmentEmail };
