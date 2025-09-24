const dayjs = require('dayjs');
const db = require('../utils/db');
const { summarizeAndUpdateItem } = require('./summarizer');

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'PersonalHub/1.0';

async function fetchReadme(repo, token) {
  if (!repo?.owner?.login || !repo?.name) {
    return null;
  }

  const url = `${GITHUB_API}/repos/${repo.owner.login}/${repo.name}/readme`;
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github.v3.raw',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    return text ? text.slice(0, 2000) : null;
  } catch (error) {
    console.warn('Failed to fetch README for', repo.full_name, error?.message || error);
    return null;
  }
}

function toPlainSummary(text = '') {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#>*_~]|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trim()}…` : cleaned;
}

function setBlurb(itemId, text) {
  const blurb = toPlainSummary(text);
  if (!blurb) {
    return false;
  }
  db.prepare('UPDATE items SET blurb = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(blurb, itemId);
  return true;
}

async function fetchRepos({ username, perPage = 100, token }) {
  if (!username) {
    return [];
  }

  const url = new URL(`${GITHUB_API}/users/${username}/repos`);
  url.searchParams.set('sort', 'pushed');
  url.searchParams.set('per_page', String(perPage));

  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github.mercy-preview+json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`GitHub API error (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

function normalizeRepo(repo) {
  return {
    type: 'github',
    source_id: String(repo.id),
    source_url: repo.html_url,
    title: repo.name,
    description: repo.description || '',
    image_url: repo.owner?.avatar_url || null,
    tags: Array.isArray(repo.topics) ? repo.topics.join(',') : null,
    published_at: repo.pushed_at ? dayjs(repo.pushed_at).format('YYYY-MM-DD HH:mm:ss') : null,
  };
}

function upsertRepo(repo) {
  const normalized = normalizeRepo(repo);
  const existing = db
    .prepare('SELECT id, description, blurb FROM items WHERE type = ? AND source_url = ?')
    .get('github', normalized.source_url);

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  if (existing) {
    db.prepare(
      `UPDATE items
       SET title = ?, description = ?, image_url = ?, tags = ?, published_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      normalized.title,
      normalized.description,
      normalized.image_url,
      normalized.tags,
      normalized.published_at,
      now,
      existing.id
    );
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO items (type, source_id, source_url, title, description, image_url, tags, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      normalized.type,
      normalized.source_id,
      normalized.source_url,
      normalized.title,
      normalized.description,
      normalized.image_url,
      normalized.tags,
      normalized.published_at,
      now
    );

  return result.lastInsertRowid;
}

async function syncRepos({ usernames = [], token, summarization = true }) {
  const stats = { processed: 0, summarized: 0, errors: [] };

  for (const username of usernames) {
    const repos = await fetchRepos({ username, token });
    for (const repo of repos) {
      const itemId = upsertRepo(repo);
      stats.processed += 1;
      const readme = summarization ? await fetchReadme(repo, token) : null;
      const baseText = readme || repo.description || repo.name;

      if (summarization && baseText && baseText.length > 40) {
        const result = await summarizeAndUpdateItem(itemId, baseText, {
          promptVersion: 'github_v1',
          instruction:
            'Summarize this open-source project in one crisp sentence (≤ 30 words). Mention what it does and who benefits. No marketing fluff, no emojis.',
        });
        if (result.summary) {
          stats.summarized += 1;
        } else if (result.error) {
          stats.errors.push({ itemId, title: repo.name, error: result.error });
          setBlurb(itemId, baseText);
        } else {
          setBlurb(itemId, baseText);
        }
      } else if (baseText) {
        setBlurb(itemId, baseText);
      }
    }
  }

  return stats;
}

module.exports = {
  fetchRepos,
  syncRepos,
};
