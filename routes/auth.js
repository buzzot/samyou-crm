const express = require('express');
const router = express.Router();
const airtableAuth = require('../services/airtableAuth');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'buzzardontree@gmail.com').toLowerCase();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: req.query.error || null, layout: false });
});

// Step 1: send the user to Airtable's own login/consent screen. Airtable
// verifies the password, not this app — we never see it.
router.get('/auth/airtable/login', (req, res) => {
  try {
    const { verifier, challenge } = airtableAuth.generatePkce();
    const state = airtableAuth.generateState();
    req.session.oauth = { verifier, state };
    const url = airtableAuth.buildAuthorizeUrl({ state, codeChallenge: challenge });
    res.redirect(url);
  } catch (err) {
    res.render('login', { error: err.message, layout: false });
  }
});

// Step 2: Airtable redirects back here with a code. Exchange it, look up
// the signed-in user's email and their permission level on this base
// (straight from Airtable's own access control), and derive a role.
router.get('/auth/airtable/callback', async (req, res) => {
  const pending = req.session.oauth;
  req.session.oauth = null;

  try {
    const { code, state, error, error_description } = req.query;
    if (error) throw new Error(error_description || error);
    if (!pending || !state || state !== pending.state) {
      throw new Error('Login session expired or invalid. Please try signing in again.');
    }
    if (!code) throw new Error('Airtable did not return an authorization code.');

    const token = await airtableAuth.exchangeCodeForToken({ code, codeVerifier: pending.verifier });
    const who = await airtableAuth.getWhoami(token.access_token);
    if (!who.email) {
      throw new Error('Airtable did not share your email address. Make sure the OAuth integration has the user.email:read scope.');
    }

    const email = who.email.toLowerCase();
    let role;
    if (email === ADMIN_EMAIL) {
      role = 'Admin';
    } else {
      const baseId = require('../config/schema').baseId;
      const level = await airtableAuth.getBasePermissionLevel(token.access_token, baseId);
      role = airtableAuth.roleFromPermissionLevel(level);
    }

    if (!role) {
      throw new Error('Your Airtable account does not have access to this base, so it can\'t be granted access here.');
    }

    req.session.user = { email, name: who.name || email, role };
    res.redirect('/');
  } catch (err) {
    res.redirect(`/login?error=${encodeURIComponent(err.message)}`);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
