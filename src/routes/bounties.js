/**
 * bounties.js
 *
 * Handles all routes related to bounty pins on the map.
 *
 * Routes:
 *   POST   /bounties       - Create a new bounty pin
 *   GET    /bounties       - Get ALL bounties from the database
 *   DELETE /bounties/:id   - Delete a bounty owned by the user
 *
 * Middleware:
 *   requireLogin - ensures that these routes are only accessible to logged-in users
 *
 * Dependencies:
 *   - PostgreSQL for storing bounty locations and claimed state
 */

const express = require('express');
const pool = require('../db/pool');
const requireLogin = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /bounties
 *
 * Creates a new bounty pin at a given lat/lon for the logged-in user.
 *
 * Expects JSON body:
 *   { lat: number, lng: number }
 *
 * Returns:
 *   JSON:
 *     {
 *       id,
 *       user_id,
 *       lat,
 *       lon,
 *       created_at,
 *       claimed_at
 *     }
 */
router.post('/bounties', requireLogin, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).send('Missing latitude or longitude.');
    }

    const result = await pool.query(
      `INSERT INTO bounties (user_id, lat, lon)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.session.user.id, lat, lng]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting bounty:', err);
    res.status(500).send('Error creating bounty.');
  }
});

/**
 * GET /bounties
 *
 * Fetch all bounties (claimed and unclaimed) with the username of the placer.
 *
 * Returns:
 *   JSON array:
 *     [
 *       {
 *         id,
 *         user_id,
 *         username,
 *         lat,
 *         lon,
 *         created_at,
 *         claimed_at
 *       },
 *       ...
 *     ]
 */
router.get('/bounties', requireLogin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bounties.*, users.username
      FROM bounties
      JOIN users ON bounties.user_id = users.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching bounties:', err);
    res.status(500).send('Error fetching bounties.');
  }
});

/**
 * DELETE /bounties/:id
 *
 * Delete a bounty if it belongs to the logged-in user.
 *
 * Path parameters:
 *   :id - ID of the bounty to delete
 *
 * Returns:
 *   200 OK JSON:
 *     { success: true }
 *   404 if the bounty doesn't exist or doesn't belong to the user
 */
router.delete('/bounties/:id', requireLogin, async (req, res) => {
  const bountyId = req.params.id;

  try {
    // Ensure the bounty belongs to the logged-in user
    const { rows } = await pool.query(
      'SELECT * FROM bounties WHERE id = $1 AND user_id = $2',
      [bountyId, req.session.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).send('Bounty not found or not owned by you.');
    }

    await pool.query('DELETE FROM bounties WHERE id = $1', [bountyId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting bounty:', err);
    res.status(500).send('Error deleting bounty.');
  }
});

module.exports = router;
