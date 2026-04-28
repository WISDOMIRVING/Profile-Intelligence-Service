const jwt = require('jsonwebtoken');
const { getDatabase } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

function requireApiVersion(req, res, next) {
  const version = req.headers['x-api-version'];
  if (version !== '1') {
    return res.status(400).json({
      status: 'error',
      message: 'API version header required'
    });
  }
  next();
}

function authenticate(req, res, next) {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = getDatabase();
    
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    stmt.bind([payload.userId]);
    let user = null;
    if (stmt.step()) {
      user = stmt.getAsObject();
    }
    stmt.free();

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User not found' });
    }
    
    // Check if user is active, although sqlite doesn't boolean type, 1 is true
    if (user.is_active === 0 || user.is_active === false) {
      return res.status(403).json({ status: 'error', message: 'User is deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 'error', message: 'Authentication required' });
    }
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: `Requires ${role} role` });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  requireApiVersion,
  authenticate,
  requireRole
};
