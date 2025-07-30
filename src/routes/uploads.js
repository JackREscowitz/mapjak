/**
 * uploads.js
 *
 * Handles all routes related to posting, getting, and deleting uploads.
 *
 * Routes:
 *   POST   /upload       - Upload one or more images (with EXIF GPS metadata)
 *   GET    /uploads      - Get ALL uploads from database
 *   POST   /delete/:id   - Delete specified image owned by the user
 *
 * Middleware:
 *   requireLogin - ensures that these routes are only accessible to logged-in users
 *
 * Dependencies:
 *   - multer for handling file uploads
 *   - AWS S3 for file storage
 *   - PostgreSQL for metadata storage
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const exifParser = require('exif-parser');

const pool = require('../db/pool');
const { s3, PutObjectCommand, DeleteObjectCommand } = require('../utils/s3');
const requireLogin = require('../middlewares/authMiddleware');
const { uploadDir } = require('../utils/paths');

const router = express.Router();

// Ensure the upload temp directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure multer to use the correct upload temp directory
const upload = multer({ dest: uploadDir });

/**
 * POST /upload
 *
 * Upload multiple images.
 *
 * Expects:
 *   - FormData with one or more files under "submission"
 *   - Each file must include EXIF GPSLatitude and GPSLongitude metadata
 *
 * Returns:
 *   JSON:
 *     {
 *       success: [ 'file1.jpg', 'file2.jpg' ],
 *       failed: [
 *         { filename: 'file3.jpg', reason: 'Missing GPS metadata' },
 *         { filename: 'file4.png', reason: 'Duplicate photo' }
 *       ]
 *     }
 */
router.post('/upload', requireLogin, upload.array('submission'), async (req, res) => {
    try {
        const success = [];
        const failed = [];

        for (const file of req.files) {
            // Reject files that are not images
            if (!file.mimetype.startsWith('image/')) {
                failed.push({ filename: file.originalname, reason: 'Not an image file.' });
                fs.unlinkSync(file.path);
                continue;
            }

            // Load the uploaded file into memory as a buffer
            const buffer = fs.readFileSync(file.path);

            // Parse EXIF metadata
            const parser = exifParser.create(buffer);
            const result = parser.parse();

            const lat = result.tags.GPSLatitude || null;
            const lon = result.tags.GPSLongitude || null;

            // Skip file if GPS metadata is missing
            if (!lat || !lon) {
                failed.push({ filename: file.originalname, reason: 'Missing GPS metadata' });
                fs.unlinkSync(file.path);
                continue;
            }

            // Check for duplicates in DB (same user, filename, and GPS coords)
            const checkQuery = `
                SELECT * FROM photos
                WHERE user_id = $1 AND originalname = $2 AND lat = $3 AND lon = $4
            `;
            const checkValues = [
                req.session.user.id,
                file.originalname,
                lat,
                lon
            ];

            const existing = await pool.query(checkQuery, checkValues);
            if (existing.rows.length > 0) {
                failed.push({ filename: file.originalname, reason: 'Duplicate photo' });
                fs.unlinkSync(file.path);
                continue;
            }

            try {
                // Upload to S3 with a unique key
                const s3Key = `uploads/${Date.now()}-${file.originalname}`;
                const uploadParams = {
                    Bucket: process.env.S3_BUCKET,
                    Key: s3Key,
                    Body: buffer,
                    ContentType: file.mimetype
                };
                await s3.send(new PutObjectCommand(uploadParams));
                console.log(`Uploaded to S3: ${s3Key}`);

                fs.unlinkSync(file.path); // Remove temp file

                // Construct public URL for S3 object
                const s3Url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

                // Insert into DB
                const insertQuery = `
                    INSERT INTO photos (user_id, filename, originalname, filepath, lat, lon, date_taken)
                    VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7))
                `;
                const insertValues = [
                    req.session.user.id,
                    file.filename,
                    file.originalname,
                    s3Url,
                    lat,
                    lon,
                    result.tags.CreateDate ? Number(result.tags.CreateDate) : null
                ];

                await pool.query(insertQuery, insertValues);
                success.push(file.originalname);
            } catch (err) {
                console.error(err);
                failed.push({ filename: file.originalname, reason: 'Upload or DB error' });
            }
        }

        res.json({ success, failed });
        
    } catch (err) {
        console.error(err);
        res.status(500).send('Database insert failed.');
    }
});

/**
 * GET /uploads
 *
 * Fetch all uploaded photos with their metadata.
 *
 * Returns:
 *   JSON array:
 *     [
 *       {
 *         id,
 *         user_id,
 *         filename,
 *         originalname,
 *         filepath,
 *         lat,
 *         lon,
 *         date_taken,
 *         username
 *       },
 *       ...
 *     ]
 */
router.get('/uploads', requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT photos.*, users.username
            FROM photos
            JOIN users ON photos.user_id = users.id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching uploads');
    }
});

/**
 * POST /delete/:id
 *
 * Delete a specific photo owned by the logged-in user.
 *
 * Path parameters:
 *   :id - ID of the photo to delete
 *
 * Returns:
 *   200 OK with plain text on success
 *   404 if the photo doesn't exist or doesn't belong to the user
 */
router.post('/delete/:id', requireLogin, async (req, res) => {
    const photoId = req.params.id;

    try {
        // Verify the photo exists and belongs to this user
        const { rows } = await pool.query(
            'SELECT * FROM photos WHERE id = $1 AND user_id = $2',
            [photoId, req.session.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).send('Photo not found or not owned by you.');
        }

        const photo = rows[0];

        // Delete the file from S3
        const s3Key = new URL(photo.filepath).pathname.slice(1);
        await s3.send(new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key
        }));
        console.log(`Deleted from S3: ${s3Key}`);

        // Remove metadata record from DB
        await pool.query('DELETE FROM photos WHERE id = $1', [photoId]);

        res.send('Photo deleted successfully.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting photo.');
    }
});

module.exports = router;
