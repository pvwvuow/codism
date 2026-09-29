import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/panel.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const _raw = new DatabaseSync(DB_PATH);
_raw.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  daily_limit INTEGER DEFAULT 0,
  monthly_limit INTEGER DEFAULT 0,
  allowed_models TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  model TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  endpoint TEXT,
  status INTEGER,
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Wrapper to mimic better-sqlite3 API used in project
function wrapPrepare(sql) {
  const stmt = _raw.prepare(sql);
  return {
    get(...args) {
      try { return stmt.get(...args) ?? undefined; } catch { return undefined; }
    },
    all(...args) { return stmt.all(...args); },
    run(...args) {
      const res = stmt.run(...args);
      return { lastInsertRowid: res.lastInsertRowid, changes: res.changes };
    }
  };
}
export const db = {
  prepare: wrapPrepare,
  exec(sql) { _raw.exec(sql); },
  pragma() {}
};
export function getSetting(key, fallback=null){
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}
export function setSetting(key,value){
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
}
