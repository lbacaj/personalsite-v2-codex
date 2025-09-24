const { load } = require('cheerio');
const db = require('../utils/db');
const { summarizeAndUpdateItem } = require('./summarizer');

function absoluteUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch (error) {
    return null;
  }
}

function extractMainText($) {
  const text = $('body').text() || '';
  return text.replace(/\s+/g, ' ').trim();
}

async function enrichAppItem(itemId, { force = false } = {}) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item || item.type !== 'app' || !item.source_url) {
    return null;
  }

  let html;
  try {
    const response = await fetch(item.source_url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    html = await response.text();
  } catch (error) {
    console.warn('Failed to fetch app page', item.source_url, error.message);
    html = null;
  }

  if (!html) {
    return null;
  }

  const $ = load(html);
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content');
  const mainText = extractMainText($).slice(0, 4000);

  const summarySource = [ogTitle, ogDescription, mainText].filter(Boolean).join('\n\n');

  let summary = null;
  if (summarySource && (force || !item.blurb)) {
    const result = await summarizeAndUpdateItem(itemId, summarySource, {
      instruction:
        'Write one friendly sentence (≤ 28 words) describing what this app or product does and who it helps. No hype, no emojis, plain English.',
      promptVersion: 'app_v1',
    });
    summary = result.summary || null;
    if (!summary && ogDescription) {
      const fallback = ogDescription.length > 200 ? `${ogDescription.slice(0, 197).trim()}…` : ogDescription;
      db.prepare('UPDATE items SET blurb = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(fallback, itemId);
      summary = fallback;
    }
  }

  if (ogImage && (force || !item.image_url)) {
    const resolved = absoluteUrl(ogImage, item.source_url);
    if (resolved) {
      db.prepare('UPDATE items SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(resolved, itemId);
    }
  }

  return {
    summary,
    image: ogImage ? absoluteUrl(ogImage, item.source_url) : item.image_url,
  };
}

module.exports = {
  enrichAppItem,
};
