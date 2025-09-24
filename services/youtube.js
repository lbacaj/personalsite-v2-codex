const dayjs = require('dayjs');
const db = require('../utils/db');
const { summarizeAndUpdateItem } = require('./summarizer');
const { parse, extractEntries } = require('../utils/rss');

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml';

function getLink(entry) {
  if (!entry.link) {
    return null;
  }
  if (Array.isArray(entry.link)) {
    const alt = entry.link.find((link) => link.rel === 'alternate');
    return alt ? alt.href : entry.link[0].href || null;
  }
  return entry.link.href || entry.link;
}

function normalizeVideo(entry) {
  const videoId = entry['yt:videoId'];
  const mediaGroup = entry['media:group'] || {};
  const thumbnail = mediaGroup['media:thumbnail'];
  const thumbUrl = Array.isArray(thumbnail) ? thumbnail[0].url : thumbnail?.url;

  return {
    type: 'youtube',
    source_id: videoId,
    source_url: getLink(entry),
    title: entry.title,
    description: mediaGroup['media:description'] || '',
    image_url: thumbUrl,
    embed_html: videoId
      ? `<iframe src="https://www.youtube.com/embed/${videoId}" title="${entry.title}" allowfullscreen class="w-full aspect-video rounded-xl border border-slate-800"></iframe>`
      : null,
    published_at: entry.published ? dayjs(entry.published).format('YYYY-MM-DD HH:mm:ss') : null,
  };
}

async function fetchVideos({ channelId }) {
  if (!channelId) {
    return [];
  }

  const url = `${FEED_URL}?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube RSS error (${response.status})`);
    }

    const xml = await response.text();
    const feed = parse(xml);
    const entries = extractEntries(feed);
    return entries.map(normalizeVideo);
  } catch (error) {
    throw new Error(`Unable to fetch YouTube feed: ${error.message}`);
  }
}

function upsertVideo(video) {
  const existing = db
    .prepare('SELECT id FROM items WHERE type = ? AND source_url = ?')
    .get('youtube', video.source_url);

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  if (existing) {
    db.prepare(
      `UPDATE items
       SET title = ?, description = ?, image_url = ?, embed_html = ?, published_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      video.title,
      video.description,
      video.image_url,
      video.embed_html,
      video.published_at,
      now,
      existing.id
    );
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO items (type, source_id, source_url, title, description, image_url, embed_html, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      video.type,
      video.source_id,
      video.source_url,
      video.title,
      video.description,
      video.image_url,
      video.embed_html,
      video.published_at,
      now
    );

  return result.lastInsertRowid;
}

async function syncVideos({ channelId, summarization = true }) {
  const videos = await fetchVideos({ channelId });
  const stats = { processed: 0, summarized: 0, errors: [] };

  for (const video of videos) {
    const itemId = upsertVideo(video);
    stats.processed += 1;
    const text = `${video.title}\n\n${video.description || ''}`;
    if (summarization && text && text.length > 160) {
      const result = await summarizeAndUpdateItem(itemId, text, { promptVersion: 'youtube_v1' });
      if (result.summary) {
        stats.summarized += 1;
      } else if (result.error) {
        stats.errors.push({ itemId, title: video.title, error: result.error });
      }
    }
  }

  return stats;
}

module.exports = {
  fetchVideos,
  syncVideos,
};
