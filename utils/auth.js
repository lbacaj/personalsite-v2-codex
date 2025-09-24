const crypto = require('crypto');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_COOKIE = 'admin_session';
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || 'unsubscribe-secret';

function verifyAdminToken(token) {
  if (!token || !ADMIN_TOKEN) {
    return false;
  }
  const expected = crypto.createHash('sha256').update(ADMIN_TOKEN).digest('hex');
  const provided = crypto.createHash('sha256').update(token).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function getAdminTokenFromRequest(req) {
  const authHeader = req.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (req.cookies?.[ADMIN_COOKIE]) {
    return req.cookies[ADMIN_COOKIE];
  }
  return null;
}

function adminMiddleware(req, res, next) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    const accepts = req.accepts(['html', 'json']);
    if (accepts === 'html') {
      return res.redirect('/admin/login');
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.isAdmin = true;
  return next();
}

function setAdminSession(res, token) {
  if (!verifyAdminToken(token)) {
    throw new Error('Invalid admin token');
  }
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function clearAdminSession(res) {
  res.clearCookie(ADMIN_COOKIE);
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const padLength = 4 - (input.length % 4 || 4);
  const padded = `${input}${'='.repeat(padLength % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function generateUnsubscribeToken(email) {
  const emailNormalized = email.trim().toLowerCase();
  const signature = crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(emailNormalized)
    .digest('base64url');
  return `${base64UrlEncode(emailNormalized)}.${signature}`;
}

function verifyUnsubscribeToken(token) {
  if (!token) {
    return null;
  }
  const [encodedEmail, signature] = token.split('.');
  if (!encodedEmail || !signature) {
    return null;
  }
  const email = base64UrlDecode(encodedEmail).trim().toLowerCase();
  const expected = crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(email)
    .digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return email;
}

module.exports = {
  verifyAdminToken,
  adminMiddleware,
  setAdminSession,
  clearAdminSession,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  getAdminTokenFromRequest,
};
