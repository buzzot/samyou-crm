const crypto = require('crypto');

// "Sign in with Airtable" — OAuth2 + PKCE. This is only used to confirm a
// person's real Airtable identity (email) and to read their permission
// level on this base, so the app can assign a role. All actual CRM data
// reads/writes still go through the app's own Airtable Personal Access
// Token (services/airtableClient.js) — the per-user OAuth token is used
// transiently during login and is never stored.

const AUTHORIZE_URL = 'https://airtable.com/oauth2/v1/authorize';
const TOKEN_URL = 'https://airtable.com/oauth2/v1/token';
const WHOAMI_URL = 'https://api.airtable.com/v0/meta/whoami';
const LIST_BASES_URL = 'https://api.airtable.com/v0/meta/bases';

const SCOPES = 'data.records:read data.records:write schema.bases:read user.email:read';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function generateState() {
  return base64url(crypto.randomBytes(16));
}

function clientId() {
  const id = process.env.AIRTABLE_OAUTH_CLIENT_ID;
  if (!id || id.startsWith('your-')) {
    throw new Error('AIRTABLE_OAUTH_CLIENT_ID is not set. Register an OAuth integration in Airtable’s Developer Hub and add the Client ID to .env.');
  }
  return id;
}

function clientSecret() {
  const secret = process.env.AIRTABLE_OAUTH_CLIENT_SECRET;
  if (!secret || secret.startsWith('your-')) {
    throw new Error('AIRTABLE_OAUTH_CLIENT_SECRET is not set in .env.');
  }
  return secret;
}

function redirectUri() {
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  return `${base.replace(/\/+$/, '')}/auth/airtable/callback`;
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken({ code, codeVerifier }) {
  const basicAuth = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: clientId(),
    code_verifier: codeVerifier
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`
    },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable token exchange failed (${res.status}): ${text}`);
  }
  return res.json(); // { access_token, refresh_token, token_type, expires_in, scope, ... }
}

async function getWhoami(accessToken) {
  const res = await fetch(WHOAMI_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not verify your Airtable identity (${res.status}): ${text}`);
  }
  return res.json(); // { id, email, scopes }
}

/**
 * Returns the signed-in user's permission level on a given base
 * ('owner' | 'create' | 'edit' | 'comment' | 'read' | 'none'/absent),
 * straight from Airtable's own access control — no app-side role table.
 */
async function getBasePermissionLevel(accessToken, baseId) {
  const res = await fetch(LIST_BASES_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not read your Airtable base access (${res.status}): ${text}`);
  }
  const data = await res.json();
  const base = (data.bases || []).find((b) => b.id === baseId);
  return base ? base.permissionLevel : null;
}

function roleFromPermissionLevel(level) {
  if (level === 'owner') return 'Admin';
  if (level === 'create' || level === 'edit') return 'Manager';
  if (level === 'comment' || level === 'read') return 'Sales';
  return null; // no access to this base at all
}

module.exports = {
  generatePkce,
  generateState,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getWhoami,
  getBasePermissionLevel,
  roleFromPermissionLevel
};
