/**
 * bounties.js
 *
 * Handles all routes related to bounty pins on the map.
 *
 * Routes:
 *   POST   /bounties              - Create a new bounty pin
 *   GET    /bounties              - Get ALL bounties from the database
 *   DELETE /bounties/:id          - Delete a bounty owned by the user
 *   POST   /bounties/:id/claim    - Claim a bounty by uploading a photo (removes the bounty and creates an upload)
 *
 * Middleware:
 *   requireLogin - ensures that these routes are only accessible to logged-in users
 *
 * Dependencies:
 *   - PostgreSQL for storing bounty locations and claimed state
 *   - AWS S3 (via existing S3 client) for storing uploaded photos
 *   - multer for handling file uploads
 *
 * Workflow:
 *   - A logged-in user can place up to 10 bounties on the map.
 *   - Each bounty belongs to the user who created it.
 *   - Claiming a bounty involves uploading a photo to the `/bounties/:id/claim` route.
 *     - If successful:
 *       1. The uploaded photo is stored in S3 and added to the uploads table.
 *       2. The bounty is deleted (or could be marked as claimed if preferred).
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');

const pool = require('../db/pool');
const requireLogin = require('../middlewares/authMiddleware');
const { uploadDir } = require('../utils/paths');
const { s3, PutObjectCommand, DeleteObjectCommand } = require('../utils/s3');

const router = express.Router();

// Ensure the upload temp directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure multer to use the correct upload temp directory
const upload = multer({ dest: uploadDir });

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
      WHERE bounties.claimed = false
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


/**
 * POST /bounties/:id/claim
 *
 * Claim a bounty by uploading a photo.
 *
 * Expects:
 *   - FormData with a single file under "photo"
 *
 * Workflow:
 *   1. Verify that the bounty belongs to the current user.
 *   2. Upload the provided photo to S3.
 *   3. Insert the photo record into the photos table (lat/lon = bounty location).
 *   4. Remove the bounty from the database.
 *
 * Returns:
 *   200 OK with a success message
 *   400 if the uploaded file is not an image
 *   403 if the bounty doesn’t belong to the user
 */
router.post('/bounties/:id/claim', requireLogin, upload.single('photo'), async (req, res) => {
  const bountyId = req.params.id;

  try {
    // 1. Verify bounty exists and belongs to the user
    const { rows } = await pool.query(
      'SELECT * FROM bounties WHERE id = $1 AND user_id = $2',
      [bountyId, req.session.user.id]
    );

    if (rows.length === 0) {
      return res.status(403).send('You can only claim your own bounties.');
    }

    const bounty = rows[0];

    const file = req.file;

    // Basic file validation
    if (!file.mimetype.startsWith('image/')) {
      fs.unlinkSync(file.path);
      return res.status(400).send('Uploaded file is not an image.');
    }

    // 2. Upload to S3
    const key = `uploads/${Date.now()}_${file.originalname}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: fs.readFileSync(file.path),
      ContentType: file.mimetype,
    }));

    // Remove temp file
    fs.unlinkSync(file.path);

    // Construct S3 URL
    const fileUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    const uniqueOriginalname = `${file.originalname}-bounty${bounty.id}`;

    // 3. Insert into photos table (link to bounty)
    await pool.query(
      `INSERT INTO photos (user_id, filename, originalname, filepath, lat, lon, date_taken, bounty_id)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)`,
      [
      req.session.user.id,
      file.filename,
      uniqueOriginalname,
      fileUrl,
      bounty.lat,
      bounty.lon,
      bounty.id
      ]
    );

    // 4. Mark bounty as claimed
    await pool.query(
      'UPDATE bounties SET claimed = true WHERE id = $1',
      [bountyId]
    );

    res.status(200).send('Bounty claimed successfully.');
  } catch (err) {
    console.error('Error claiming bounty:', err);
    res.status(500).send('Error claiming bounty.');
  }
});


/**
 * GET /bounties/leaderboard
 *
 * Returns the top 10 users with the most claimed bounties.
 */
router.get('/bounties/leaderboard', requireLogin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT users.username, COUNT(*) AS claims
      FROM photos
      JOIN users ON photos.user_id = users.id
      WHERE photos.bounty_id IS NOT NULL
      GROUP BY users.username
      ORDER BY claims DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    res.status(500).send('Error fetching leaderboard.');
  }
});


module.exports = router;
