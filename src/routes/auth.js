/**
 * auth.js
 *
 * Routes for user authentication: login (GET/POST) and logout.
 *
 * Routes:
 *   GET  /login   - Serve login page or redirect if already logged in
 *   POST /login   - Authenticate user credentials and start a session
 *   GET  /logout  - Destroy the current session and redirect to /login
 *
 * Notes:
 *   - Passwords are verified using bcrypt against hashed passwords stored in the DB.
 *   - Successful login creates req.session.user with user ID and username.
 *   - Logout clears the session entirely.
 */

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');

const pool = require('../db/pool');
const { rootDir } = require('../utils/paths');

const router = express.Router();

/**
 * GET /login
 *
 * If the user is already logged in, redirect to /map.
 * Otherwise, serve the login page.
 *
 * Returns:
 *   - Redirect to /map if session exists
 *   - Static HTML file: /public/login.html if not logged in
 */
router.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/map');
    } else {
        res.sendFile(path.join(rootDir, 'public', 'login.html'));
    }
});

/**
 * POST /login
 *
 * Validate username and password, create a session on success.
 *
 * Expects:
 *   - JSON or urlencoded form body:
 *       { username: string, password: string }
 *
 * Returns:
 *   - "success" if credentials are valid
 *   - "Invalid username or password." if authentication fails
 *   - 500 status on database or server error
 */
router.post('/login', async (req, res) => {
    console.log(req.body);
    const { username, password } = req.body;

    try {
        // Look up the user by username
        const result = await pool.query(
            'SELECT id, username, hashed_password FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];

            // Compare plain-text password with stored hash
            const match = await bcrypt.compare(password, user.hashed_password);

            if (match) {
                // Save session data
                req.session.user = { id: user.id, username: user.username };
                res.send('success');
            } else {
                res.send('Invalid username or password.');
            }
        } else {
            res.send('Invalid username or password.');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Login error, something went wrong.');
    }
});

/**
 * GET /logout
 *
 * Destroy the user session and redirect back to /login.
 *
 * Returns:
 *   - Redirect to /login
 */
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;
