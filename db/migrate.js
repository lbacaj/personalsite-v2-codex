require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'app.db');

function createConnection() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(
    'CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, run_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
  );
  return db;
}

function runMigrations() {
  const db = createConnection();
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const applied = db
    .prepare('SELECT name FROM migrations ORDER BY name ASC')
    .all()
    .map((row) => row.name);

  let appliedCount = 0;

  for (const file of files) {
    if (applied.includes(file)) {
      continue;
    }
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations(name) VALUES (?)').run(file);
    appliedCount += 1;
    console.log(`Applied migration: ${file}`);
  }

  db.close();

  if (!appliedCount) {
    console.log('Database already up to date.');
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
