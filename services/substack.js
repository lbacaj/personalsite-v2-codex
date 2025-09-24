const dayjs = require('dayjs');
const sanitizeHtml = require('sanitize-html');
const db = require('../utils/db');
const { summarizeAndUpdateItem } = require('./summarizer');
const { parse, extractEntries } = require('../utils/rss');

function stripHtml(html) {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} }).trim();
}

function getImage(entry) {
  const mediaContent = entry['media:content'];
  if (Array.isArray(mediaContent)) {
    const item = mediaContent.find((content) => content.url) || mediaContent[0];
    return item?.url || null;
  }
  if (mediaContent && mediaContent.url) {
    return mediaContent.url;
  }
  if (entry.enclosure && entry.enclosure.url) {
    return entry.enclosure.url;
  }
  return null;
}

function normalizePost(entry) {
  const link = entry.link?.href || entry.link;
  const content = entry['content:encoded'] || entry.description || '';
  return {
    type: 'substack',
    source_id: entry.guid?.value || link,
    source_url: link,
    title: entry.title,
    description: content,
    blurb: stripHtml(content).slice(0, 240),
    image_url: getImage(entry),
    published_at: entry.pubDate ? dayjs(entry.pubDate).format('YYYY-MM-DD HH:mm:ss') : null,
  };
}

async function fetchPosts({ feedUrl }) {
  if (!feedUrl) {
    return [];
  }

  try {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      throw new Error(`Substack RSS error (${response.status})`);
    }

    const xml = await response.text();
    const feed = parse(xml);
    const entries = extractEntries(feed);
    return entries.map(normalizePost);
  } catch (error) {
    throw new Error(`Unable to fetch Substack feed: ${error.message}`);
  }
}

function upsertPost(post) {
  const existing = db
    .prepare('SELECT id FROM items WHERE type = ? AND source_url = ?')
    .get('substack', post.source_url);

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  if (existing) {
    db.prepare(
      `UPDATE items
       SET title = ?, description = ?, image_url = ?, published_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(post.title, post.description, post.image_url, post.published_at, now, existing.id);
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO items (type, source_id, source_url, title, description, image_url, blurb, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      post.type,
      post.source_id,
      post.source_url,
      post.title,
      post.description,
      post.image_url,
      post.blurb,
      post.published_at,
      now
    );

  return result.lastInsertRowid;
}

async function syncPosts({ feedUrl, summarization = true }) {
  const posts = await fetchPosts({ feedUrl });
  const stats = { processed: 0, summarized: 0, errors: [] };

  for (const post of posts) {
    const itemId = upsertPost(post);
    stats.processed += 1;
    const plain = stripHtml(post.description);
    if (summarization && plain && plain.length > 160) {
      const result = await summarizeAndUpdateItem(itemId, plain, { promptVersion: 'substack_v1' });
      if (result.summary) {
        stats.summarized += 1;
      } else if (result.error) {
        stats.errors.push({ itemId, title: post.title, error: result.error });
      }
    }
  }

  return stats;
}

module.exports = {
  fetchPosts,
  syncPosts,
  stripHtml,
};
