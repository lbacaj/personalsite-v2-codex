const dayjs = require('dayjs');
const db = require('../utils/db');

function toCsv(tags) {
  if (!tags) {
    return null;
  }
  if (typeof tags === 'string') {
    return tags;
  }
  if (Array.isArray(tags)) {
    return tags.join(',');
  }
  return null;
}

function getItemsByType(type, { featuredOnly = false, limit, includeHidden = false } = {}) {
  let query = 'SELECT * FROM items WHERE type = ?';
  const params = [type];

  if (!includeHidden) {
    query += ' AND visible = 1';
  }

  if (featuredOnly) {
    query += ' AND featured = 1';
  }

  query += ' ORDER BY (published_at IS NULL) ASC, published_at DESC, created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return db.prepare(query).all(...params);
}

function getItemById(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

function createItem(data) {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const stmt = db.prepare(
    `INSERT INTO items (type, source_id, source_url, title, description, blurb, image_url, embed_html, tags, published_at, featured, visible, created_at)
     VALUES (@type, @source_id, @source_url, @title, @description, @blurb, @image_url, @embed_html, @tags, @published_at, @featured, @visible, @created_at)`
  );

  const payload = {
    ...data,
    source_id: data.source_id || null,
    source_url: data.source_url || '',
    blurb: data.blurb || null,
    image_url: data.image_url || null,
    embed_html: data.embed_html || null,
    tags: toCsv(data.tags),
    featured: data.featured ? 1 : 0,
    visible: data.visible === undefined ? 1 : data.visible ? 1 : 0,
    published_at: data.published_at || now,
    created_at: now,
  };

  const result = stmt.run(payload);
  return getItemById(result.lastInsertRowid);
}

function updateItem(id, data) {
  const existing = getItemById(id);
  if (!existing) {
    throw new Error('Item not found');
  }
  const fields = [];
  const params = [];
  const allowedFields = [
    'title',
    'description',
    'blurb',
    'image_url',
    'embed_html',
    'tags',
    'published_at',
    'featured',
    'visible',
    'source_url',
  ];

  allowedFields.forEach((field) => {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'tags') {
        params.push(toCsv(data.tags));
      } else if (field === 'featured' || field === 'visible') {
        params.push(data[field] ? 1 : 0);
      } else {
        params.push(data[field]);
      }
    }
  });

  if (!fields.length) {
    return existing;
  }

  fields.push('updated_at = ?');
  params.push(dayjs().format('YYYY-MM-DD HH:mm:ss'));
  params.push(id);

  db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getItemById(id);
}

function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

function setFeatured(id, featured) {
  return updateItem(id, { featured });
}

function setVisibility(id, visible) {
  return updateItem(id, { visible });
}

module.exports = {
  getItemsByType,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  setFeatured,
  setVisibility,
};
