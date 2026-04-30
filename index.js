require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { initializeDatabase } = require('./db');
const profileRoutes = require('./routes/profiles');

const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Rate Limiters ─────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per windowMs per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
  validate: false,
  message: { status: 'error', message: 'Too many requests' }
});

// ─── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: process.env.WEB_URL || 'https://insighta-web-phi.vercel.app',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Custom Morgan Logging Format (Method, Endpoint, Status code, Response time)
app.use(morgan(':method :url :status :response-time ms'));

// ─── CSRF Protection (Double-Submit Cookie Pattern) ───────
// For state-modifying requests from the web (cookie-based auth),
// the frontend must read the csrf_token cookie and send it 
// back as the X-CSRF-Token header. The server validates they match.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // CLI uses Bearer tokens — CSRF not needed
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      return next();
    }
    // Only enforce CSRF for API routes (not auth routes)
    if (req.path.startsWith('/api/')) {
      const csrfHeader = req.headers['x-csrf-token'];
      const csrfCookie = req.cookies?.csrf_token;
      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        return res.status(403).json({ status: 'error', message: 'CSRF token missing or invalid' });
      }
    }
  }
  next();
});

// ─── API Versioning Middleware ─────────────────────────────
app.use('/api', (req, res, next) => {
  const version = req.headers['x-api-version'];
  if (version !== '1') {
    return res.status(400).json({ status: 'error', message: 'API version header required' });
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────
app.use('/auth', authLimiter, authRoutes);

// Protect ALL /api/* routes
app.use('/api/', authenticate, apiLimiter);

// User Management
app.get('/api/users/me', (req, res) => {
  res.json({ 
    status: 'success', 
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      avatar_url: req.user.avatar_url,
      role: req.user.role,
      is_active: req.user.is_active,
      last_login_at: req.user.last_login_at,
      created_at: req.user.created_at
    }
  });
});

app.use('/api/profiles', profileRoutes);

// ─── 404 catch-all ────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

// ─── Initialize DB then start server ──────────────────────
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`✅ Profile Intelligence Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
