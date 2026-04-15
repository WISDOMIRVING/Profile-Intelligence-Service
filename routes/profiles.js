const express = require('express');
const router = express.Router();
const { v7: uuidv7 } = require('uuid');
const { getDatabase, saveDatabase } = require('../db');
const { enrichProfile } = require('../services/enrichment');
const { validateCreateProfile } = require('../middleware/validation');

/**
 * Helper: Runs a sql.js SELECT query and returns an array of row objects.
 * sql.js returns rows as arrays of values — this converts them to { col: val } objects.
 */
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: Runs a sql.js SELECT query and returns the first row as an object, or null.
 */
function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * POST /api/profiles
 * Creates a new profile by enriching the given name via external APIs.
 * Idempotent: returns existing profile if name already exists.
 */
router.post('/', validateCreateProfile, async (req, res) => {
  try {
    const name = req.body.name.trim().toLowerCase();
    const db = getDatabase();

    // Idempotency check — return existing profile if name already stored
    const existing = queryOne(db, 'SELECT * FROM profiles WHERE name = ?', [name]);
    if (existing) {
      return res.status(200).json({
        status: 'success',
        message: 'Profile already exists',
        data: existing
      });
    }

    // Enrich the name using external APIs
    const enriched = await enrichProfile(name);

    // Build profile object
    const profile = {
      id: uuidv7(),
      name,
      gender: enriched.gender,
      gender_probability: enriched.gender_probability,
      sample_size: enriched.sample_size,
      age: enriched.age,
      age_group: enriched.age_group,
      country_id: enriched.country_id,
      country_probability: enriched.country_probability,
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    };

    // Persist to database
    db.run(`
      INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      profile.id,
      profile.name,
      profile.gender,
      profile.gender_probability,
      profile.sample_size,
      profile.age,
      profile.age_group,
      profile.country_id,
      profile.country_probability,
      profile.created_at
    ]);

    // Save to disk
    saveDatabase();

    return res.status(201).json({
      status: 'success',
      data: profile
    });
  } catch (err) {
    if (err.status === 502) {
      return res.status(502).json({ status: 'error', message: err.message });
    }
    console.error('POST /api/profiles error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * GET /api/profiles
 * Returns all profiles, with optional case-insensitive filters:
 * ?gender=male&country_id=NG&age_group=adult
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { gender, country_id, age_group } = req.query;

    let query = 'SELECT id, name, gender, age, age_group, country_id FROM profiles WHERE 1=1';
    const params = [];

    if (gender) {
      query += ' AND LOWER(gender) = LOWER(?)';
      params.push(gender);
    }

    if (country_id) {
      query += ' AND LOWER(country_id) = LOWER(?)';
      params.push(country_id);
    }

    if (age_group) {
      query += ' AND LOWER(age_group) = LOWER(?)';
      params.push(age_group);
    }

    const profiles = queryAll(db, query, params);

    return res.status(200).json({
      status: 'success',
      count: profiles.length,
      data: profiles
    });
  } catch (err) {
    console.error('GET /api/profiles error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * GET /api/profiles/:id
 * Returns a single profile by its UUID.
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const profile = queryOne(db, 'SELECT * FROM profiles WHERE id = ?', [req.params.id]);

    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    return res.status(200).json({
      status: 'success',
      data: profile
    });
  } catch (err) {
    console.error('GET /api/profiles/:id error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * DELETE /api/profiles/:id
 * Deletes a profile by its UUID. Returns 204 on success.
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Check if profile exists first
    const profile = queryOne(db, 'SELECT id FROM profiles WHERE id = ?', [req.params.id]);
    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    db.run('DELETE FROM profiles WHERE id = ?', [req.params.id]);
    saveDatabase();

    return res.sendStatus(204);
  } catch (err) {
    console.error('DELETE /api/profiles/:id error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

module.exports = router;
