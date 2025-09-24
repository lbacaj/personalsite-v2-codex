PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  meta_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  blurb TEXT,
  image_url TEXT,
  embed_html TEXT,
  tags TEXT,
  published_at DATETIME,
  featured INTEGER DEFAULT 0,
  visible INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_unique ON items(type, source_url);

CREATE TABLE IF NOT EXISTS summarization_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  prompt_version TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_cents INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT,
  tags TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME,
  unsubscribed_at DATETIME,
  referer_at_signup TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  last_seen_at DATETIME
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  platform TEXT,
  product_id TEXT,
  product_name TEXT,
  sku TEXT,
  price_cents INTEGER,
  currency TEXT,
  purchased_at DATETIME,
  FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS freebies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  delivered_via TEXT,
  delivered_at DATETIME,
  FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_for DATETIME,
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  opened_at DATETIME,
  clicked_at DATETIME,
  bounced_at DATETIME,
  complained_at DATETIME,
  unsubscribed_at DATETIME,
  last_event_at DATETIME,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS mail_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message_id TEXT,
  email TEXT,
  campaign_id INTEGER,
  payload_json TEXT,
  happened_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  path TEXT NOT NULL,
  referer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fp_id TEXT,
  ip_hash TEXT,
  ua TEXT,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_event_path ON events(event, path);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATETIME,
  end_date DATETIME,
  rules TEXT,
  winner_subscriber_id INTEGER,
  fulfilled_at DATETIME,
  fulfillment_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(winner_subscriber_id) REFERENCES subscribers(id)
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(giveaway_id, subscriber_id),
  FOREIGN KEY(giveaway_id) REFERENCES giveaways(id),
  FOREIGN KEY(subscriber_id) REFERENCES subscribers(id)
);
