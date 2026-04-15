const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'profiles.db');
let db;

/**
 * Initializes the SQLite database using sql.js (pure JavaScript, no native deps).
 * Loads existing data from disk if available, otherwise creates a fresh DB.
 * Creates the profiles table if it doesn't exist.
 */
async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Load existing database from file if it exists
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      gender TEXT NOT NULL,
      gender_probability REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      age INTEGER NOT NULL,
      age_group TEXT NOT NULL,
      country_id TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Persist initial schema
  saveDatabase();
}

/**
 * Writes the in-memory database to disk.
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Returns the database instance.
 * @returns {import('sql.js').Database}
 */
function getDatabase() {
  return db;
}

module.exports = { getDatabase, initializeDatabase, saveDatabase };
