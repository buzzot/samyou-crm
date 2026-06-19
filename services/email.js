const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const HOST = process.env.IMAP_HOST;
const PORT = Number(process.env.IMAP_PORT || 993);
const USER = process.env.IMAP_USER;
const PASSWORD = process.env.IMAP_PASSWORD;

function isConfigured() {
  return !!(HOST && USER && PASSWORD);
}

async function withClient(fn) {
  if (!isConfigured()) {
    throw new Error('IMAP is not configured. Set IMAP_HOST, IMAP_USER, IMAP_PASSWORD in .env.');
  }
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: USER, pass: PASSWORD },
    logger: false
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Pulls a handful of significant words out of a name/subject string to use
 * as loose match keywords (drops short filler words).
 */
function keywords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
}

/**
 * Searches the Inbox for emails near a given date (+/- dayWindow days) and
 * scores them by how many keywords from `subjectHint` appear in the email
 * subject. Returns the best candidates first.
 */
async function findCandidates({ subjectHint, date, dayWindow = 10, limit = 10 }) {
  const words = keywords(subjectHint);
  const center = date ? new Date(date) : new Date();
  const since = new Date(center.getTime() - dayWindow * 86400000);
  const before = new Date(center.getTime() + (dayWindow + 1) * 86400000);

  return withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ since, before });
      if (!uids || !uids.length) return [];

      const results = [];
      for await (const msg of client.fetch(uids, { envelope: true, uid: true })) {
        const subject = msg.envelope?.subject || '(no subject)';
        const msgDate = msg.envelope?.date || null;
        const from = msg.envelope?.from?.[0]
          ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address || ''}>`.trim()
          : '';
        const messageId = msg.envelope?.messageId || '';

        const subjectLower = subject.toLowerCase();
        const score = words.reduce((sum, w) => sum + (subjectLower.includes(w) ? 1 : 0), 0);

        results.push({ uid: msg.uid, subject, date: msgDate, from, messageId, score });
      }

      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.date || 0) - new Date(a.date || 0);
      });

      return results.slice(0, limit);
    } finally {
      lock.release();
    }
  });
}

/**
 * Strips tags from an HTML fragment to produce a plain-text-ish fallback,
 * only used when a message has no text/plain part.
 */
function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Live, read-only preview: fetches one message's Subject/From/Date/Body by
 * its Message-ID, straight from the Inbox over IMAP. Nothing here is
 * persisted anywhere (not Airtable, not a local cache) — it's fetched fresh
 * on every call, purely to render a preview.
 */
async function getMessageByMessageId(messageId) {
  if (!messageId) {
    throw new Error('No linked email to preview.');
  }
  return withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ header: { 'message-id': messageId } }, { uid: true });
      if (!uids || !uids.length) {
        throw new Error('That email could not be found in the Inbox (it may have been moved or deleted).');
      }
      const { content } = await client.download(uids[0], undefined, { uid: true });
      if (!content) {
        throw new Error('Could not download that email from the server.');
      }
      const parsed = await simpleParser(content);
      return {
        subject: parsed.subject || '(no subject)',
        from: parsed.from?.text || '',
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text || (parsed.html ? stripHtml(parsed.html) : '(no body)')
      };
    } finally {
      lock.release();
    }
  });
}

module.exports = { isConfigured, findCandidates, getMessageByMessageId };
