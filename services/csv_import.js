const { parse } = require('csv-parse/sync');
const dayjs = require('dayjs');
const db = require('../utils/db');

const DEFAULT_MAPPING = {
  email: ['email', 'Email', 'email_address', 'Email Address', 'recipient_email'],
  name: ['name', 'Name', 'full_name', 'Full Name'],
  created_at: ['created', 'created_at', 'Created At', 'timestamp', 'Timestamp'],
  tags: ['tags', 'Tags', 'tag', 'Tag'],
  source: ['source', 'Source'],
};

function normalizeHeader(header) {
  return header?.toString().trim();
}

function detectColumn(headers, candidates) {
  for (const candidate of candidates) {
    if (headers.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveMapping(headers, mapping = {}) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const resolved = {};
  Object.entries(DEFAULT_MAPPING).forEach(([key, candidates]) => {
    const explicit = mapping[key];
    if (explicit && normalizedHeaders.includes(explicit)) {
      resolved[key] = explicit;
      return;
    }
    const detected = detectColumn(normalizedHeaders, candidates);
    if (detected) {
      resolved[key] = detected;
    }
  });
  return resolved;
}

function uniqueTags(...lists) {
  const set = new Set();
  lists
    .filter(Boolean)
    .forEach((list) => {
      list
        .split(/[;,]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .forEach((tag) => set.add(tag));
    });
  return Array.from(set).join(',');
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.format('YYYY-MM-DD HH:mm:ss');
}

function importSubscribersFromCsv({ buffer, source = 'manual', extraTags = [], mapping = {}, dryRun = false }) {
  const csvText = buffer.toString('utf8');
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!records.length) {
    return {
      total: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      mapping: {},
    };
  }

  const headers = Object.keys(records[0]);
  const resolvedMapping = resolveMapping(headers, mapping);
  const insertedStmt = db.prepare(
    `INSERT INTO subscribers (email, name, source, tags, created_at, verified_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updateStmt = db.prepare(
    `UPDATE subscribers
     SET name = ?, source = ?, tags = ?, created_at = ?, verified_at = ?
     WHERE id = ?`
  );

  const stats = {
    total: records.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    mapping: resolvedMapping,
  };

  const run = () => {
    for (const row of records) {
      const emailCol = resolvedMapping.email;
      const emailRaw = emailCol ? row[emailCol] : null;
      const email = emailRaw?.toString().trim().toLowerCase();

      if (!email) {
        stats.skipped += 1;
        continue;
      }

      const nameCol = resolvedMapping.name;
      const name = nameCol ? row[nameCol]?.toString().trim() : null;
      const createdCol = resolvedMapping.created_at;
      const createdAt = createdCol ? toDate(row[createdCol]) : null;
      const tagsCol = resolvedMapping.tags;
      const sourceCol = resolvedMapping.source;

      const tagString = uniqueTags(extraTags.join(','), tagsCol ? row[tagsCol] : null);
      const rowSource = sourceCol ? row[sourceCol]?.toString().trim() : null;

      const existing = db
        .prepare('SELECT * FROM subscribers WHERE LOWER(email) = LOWER(?)')
        .get(email);

      if (existing) {
        const mergedTags = uniqueTags(existing.tags || '', tagString);
        const earliestCreatedAt = [existing.created_at, createdAt]
          .filter(Boolean)
          .map((value) => dayjs(value))
          .sort((a, b) => a.valueOf() - b.valueOf())[0];

        if (!dryRun) {
          updateStmt.run(
            name || existing.name,
            existing.source || rowSource || source,
            mergedTags,
            earliestCreatedAt ? earliestCreatedAt.format('YYYY-MM-DD HH:mm:ss') : existing.created_at,
            existing.verified_at,
            existing.id
          );
        }
        stats.updated += 1;
        continue;
      }

      if (!dryRun) {
        insertedStmt.run(
          email,
          name || null,
          rowSource || source,
          tagString,
          createdAt || dayjs().format('YYYY-MM-DD HH:mm:ss'),
          null
        );
      }
      stats.inserted += 1;
    }
  };

  if (dryRun) {
    run();
  } else {
    db.withTransaction(run);
  }

  return stats;
}

module.exports = {
  importSubscribersFromCsv,
  resolveMapping,
};
