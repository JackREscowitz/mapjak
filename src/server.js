/**
 * server.js
 *
 * Entry point for the Mapjak application.
 * - Loads environment variables
 * - Sets up Express app with sessions and middleware
 * - Mounts route modules
 * - Serves static assets
 * - Starts the HTTP server
 */

require('dotenv').config(); // Load .env into process.env

const express = require('express');
const session = require('express-session');
const path = require('path');

// Local modules
const { uploadDir, rootDir } = require('./utils/paths');
const uploadRoutes = require('./routes/uploads');
const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const bountyRoutes = require('./routes/bounties');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------
// Middleware setup
// -------------------------

// Parse URL-encoded and JSON request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Honor proxy headers (needed on some hosts for HTTPS detection)
app.set('trust proxy', 1);

// Configure cookie-based sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' // requires HTTPS in production
  }
}));

// -------------------------
// Static assets
// -------------------------

// Serve static files from /public
app.use(express.static(path.join(rootDir, 'public')));

// Serve user-uploaded images
app.use('/uploads', express.static(uploadDir));

// -------------------------
// Routes
// -------------------------

// Modular route handlers
app.use(authRoutes);
app.use(pageRoutes);
app.use(uploadRoutes);
app.use(bountyRoutes);

// -------------------------
// 404 fallback
// -------------------------

app.use((req, res) => {
  res.status(404).sendFile(path.join(rootDir, 'public', '404.html'));
});

// -------------------------
// Server start
// -------------------------

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
