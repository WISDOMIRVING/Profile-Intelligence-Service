const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./db');
const profileRoutes = require('./routes/profiles');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────
app.use(cors());            // Access-Control-Allow-Origin: *
app.use(express.json());    // Parse JSON request bodies

// ─── Routes ───────────────────────────────────────────────
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
