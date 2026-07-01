'use strict';

const express = require('express');
const crypto  = require('crypto');
const crm     = require('../services/crm');

const router = express.Router();

/**
 * Verify a Mailgun webhook signature.
 * Mailgun signs each request as:
 *   HMAC-SHA256(signingKey, timestamp + token) === signature
 */
function verifyMailgun(timestamp, token, signature) {
  const key = process.env.MAILGUN_WEBHOOK_KEY;
  if (!key) {
    console.warn('[webhook/email] MAILGUN_WEBHOOK_KEY not set — skipping signature verification');
    return true;
  }
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(timestamp + token);
  const expected = hmac.digest('hex');
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Extract the Airtable project record ID from the recipient address.
 * Expected format: project-recXXXXXXXXXXXXXX@mg.samyoucrm.com
 */
function extractProjectId(recipient) {
  if (!recipient) return null;
  const match = recipient.match(/project-(rec[A-Za-z0-9]+)@/i);
  return match ? match[1] : null;
}

/**
 * POST /webhooks/email
 * Mailgun inbound route — receives client email replies and saves them
 * to the project's comment thread in Airtable.
 *
 * This route must be registered BEFORE the requireAuth middleware
 * because Mailgun calls it without a session cookie.
 */
router.post('/webhooks/email', async (req, res) => {
  // Respond 200 immediately — Mailgun retries on anything else.
  res.status(200).send('OK');

  const {
    recipient,
    sender,
    from,
    subject,
    timestamp,
    token,
    signature
  } = req.body;

  // Body: prefer stripped-text (no quoted history) then plain
  const body = (req.body['stripped-text'] || req.body['body-plain'] || '').trim();

  // Verify authenticity
  if (!verifyMailgun(timestamp || '', token || '', signature || '')) {
    console.warn('[webhook/email] Signature mismatch — request ignored');
    return;
  }

  // Locate the target project
  const projectId = extractProjectId(recipient);
  if (!projectId) {
    console.warn('[webhook/email] Could not extract project ID from recipient:', recipient);
    return;
  }

  const emailSubject = (subject || '(no subject)').trim();
  const emailFrom    = sender || from || 'unknown@email.com';
  const emailBody    = body || '(no content)';

  try {
    await crm.addProjectComment({
      projectId,
      author:  emailFrom,
      comment: emailBody,
      // EMAILSUBJ: prefix signals to mapTaskComment that this is an inbound email
      link: `EMAILSUBJ:${emailSubject}`
    });
    console.log(`[webhook/email] Saved email from ${emailFrom} → project ${projectId} | subject: ${emailSubject}`);
  } catch (err) {
    console.error('[webhook/email] Failed to save email to Airtable:', err.message || err);
  }
});

module.exports = router;
