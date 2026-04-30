const express = require('express');
const router = express.Router();
const { v7: uuidv7 } = require('uuid');
const { getDatabase, saveDatabase } = require('../db');
const { enrichProfile } = require('../services/enrichment');
const { validateCreateProfile } = require('../middleware/validation');
const { requireRole, requireApiVersion } = require('../middleware/auth');
const { Parser } = require('json2csv');



/**
 * Helper: Runs a sql.js SELECT query and returns an array of row objects.
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
 */
router.post('/', requireRole('admin'), validateCreateProfile, async (req, res) => {
  try {
    const name = req.body.name.trim();
    const db = getDatabase();

    const existing = queryOne(db, 'SELECT * FROM profiles WHERE name = ? COLLATE NOCASE', [name]);
    if (existing) {
      return res.status(200).json({
        status: 'success',
        message: 'Profile already exists',
        data: existing
      });
    }

    const enriched = await enrichProfile(name);

    const profile = {
      id: uuidv7(),
      name,
      gender: enriched.gender,
      gender_probability: enriched.gender_probability,
      age: enriched.age,
      age_group: enriched.age_group,
      country_id: enriched.country_id,
      country_name: enriched.country_name,
      country_probability: enriched.country_probability,
      created_at: new Date().toISOString()
    };

    db.run(`
      INSERT INTO profiles (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      profile.id, profile.name, profile.gender, profile.gender_probability,
      profile.age, profile.age_group, profile.country_id, profile.country_name,
      profile.country_probability, profile.created_at
    ]);

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
 * Helper: Builds WHERE clause and sorting for profile queries
 */
function buildProfilesQuery(queryOptions) {
  let { 
    gender, age_group, country_id, 
    min_age, max_age, 
    min_gender_probability, min_country_probability,
    sort_by, order
  } = queryOptions;

  let whereClause = '1=1';
  const params = [];

  if (gender) {
    whereClause += ' AND gender = ?';
    params.push(gender.toLowerCase());
  }
  if (age_group) {
    whereClause += ' AND age_group = ?';
    params.push(age_group.toLowerCase());
  }
  if (country_id) {
    whereClause += ' AND country_id = ?';
    params.push(country_id.toUpperCase());
  }
  if (min_age) {
    whereClause += ' AND age >= ?';
    params.push(parseInt(min_age));
  }
  if (max_age) {
    whereClause += ' AND age <= ?';
    params.push(parseInt(max_age));
  }
  if (min_gender_probability) {
    whereClause += ' AND gender_probability >= ?';
    params.push(parseFloat(min_gender_probability));
  }
  if (min_country_probability) {
    whereClause += ' AND country_probability >= ?';
    params.push(parseFloat(min_country_probability));
  }

  const validSortFields = ['age', 'created_at', 'gender_probability'];
  const validOrders = ['asc', 'desc'];
  sort_by = validSortFields.includes(sort_by) ? sort_by : 'created_at';
  order = validOrders.includes(order?.toLowerCase()) ? order.toLowerCase() : 'desc';

  return { whereClause, params, sort_by, order };
}

/**
 * GET /api/profiles/export
 * Admin only can export
 */
router.get('/export', requireRole('admin'), (req, res) => {
  try {
    if (req.query.format !== 'csv') {
      return res.status(400).json({ status: 'error', message: 'Only csv format is supported' });
    }

    const db = getDatabase();
    const { whereClause, params, sort_by, order } = buildProfilesQuery(req.query);

    const profiles = queryAll(db, `
      SELECT * FROM profiles 
      WHERE ${whereClause} 
      ORDER BY ${sort_by} ${order}
    `, params);

    const fields = ['id', 'name', 'gender', 'gender_probability', 'age', 'age_group', 'country_id', 'country_name', 'country_probability', 'created_at'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(profiles);

    res.header('Content-Type', 'text/csv');
    res.attachment(`profiles_${Date.now()}.csv`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('GET /api/profiles/export error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * Core handler for GET /api/profiles
 */
function getProfilesHandler(req, res) {
  try {
    const db = getDatabase();
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ status: 'error', message: 'Invalid query parameters' });
    }

    const { whereClause, params, sort_by, order } = buildProfilesQuery(req.query);

    // Total count
    const countRes = queryOne(db, `SELECT COUNT(*) as total FROM profiles WHERE ${whereClause}`, params);
    const total = countRes.total;
    const total_pages = Math.ceil(total / limit);

    // Pagination
    const offset = (page - 1) * limit;
    const profiles = queryAll(db, `
      SELECT * FROM profiles 
      WHERE ${whereClause} 
      ORDER BY ${sort_by} ${order} 
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    // Build Links
    const baseUrl = req.path === '/' ? '/api/profiles' : `/api/profiles${req.path}`;
    const buildUrl = (p) => {
      if (p < 1 || p > total_pages) return null;
      const urlParams = new URLSearchParams(req.query);
      urlParams.set('page', p);
      urlParams.set('limit', limit);
      return `${baseUrl}?${urlParams.toString()}`;
    };

    return res.status(200).json({
      status: 'success',
      page,
      limit,
      total,
      total_pages,
      links: {
        self: buildUrl(page),
        next: buildUrl(page + 1),
        prev: buildUrl(page - 1)
      },
      data: profiles
    });
  } catch (err) {
    console.error('getProfilesHandler error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

/**
 * GET /api/profiles
 */
router.get('/', (req, res) => getProfilesHandler(req, res));

/**
 * Natural Language Query Parser Helper
 */
function parseNLQ(query) {
  const q = query.toLowerCase();
  const filters = {};

  if (q.includes('young')) {
    filters.min_age = 16;
    filters.max_age = 24;
  }
  if (q.includes('male') && q.includes('female')) {
    // No gender restriction if both mentioned
  } else if (q.includes('male')) {
    filters.gender = 'male';
  } else if (q.includes('female')) {
    filters.gender = 'female';
  }
  
  if (q.includes('teenager')) filters.age_group = 'teenager';
  if (q.includes('adult')) filters.age_group = 'adult';
  if (q.includes('senior')) filters.age_group = 'senior';

  const aboveMatch = q.match(/above (\d+)/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1]);
  }

  // Common countries mapping for NLQ (can be expanded)
  const countries = {
    'nigeria': 'NG',
    'angola': 'AO',
    'kenya': 'KE',
    'benin': 'BJ',
    'ghana': 'GH',
    'south africa': 'ZA'
  };
  
  for (const [name, id] of Object.entries(countries)) {
    if (q.includes(name)) {
      filters.country_id = id;
      break;
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

/**
 * GET /api/profiles/search
 * Natural Language Query
 */
router.get('/search', (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;
    if (!q) {
      return res.status(400).json({ status: 'error', message: 'Missing or empty parameter' });
    }

    const filters = parseNLQ(q);
    if (!filters) {
      return res.status(400).json({ status: 'error', message: 'Unable to interpret query' });
    }

    // Reuse core handler
    req.query = { ...req.query, ...filters };
    return getProfilesHandler(req, res);
  } catch (err) {
    console.error('GET /api/profiles/search error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * GET /api/profiles/:id
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const profile = queryOne(db, 'SELECT * FROM profiles WHERE id = ?', [req.params.id]);

    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    return res.status(200).json({ status: 'success', data: profile });
  } catch (err) {
    console.error('GET /api/profiles/:id error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

/**
 * DELETE /api/profiles/:id
 */
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDatabase();
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
