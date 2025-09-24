const crypto = require('crypto');
const dayjs = require('dayjs');
const db = require('../utils/db');

const ANALYTICS_SALT = process.env.ANALYTICS_SALT || 'dev-salt';

function hashIp(ip) {
  if (!ip) {
    return null;
  }
  return crypto.createHmac('sha256', ANALYTICS_SALT).update(ip).digest('hex');
}

function trackEvent({ event, path, referer, utm = {}, fpId, ip, ua }) {
  const statement = db.prepare(
    `INSERT INTO events (event, path, referer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fp_id, ip_hash, ua)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  statement.run(
    event,
    path,
    referer || null,
    utm.utm_source || null,
    utm.utm_medium || null,
    utm.utm_campaign || null,
    utm.utm_content || null,
    utm.utm_term || null,
    fpId || null,
    hashIp(ip),
    ua || null
  );
}

function getSparkline({ days = 7 } = {}) {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', ts) AS day, COUNT(*) AS count
       FROM events
       WHERE ts >= datetime('now', ?)
         AND event = 'pageview'
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(`-${days - 1} days`);

  const start = dayjs().subtract(days - 1, 'day');
  const result = [];
  for (let i = 0; i < days; i += 1) {
    const day = start.add(i, 'day').format('YYYY-MM-DD');
    const row = rows.find((r) => r.day === day);
    result.push({ day, count: row ? row.count : 0 });
  }
  return result;
}

function getTopPages({ days = 7, limit = 5 } = {}) {
  return db
    .prepare(
      `SELECT path, COUNT(*) AS count
       FROM events
       WHERE ts >= datetime('now', ?)
         AND event = 'pageview'
       GROUP BY path
       ORDER BY count DESC
       LIMIT ?`
    )
    .all(`-${days - 1} days`, limit);
}

function getUtmBreakdown({ days = 7, limit = 5 } = {}) {
  return db
    .prepare(
      `SELECT COALESCE(utm_source, 'direct') AS source, COUNT(*) AS count
       FROM events
       WHERE ts >= datetime('now', ?)
         AND event = 'pageview'
       GROUP BY source
       ORDER BY count DESC
       LIMIT ?`
    )
    .all(`-${days - 1} days`, limit);
}

function getTotals({ days = 7 } = {}) {
  const visitors = db
    .prepare(
      `SELECT COUNT(DISTINCT fp_id) AS count
       FROM events
       WHERE ts >= datetime('now', ?)
         AND event = 'pageview'`
    )
    .get(`-${days - 1} days`).count;

  const subscribers = db
    .prepare('SELECT COUNT(*) AS count FROM subscribers WHERE unsubscribed_at IS NULL')
    .get().count;

  const unsubscribed = db
    .prepare('SELECT COUNT(*) AS count FROM subscribers WHERE unsubscribed_at IS NOT NULL')
    .get().count;

  return {
    visitors,
    subscribers,
    unsubscribed,
  };
}

function getAnalyticsSummary({ days = 7 } = {}) {
  return {
    totals: getTotals({ days }),
    sparkline: getSparkline({ days }),
    topPages: getTopPages({ days }),
    utmBreakdown: getUtmBreakdown({ days }),
  };
}

module.exports = {
  trackEvent,
  getSparkline,
  getTopPages,
  getUtmBreakdown,
  getTotals,
  getAnalyticsSummary,
  hashIp,
};
