/**
 * pages.js
 *
 * Routes for serving static HTML pages and simple health checks.
 *
 * Routes:
 *   GET /            - Redirect root to /login
 *   GET /upload      - Serve the protected upload page
 *   GET /map         - Serve the protected map page
 *   GET /healthz     - Simple health check (returns 'OK')
 *
 * Middleware:
 *   requireLogin - ensures that certain pages are accessible only to logged-in users
 *
 * Notes:
 *   - Static HTML files are served directly from the /public directory.
 *   - Use these routes to display pages; API endpoints belong in other route files.
 */

const express = require('express');
const path = require('path');
const requireLogin = require('../middlewares/authMiddleware'); // <-- important
const { rootDir } = require('../utils/paths');

const router = express.Router();

/**
 * GET /
 *
 * Redirects the root URL to the login page.
 */
router.get('/', (req, res) => {
    res.redirect('/login');
});

/**
 * GET /upload
 *
 * Serves the protected upload page.
 *
 * Requires:
 *   - Logged-in user (via requireLogin)
 *
 * Returns:
 *   - Static HTML file: /public/upload-page.html
 */
router.get('/upload', requireLogin, (req, res) => {
    res.sendFile(path.join(rootDir, 'public', 'upload-page.html'));
});

/**
 * GET /map
 *
 * Serves the protected map page.
 *
 * Requires:
 *   - Logged-in user (via requireLogin)
 *
 * Returns:
 *   - Static HTML file: /public/map.html
 */
router.get('/map', requireLogin, (req, res) => {
    res.sendFile(path.join(rootDir, 'public', 'map.html'));
});

/**
 * GET /healthz
 *
 * Health check route used for uptime monitoring.
 *
 * Returns:
 *   - Text response: "OK"
 */
router.get('/healthz', (req, res) => res.send('OK'));

module.exports = router;
