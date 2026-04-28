const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v7: uuidv7 } = require('uuid');
const { getDatabase, saveDatabase } = require('../db');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'dummy_client_id';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'dummy_client_secret';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3005';

// Generate access token (3 minutes)
function generateAccessToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '3m' });
}

// Generate refresh token (5 minutes)
function generateRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const db = getDatabase();
  db.run('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expiresAt]);
  saveDatabase();
  return token;
}

// GET /auth/github - Redirect to GitHub for Web
router.get('/github', (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=user:email`;
  res.redirect(githubAuthUrl);
});

// GET /auth/github/callback
router.get('/github/callback', async (req, res) => {
  const { code, code_verifier, state, redirect_uri } = req.query;

  if (!code) {
    return res.status(400).json({ status: 'error', message: 'Missing code' });
  }

  try {
    // 1. Exchange code for access token
    const tokenParams = {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code
    };
    if (code_verifier) tokenParams.code_verifier = code_verifier;
    if (redirect_uri) tokenParams.redirect_uri = redirect_uri; // For CLI

    const tokenRes = await axios.post('https://github.com/login/oauth/access_token', tokenParams, {
      headers: { Accept: 'application/json' }
    });

    const githubToken = tokenRes.data.access_token;
    if (!githubToken) {
      return res.status(400).json({ status: 'error', message: 'Failed to retrieve GitHub access token', details: tokenRes.data });
    }

    // 2. Get User Info
    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubToken}` }
    });
    
    // Also get emails
    const emailRes = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${githubToken}` }
    });
    
    const githubUser = userRes.data;
    const primaryEmail = emailRes.data.find(e => e.primary)?.email || githubUser.email || '';

    // 3. Create or Update User in DB
    const db = getDatabase();
    const existingUserStmt = db.prepare('SELECT * FROM users WHERE github_id = ?');
    existingUserStmt.bind([githubUser.id.toString()]);
    let user = null;
    if (existingUserStmt.step()) {
      user = existingUserStmt.getAsObject();
    }
    existingUserStmt.free();

    const now = new Date().toISOString();
    
    if (user) {
      db.run('UPDATE users SET last_login_at = ?, avatar_url = ?, username = ?, email = ? WHERE id = ?', 
        [now, githubUser.avatar_url, githubUser.login, primaryEmail, user.id]);
    } else {
      user = {
        id: uuidv7(),
        github_id: githubUser.id.toString(),
        username: githubUser.login,
        email: primaryEmail,
        avatar_url: githubUser.avatar_url,
        role: 'analyst', // Default role
        is_active: 1,
        last_login_at: now,
        created_at: now
      };
      db.run(`INSERT INTO users (id, github_id, username, email, avatar_url, role, is_active, last_login_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.github_id, user.username, user.email, user.avatar_url, user.role, user.is_active, user.last_login_at, user.created_at]);
    }
    saveDatabase();

    // 4. Issue Tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Set Cookies for Web
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3 * 60 * 1000 // 3 mins
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60 * 1000 // 5 mins
    });

    // Determine if CLI or Web
    // If it's a browser requesting HTML, redirect to Web Portal dashboard
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html') && !code_verifier) {
      return res.redirect(`${WEB_URL}/dashboard`);
    }

    // Otherwise (CLI or JSON request), return JSON
    return res.status(200).json({
      status: 'success',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });

  } catch (err) {
    console.error('GitHub Auth Error:', err.response?.data || err.message);
    return res.status(500).json({ status: 'error', message: 'Authentication failed' });
  }
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  // Can be in body or cookies
  const refreshToken = req.body.refresh_token || req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ status: 'error', message: 'Refresh token required' });
  }

  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?');
  stmt.bind([refreshToken]);
  let storedToken = null;
  if (stmt.step()) {
    storedToken = stmt.getAsObject();
  }
  stmt.free();

  if (!storedToken) {
    return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
  }

  if (new Date() > new Date(storedToken.expires_at)) {
    db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    saveDatabase();
    return res.status(401).json({ status: 'error', message: 'Refresh token expired' });
  }

  // Invalidate old refresh token
  db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
  
  // Issue new pair
  const newAccessToken = generateAccessToken(storedToken.user_id);
  const newRefreshToken = generateRefreshToken(storedToken.user_id);

  // Set Cookies for Web
  res.cookie('access_token', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3 * 60 * 1000
  });
  res.cookie('refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 5 * 60 * 1000
  });

  return res.status(200).json({
    status: 'success',
    access_token: newAccessToken,
    refresh_token: newRefreshToken
  });
});

// POST /auth/logout
router.post('/logout', authenticate, (req, res) => {
  const refreshToken = req.body.refresh_token || req.cookies?.refresh_token;
  
  if (refreshToken) {
    const db = getDatabase();
    db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    saveDatabase();
  }

  res.clearCookie('access_token');
  res.clearCookie('refresh_token');

  return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

module.exports = router;
