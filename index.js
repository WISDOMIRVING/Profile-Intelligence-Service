require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
  message: { status: 'error', message: 'Too many requests' },
  validate: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per windowMs
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
  message: { status: 'error', message: 'Too many requests' },
  validate: false
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

// Simple CSRF Protection for state modifying API routes using cookies
// The frontend must send X-CSRF-Token if it authenticates via cookies
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // If authenticated via Bearer token (CLI), CSRF is not needed
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      return next();
    }
    // Only enforce CSRF for non-auth API routes
    if (req.path.startsWith('/api/')) {
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken) {
        return res.status(403).json({ status: 'error', message: 'CSRF token missing' });
      }
    }
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────
app.use('/auth', authLimiter, authRoutes);

// Protect ALL /api/* routes
app.use('/api/', authenticate, apiLimiter);
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
