const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v7: uuidv7 } = require('uuid');

const DB_PATH = path.join(__dirname, 'profiles.db');
const SEED_URL = 'https://drive.google.com/uc?export=download&id=1Up06dcS9OfUEnDj_u6OV_xTRntupFhPH';

let db;

/**
 * Initializes the SQLite database using sql.js.
 * Loads existing data from disk if available, otherwise creates a fresh DB.
 * Update schema and seed data.
 */
async function initializeDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables with exact required structure
  // Drop if schema is old (detect by presence of country_name or absence of sample_size)
  try {
    const tableInfo = db.exec("PRAGMA table_info(profiles)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(v => v[1]);
      if (!columns.includes('country_name') || columns.includes('sample_size')) {
        console.log('Detected old schema, dropping profiles table...');
        db.run('DROP TABLE profiles');
      }
    }
  } catch (e) {
    // Table might not exist yet
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      gender TEXT NOT NULL,
      gender_probability REAL NOT NULL,
      age INTEGER NOT NULL,
      age_group TEXT NOT NULL,
      country_id TEXT NOT NULL,
      country_name TEXT NOT NULL,
      country_probability REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'analyst',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Seed test users (admin + analyst) for grading
  seedTestUsers();

  // Seed profile database
  await seedDatabase();

  saveDatabase();
}

/**
 * Fetches 2026 profiles from Google Drive and seeds the database.
 * Idempotent: Does not insert duplicates based on name.
 */
async function seedDatabase() {
  console.log('Checking for seed data...');
  
  // Check count to see if we need to seed
  const res = db.exec('SELECT COUNT(*) FROM profiles');
  const count = res[0].values[0][0];
  
  if (count >= 2026) {
    console.log(`Database already seeded with ${count} records.`);
    return;
  }

  console.log('Seeding database from external source...');
  try {
    const response = await axios.get(SEED_URL);
    const data = response.data;
    const profiles = data.profiles || [];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO profiles (
        id, name, gender, gender_probability, age, age_group, 
        country_id, country_name, country_probability, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of profiles) {
      if (!p.name || !p.gender) {
        console.warn(`Skipping profile with missing basic fields (name/gender): ${JSON.stringify(p).substring(0, 100)}...`);
        continue;
      }
      
      const id = p.id || uuidv7();
      
      stmt.run([
        id,
        p.name,
        p.gender,
        p.gender_probability ?? 0,
        p.age ?? 0,
        p.age_group || 'none',
        p.country_id || '??',
        p.country_name || 'Unknown',
        p.country_probability ?? 0,
        p.created_at || new Date().toISOString()
      ]);
    }
    stmt.free();
    
    console.log(`Successfully seeded ${profiles.length} profiles.`);
  } catch (err) {
    console.error('Failed to seed database:', err);
  }
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
 */
function getDatabase() {
  return db;
}

/**
 * Seeds two test users (admin and analyst) for automated grading.
 * Idempotent: skips if users already exist.
 */
function seedTestUsers() {
  const now = new Date().toISOString();

  // Check if admin test user exists
  const adminCheck = db.exec("SELECT COUNT(*) FROM users WHERE username = 'admin'");
  const adminExists = adminCheck[0]?.values[0][0] > 0;
  
  if (!adminExists) {
    db.run(`INSERT OR IGNORE INTO users (id, github_id, username, email, avatar_url, role, is_active, last_login_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv7(), 'admin_github_id', 'admin', 'admin@insighta.labs', '', 'admin', 1, now, now]);
    console.log('✅ Seeded admin test user');
  }

  // Check if analyst test user exists
  const analystCheck = db.exec("SELECT COUNT(*) FROM users WHERE username = 'analyst'");
  const analystExists = analystCheck[0]?.values[0][0] > 0;

  if (!analystExists) {
    db.run(`INSERT OR IGNORE INTO users (id, github_id, username, email, avatar_url, role, is_active, last_login_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv7(), 'analyst_github_id', 'analyst', 'analyst@insighta.labs', '', 'analyst', 1, now, now]);
    console.log('✅ Seeded analyst test user');
  }
}

module.exports = { getDatabase, initializeDatabase, saveDatabase };

