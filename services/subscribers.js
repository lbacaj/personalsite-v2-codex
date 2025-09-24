const dayjs = require('dayjs');
const db = require('../utils/db');

function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}

function toCsv(tags) {
  if (!tags) {
    return '';
  }
  if (Array.isArray(tags)) {
    return tags.join(',');
  }
  if (typeof tags === 'string') {
    return tags;
  }
  return '';
}

function mergeTags(existing, incoming) {
  const set = new Set();
  toCsv(existing)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => set.add(tag));
  toCsv(incoming)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => set.add(tag));
  return Array.from(set).join(',');
}

function getSubscriberByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  return db.prepare('SELECT * FROM subscribers WHERE LOWER(email) = LOWER(?)').get(normalized);
}

function upsertSubscriber({ email, name, source = 'site', tags = [], utm = {}, referer }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  const existing = getSubscriberByEmail(normalizedEmail);
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const tagsCsv = mergeTags(existing?.tags, tags);

  if (existing) {
    db.prepare(
      `UPDATE subscribers
       SET name = COALESCE(?, name),
           source = COALESCE(source, ?),
           tags = ?,
           referer_at_signup = COALESCE(?, referer_at_signup),
           utm_source = COALESCE(?, utm_source),
           utm_medium = COALESCE(?, utm_medium),
           utm_campaign = COALESCE(?, utm_campaign),
           utm_content = COALESCE(?, utm_content),
           utm_term = COALESCE(?, utm_term),
           last_seen_at = ?
       WHERE id = ?`
    ).run(
      name || null,
      source,
      tagsCsv,
      referer || null,
      utm.utm_source || null,
      utm.utm_medium || null,
      utm.utm_campaign || null,
      utm.utm_content || null,
      utm.utm_term || null,
      now,
      existing.id
    );
    return getSubscriberByEmail(normalizedEmail);
  }

  db.prepare(
    `INSERT INTO subscribers (email, name, source, tags, referer_at_signup, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    normalizedEmail,
    name || null,
    source,
    tagsCsv,
    referer || null,
    utm.utm_source || null,
    utm.utm_medium || null,
    utm.utm_campaign || null,
    utm.utm_content || null,
    utm.utm_term || null,
    now,
    now
  );

  return getSubscriberByEmail(normalizedEmail);
}

function markUnsubscribed(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare('UPDATE subscribers SET unsubscribed_at = ? WHERE LOWER(email) = LOWER(?)').run(now, normalizedEmail);
  return getSubscriberByEmail(normalizedEmail);
}

module.exports = {
  upsertSubscriber,
  getSubscriberByEmail,
  markUnsubscribed,
};
