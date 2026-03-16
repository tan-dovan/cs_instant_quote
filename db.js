/**
 * db.js — SQLite user store for IQT auth + RBAC
 * Uses the 'sqlite3' npm package (callback-based), wrapped with Promises.
 */
const path    = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'iqt_auth.db');
const db      = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    google_id   TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    picture     TEXT,
    role        TEXT NOT NULL DEFAULT 'user',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_login  TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quote_shares (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id    TEXT NOT NULL,
    owner_id    TEXT NOT NULL,
    shared_with TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(quote_id, shared_with)
  )`);

  console.log('  ✅ Auth DB initialised at', DB_PATH);
}

module.exports = { db, run, get, all, init };
