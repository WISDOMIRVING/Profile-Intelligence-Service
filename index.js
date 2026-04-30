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

// Trust proxy — required for rate limiting behind Railway reverse proxy
app.set('trust proxy', true);

// ─── Logging ───────────────────────────────────────────────
// Format: Method, Endpoint, Status code, Response time (ms)
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// ─── Rate Limiters ─────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: 'error', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { status: 'error', message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Limit per user if authenticated, else per IP
    return req.user ? req.user.id : req.ip;
  }
});

// Apply limits
app.use('/auth', authLimiter);
app.use('/api', apiLimiter);

// ─── Global Middleware ──────────────────────────────────────
app.use(cors({
  origin: process.env.WEB_URL || 'https://insighta-web-phi.vercel.app',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// ─── CSRF Protection ────────────────────────────────────────
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }
    const cookieToken = req.cookies.csrf_token;
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ status: 'error', message: 'CSRF token mismatch' });
    }
  }
  next();
});

// ─── Routes ────────────────────────────────────────────────
app.use('/auth', authRoutes);

app.use('/api', authenticate, (req, res, next) => {
  const version = req.headers['x-api-version'];
  if (version !== '1') {
    return res.status(400).json({ status: 'error', message: 'API version header required' });
  }
  next();
}, profileRoutes);

// User Identity endpoint
app.get('/api/users/me', authenticate, (req, res) => {
  res.json({
    status: 'success',
    data: req.user
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Startup ───────────────────────────────────────────────
async function start() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
