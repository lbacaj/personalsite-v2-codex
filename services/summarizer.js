const crypto = require('crypto');

const { OpenAI } = require('openai');
const db = require('../utils/db');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
let client;

if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function hashSource(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getCachedSummary({ itemId, model, sourceHash }) {
  if (!itemId) {
    return null;
  }
  return db
    .prepare(
      `SELECT summary FROM summarization_log
       WHERE item_id = ? AND model = ? AND source_hash = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(itemId, model, sourceHash);
}

function storeSummary({ itemId, model, sourceHash, summary, promptVersion, tokensIn, tokensOut, costCents }) {
  if (!itemId || !summary) {
    return;
  }
  db.prepare(
    `INSERT INTO summarization_log (item_id, model, source_hash, summary, prompt_version, tokens_in, tokens_out, cost_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, model, sourceHash, summary, promptVersion, tokensIn || 0, tokensOut || 0, costCents || 0);
}

async function summarize({ itemId, text, model = DEFAULT_MODEL, promptVersion = 'v1', instruction }) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { summary: null, cached: false };
  }

  const sourceHash = hashSource(trimmed);
  const cached = getCachedSummary({ itemId, model, sourceHash });
  if (cached && cached.summary) {
    return { summary: cached.summary, cached: true };
  }

  if (!client) {
    console.warn('OPENAI_API_KEY not configured; skipping summarization.');
    return { summary: null, cached: false };
  }

  const directive =
    instruction ||
    'Summarize the content below in 1–2 sentences (≤ 45 words), plain English, highlight concrete value/what this is, avoid hype, no emojis. Return plain text only.';

  const prompt = `${directive}\n\nCONTENT:\n${trimmed}`;

  try {
    const response = await client.responses.create({
      model,
      input: prompt,
    });

    const summary = (response.output_text || '').trim();

    storeSummary({
      itemId,
      model,
      sourceHash,
      summary,
      promptVersion,
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      costCents: response.usage?.total_cost ? Math.round(response.usage.total_cost * 100) : 0,
    });

    return { summary, cached: false };
  } catch (error) {
    console.warn('Summarization failed', error?.message || error);
    return { summary: null, cached: false, error: error?.message || 'Summarization failed' };
  }
}

async function summarizeAndUpdateItem(itemId, text, options = {}) {
  const result = await summarize({ itemId, text, ...options });
  if (result.summary) {
    db.prepare('UPDATE items SET blurb = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(result.summary, itemId);
  }
  return result;
}

module.exports = {
  summarize,
  summarizeAndUpdateItem,
  hashSource,
};
