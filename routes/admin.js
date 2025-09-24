const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const dayjs = require('dayjs');

const {
  adminMiddleware,
  setAdminSession,
  clearAdminSession,
  verifyAdminToken,
  generateUnsubscribeToken,
} = require('../utils/auth');
const { getAnalyticsSummary } = require('../services/analytics');
const {
  getItemsByType,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  setFeatured,
  setVisibility,
} = require('../services/items');
const { summarizeAndUpdateItem } = require('../services/summarizer');
const { importSubscribersFromCsv } = require('../services/csv_import');
const { getAllSettings, updateSettings, getJsonSetting } = require('../utils/settings');
const { syncRepos } = require('../services/github');
const { syncVideos } = require('../services/youtube');
const { syncPosts } = require('../services/substack');
const { sendCampaign, isConfigured: mailgunConfigured } = require('../services/mailgun');
const { getSubscriberByEmail } = require('../services/subscribers');
const { enrichAppItem } = require('../services/app_metadata');
const db = require('../utils/db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const ITEM_TYPES = [
  'github',
  'youtube',
  'substack',
  'product',
  'app',
  'feature',
  'x_post',
  'linkedin_post',
];

function logAdmin(action, meta = {}) {
  try {
    db.prepare('INSERT INTO admin_audit (action, meta_json) VALUES (?, ?)').run(action, JSON.stringify(meta));
  } catch (error) {
    console.warn('Failed to write admin audit log', error.message);
  }
}

router.get('/login', (req, res) => {
  const token = req.cookies?.admin_session;
  if (verifyAdminToken(token)) {
    return res.redirect('/admin');
  }
  return res.render('admin/login', { layout: false, title: 'Admin Login' });
});

router.post('/login', (req, res) => {
  const token = req.body?.token;
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
  setAdminSession(res, token);
  return res.json({ success: true });
});

router.post('/logout', adminMiddleware, (req, res) => {
  clearAdminSession(res);
  return res.redirect('/admin/login');
});

router.use(adminMiddleware);

router.get('/', (req, res) => {
  const analytics = getAnalyticsSummary({ days: 7 });
  const recentSubscribers = db
    .prepare('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 10')
    .all();
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 5').all();

  res.render('admin/index', {
    layout: 'admin/layout',
    title: 'Dashboard',
    analytics,
    recentSubscribers,
    campaigns,
    mailgunConfigured: mailgunConfigured(),
  });
});

router.get('/analytics/summary', (req, res) => {
  const analytics = getAnalyticsSummary({ days: 7 });
  res.json(analytics);
});

router.get('/items', (req, res) => {
  const type = req.query.type && ITEM_TYPES.includes(req.query.type) ? req.query.type : 'github';
  const items = getItemsByType(type, { includeHidden: true });
  res.render('admin/items', {
    layout: 'admin/layout',
    title: 'Content',
    items,
    type,
    itemTypes: ITEM_TYPES,
  });
});

const itemSchema = z.object({
  type: z.enum(ITEM_TYPES),
  title: z.string().min(1),
  source_url: z.string().min(1),
  source_id: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  blurb: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  embed_html: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  published_at: z.string().optional().nullable(),
  featured: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  visible: z.preprocess((val) => val !== 'false' && val !== false, z.boolean()).optional(),
});

router.post('/items', async (req, res, next) => {
  try {
    const payload = itemSchema.parse(req.body || {});
    const item = createItem(payload);
    logAdmin('item.create', { id: item.id, type: item.type });
    if (item.type === 'app') {
      await enrichAppItem(item.id, { force: true });
      const refreshed = getItemById(item.id);
      return res.json({ success: true, item: refreshed });
    }
    res.json({ success: true, item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid item payload', details: error.errors });
    }
    return next(error);
  }
});

router.patch('/items/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = itemSchema.partial().parse(req.body || {});
    const item = updateItem(id, payload);
    logAdmin('item.update', { id });
    if (item.type === 'app') {
      await enrichAppItem(item.id, { force: true });
      const refreshed = getItemById(item.id);
      return res.json({ success: true, item: refreshed });
    }
    res.json({ success: true, item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid item payload', details: error.errors });
    }
    return next(error);
  }
});

router.post('/items/:id/feature', (req, res) => {
  const id = Number(req.params.id);
  const featured = req.body?.featured === 'true' || req.body?.featured === true;
  const item = setFeatured(id, featured);
  logAdmin('item.feature', { id, featured });
  res.json({ success: true, item });
});

router.post('/items/:id/visibility', (req, res) => {
  const id = Number(req.params.id);
  const visible = req.body?.visible !== 'false' && req.body?.visible !== false;
  const item = setVisibility(id, visible);
  logAdmin('item.visibility', { id, visible });
  res.json({ success: true, item });
});

router.post('/items/:id/resummarize', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = getItemById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const text = `${item.title}\n\n${item.description || ''}`;
    const summary = await summarizeAndUpdateItem(id, text, { promptVersion: 'admin_manual' });
    logAdmin('item.resummarize', { id });
    res.json({ success: true, summary });
  } catch (error) {
    next(error);
  }
});

router.delete('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  deleteItem(id);
  logAdmin('item.delete', { id });
  res.json({ success: true });
});

router.post('/fetch/github', async (req, res) => {
  try {
    const settings = getAllSettings();
    const users = (settings['integrations.github_user'] || process.env.GITHUB_USER || '')
      .split(',')
      .map((user) => user.trim())
      .filter(Boolean);

    if (!users.length) {
      return res.status(400).json({ success: false, error: 'Add a GitHub username in Settings before fetching.' });
    }

    const stats = await syncRepos({ usernames: users });
    logAdmin('fetch.github', { usernames: users, stats });
    res.json({ success: true, stats });
  } catch (error) {
    console.error('GitHub fetch failed', error);
    res.status(400).json({ success: false, error: error.message || 'Unable to fetch GitHub data.' });
  }
});

router.post('/fetch/youtube', async (req, res) => {
  try {
    const settings = getAllSettings();
    const channelId = settings['integrations.youtube_channel_id'] || process.env.YOUTUBE_CHANNEL_ID;

    if (!channelId) {
      return res.status(400).json({ success: false, error: 'Add a YouTube channel ID in Settings before fetching.' });
    }

    const stats = await syncVideos({ channelId });
    logAdmin('fetch.youtube', { channelId, stats });
    res.json({ success: true, stats });
  } catch (error) {
    console.error('YouTube fetch failed', error);
    res.status(400).json({ success: false, error: error.message || 'Unable to fetch YouTube videos.' });
  }
});

router.post('/fetch/substack', async (req, res) => {
  try {
    const settings = getAllSettings();
    const feedUrl = settings['integrations.substack_feed_url'] || process.env.SUBSTACK_FEED_URL;

    if (!feedUrl) {
      return res.status(400).json({ success: false, error: 'Add a Substack feed URL in Settings before fetching.' });
    }

    const stats = await syncPosts({ feedUrl });
    logAdmin('fetch.substack', { feedUrl, stats });
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Substack fetch failed', error);
    res.status(400).json({ success: false, error: error.message || 'Unable to fetch Substack posts.' });
  }
});

router.get('/email', (req, res) => {
  const subscriberCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN unsubscribed_at IS NULL THEN 1 ELSE 0 END) AS subscribed,
         SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS unsubscribed
       FROM subscribers`
    )
    .get();
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 10').all();

  res.render('admin/email', {
    layout: 'admin/layout',
    title: 'Email',
    subscriberCounts,
    campaigns,
    mailgunConfigured: mailgunConfigured(),
  });
});

const campaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  html_body: z.string().min(1),
  text_body: z.string().optional().nullable(),
  scheduled_for: z.string().optional().nullable(),
});

router.post('/campaigns', (req, res, next) => {
  try {
    const payload = campaignSchema.parse(req.body || {});
    const result = db
      .prepare(
        `INSERT INTO campaigns (name, subject, html_body, text_body, status, scheduled_for)
         VALUES (?, ?, ?, ?, 'draft', ?)`
      )
      .run(
        payload.name,
        payload.subject,
        payload.html_body,
        payload.text_body || null,
        payload.scheduled_for || null
      );
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid);
    logAdmin('campaign.create', { id: campaign.id });
    res.json({ success: true, campaign });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid campaign data', details: error.errors });
    }
    return next(error);
  }
});

const sendSchema = z.object({
  tag_include: z.string().optional().nullable(),
  tag_exclude: z.string().optional().nullable(),
});

router.post('/campaigns/:id/send', async (req, res, next) => {
  try {
    if (!mailgunConfigured()) {
      return res.status(400).json({ error: 'Mailgun is not configured.' });
    }

    const campaignId = Number(req.params.id);
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const filters = sendSchema.parse(req.body || {});
    const subscribers = db.prepare('SELECT * FROM subscribers WHERE unsubscribed_at IS NULL').all();
    const includeTags = filters.tag_include ? filters.tag_include.split(',').map((tag) => tag.trim()) : [];
    const excludeTags = filters.tag_exclude ? filters.tag_exclude.split(',').map((tag) => tag.trim()) : [];

    const filtered = subscribers.filter((subscriber) => {
      const tags = (subscriber.tags || '').split(',').map((tag) => tag.trim());
      if (includeTags.length && !includeTags.every((tag) => tags.includes(tag))) {
        return false;
      }
      if (excludeTags.some((tag) => tags.includes(tag))) {
        return false;
      }
      return true;
    });

    if (!filtered.length) {
      return res.status(400).json({ error: 'No matching subscribers to send to.' });
    }

    const insertRecipient = db.prepare(
      `INSERT INTO campaign_recipients (campaign_id, subscriber_id, status)
       VALUES (?, ?, 'queued')`
    );

    db.withTransaction(() => {
      filtered.forEach((subscriber) => {
        insertRecipient.run(campaignId, subscriber.id);
      });
      db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('sending', campaignId);
    });

    const results = await sendCampaign({
      campaign,
      recipients: filtered,
      unsubscribeTokenFn: generateUnsubscribeToken,
    });

    const updateRecipient = db.prepare(
      `UPDATE campaign_recipients
       SET status = 'sent', message_id = ?, last_event_at = CURRENT_TIMESTAMP
       WHERE campaign_id = ? AND subscriber_id = ?`
    );

    db.withTransaction(() => {
      results.forEach((result) => {
        updateRecipient.run(result.messageId, campaignId, result.subscriberId);
      });
      db.prepare('UPDATE campaigns SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?').run('sent', campaignId);
    });

    logAdmin('campaign.send', { id: campaignId, sent: results.length });

    res.json({ success: true, sent: results.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid send filters', details: error.errors });
    }
    return next(error);
  }
});

router.get('/subscribers', (req, res) => {
  const limit = Number(req.query.limit || 50);
  const subscribers = db
    .prepare('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  res.json({ subscribers });
});

router.post('/import/subscribers', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }
  const source = req.body?.source || 'manual';
  const tags = req.body?.tags ? req.body.tags.split(',').map((tag) => tag.trim()) : [];
  const result = importSubscribersFromCsv({ buffer: req.file.buffer, source, extraTags: tags });
  logAdmin('subscribers.import', { source, inserted: result.inserted, updated: result.updated });
  res.json({ success: true, result });
});

router.get('/giveaways', (req, res) => {
  const giveaways = db.prepare('SELECT * FROM giveaways ORDER BY created_at DESC').all();
  const latestEntries = db
    .prepare(
      `SELECT ge.*, s.email
       FROM giveaway_entries ge
       JOIN subscribers s ON s.id = ge.subscriber_id
       ORDER BY ge.created_at DESC
       LIMIT 20`
    )
    .all();

  res.render('admin/giveaways', {
    layout: 'admin/layout',
    title: 'Giveaways',
    giveaways,
    latestEntries,
  });
});

const giveawaySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  rules: z.string().optional().nullable(),
});

router.post('/giveaways', (req, res, next) => {
  try {
    const payload = giveawaySchema.parse(req.body || {});
    const result = db
      .prepare(
        `INSERT INTO giveaways (name, description, start_date, end_date, rules)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        payload.name,
        payload.description || null,
        payload.start_date || null,
        payload.end_date || null,
        payload.rules || null
      );
    const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(result.lastInsertRowid);
    logAdmin('giveaway.create', { id: giveaway.id });
    res.json({ success: true, giveaway });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid giveaway data', details: error.errors });
    }
    return next(error);
  }
});

const entrySchema = z.object({ email: z.string().email(), source: z.string().optional().nullable() });

router.post('/giveaways/:id/entries', (req, res, next) => {
  try {
    const giveawayId = Number(req.params.id);
    const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
    if (!giveaway) {
      return res.status(404).json({ error: 'Giveaway not found' });
    }
    const payload = entrySchema.parse(req.body || {});
    const subscriber = getSubscriberByEmail(payload.email);
    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    db.prepare(
      `INSERT OR IGNORE INTO giveaway_entries (giveaway_id, subscriber_id, source)
       VALUES (?, ?, ?)`
    ).run(giveawayId, subscriber.id, payload.source || 'manual');
    logAdmin('giveaway.entry', { giveawayId, subscriberId: subscriber.id });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid entry data', details: error.errors });
    }
    return next(error);
  }
});

router.post('/giveaways/:id/draw', (req, res) => {
  const giveawayId = Number(req.params.id);
  const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(giveawayId);
  if (!giveaway) {
    return res.status(404).json({ error: 'Giveaway not found' });
  }
  const entries = db
    .prepare(
      `SELECT ge.*, s.email
       FROM giveaway_entries ge
       JOIN subscribers s ON s.id = ge.subscriber_id
       WHERE ge.giveaway_id = ?`
    )
    .all(giveawayId);
  if (!entries.length) {
    return res.status(400).json({ error: 'No entries to draw from.' });
  }
  const winner = entries[Math.floor(Math.random() * entries.length)];
  db.prepare('UPDATE giveaways SET winner_subscriber_id = ? WHERE id = ?').run(winner.subscriber_id, giveawayId);
  logAdmin('giveaway.draw', { giveawayId, subscriberId: winner.subscriber_id });
  res.json({ success: true, winner });
});

const fulfillSchema = z.object({ delivered_via: z.string().optional().nullable(), notes: z.string().optional().nullable() });

router.post('/giveaways/:id/fulfill', (req, res, next) => {
  try {
    const giveawayId = Number(req.params.id);
    const payload = fulfillSchema.parse(req.body || {});
    db.prepare(
      `UPDATE giveaways
       SET fulfilled_at = CURRENT_TIMESTAMP,
           fulfillment_notes = ?
       WHERE id = ?`
    ).run(payload.notes || payload.delivered_via || null, giveawayId);
    logAdmin('giveaway.fulfill', { giveawayId });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid fulfillment data', details: error.errors });
    }
    return next(error);
  }
});

router.get('/settings', (req, res) => {
  const settings = getAllSettings();
  const socialLinks = getJsonSetting('site.social_links', []);
  res.render('admin/settings', {
    layout: 'admin/layout',
    title: 'Settings',
    settings,
    socialLinks,
  });
});

const settingsSchema = z.object({
  'site.title': z.string().min(1),
  'site.description': z.string().min(1),
  'site.hero_heading': z.string().min(1),
  'site.hero_subheading': z.string().min(1),
  'site.hero_cta_text': z.string().min(1),
  'site.hero_paragraphs': z.string().optional().nullable(),
  'site.hero_image_path': z.string().optional().nullable(),
  'site.hero_image_alt': z.string().optional().nullable(),
  'site.about_html': z.string().optional().nullable(),
  'site.about_long_html': z.string().optional().nullable(),
  'site.appeared_on': z.string().optional().nullable(),
  'site.recent_essays': z.string().optional().nullable(),
  'site.newsletter_embed_url': z.string().optional().nullable(),
  'site.about_help_cards': z.string().optional().nullable(),
  'site.social_links': z.string().optional().nullable(),
  'integrations.github_user': z.string().optional().nullable(),
  'integrations.youtube_channel_id': z.string().optional().nullable(),
  'integrations.substack_feed_url': z.string().optional().nullable(),
  'mailgun.domain': z.string().optional().nullable(),
  'mailgun.from': z.string().optional().nullable(),
  'mailgun.base_url': z.string().optional().nullable(),
  'integrations.openai_model': z.string().optional().nullable(),
});

router.post('/settings', (req, res, next) => {
  try {
    const payload = settingsSchema.parse(req.body || {});
    updateSettings(payload);
    logAdmin('settings.update', { keys: Object.keys(payload) });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid settings data', details: error.errors });
    }
    return next(error);
  }
});

module.exports = router;
