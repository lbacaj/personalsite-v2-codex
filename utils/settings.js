const db = require('./db');

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) {
    return defaultValue;
  }
  return row.value;
}

function getJsonSetting(key, defaultValue = null) {
  const value = getSetting(key);
  if (!value) {
    return defaultValue;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to parse JSON setting ${key}:`, error.message);
    return defaultValue;
  }
}

function updateSettings(updates = {}) {
  const statement = db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  );
  db.withTransaction(() => {
    Object.entries(updates).forEach(([key, value]) => {
      statement.run(key, value);
    });
  });
}

module.exports = {
  getAllSettings,
  getSetting,
  getJsonSetting,
  updateSettings,
};
