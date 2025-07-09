// Loads .env file and attaches variables to process.env
require('dotenv').config();

const express = require('express'); // Web server
const session = require('express-session'); // Session cookies
const multer = require('multer'); // Handles multipart/form-data for file uploads
const fs = require('fs'); // Node's built-in file system
const exifParser = require('exif-parser'); // Pulls GPS metadata from images
const { Pool } = require('pg'); // PostgreSQL driver
const bcrypt = require('bcrypt'); // Hash and compare passwords
const path = require('path'); // Safely build file paths for all OSes

const app = express(); // Creates Express app
const PORT = process.env.PORT || 3000; // Picks port from .env or defaults to 3000 locally

// Create connection pool to DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false // Only add SSL when deployed
});
console.log('Connected to Postgres at:', process.env.DATABASE_URL);

// Ensure uploads dir exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer stores uploaded files in /uploads
const upload = multer( { dest: 'uploads/' });

// Parse normal form submits
app.use(express.urlencoded({ extended: true }));

// Set up cookie-based sessions
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Middleware function that checks if logged in already
function requireLogin(req, res, next) {
    if (req.session.user) {
        next(); // If logged in already, continue on route
    } else {
        res.redirect('/login'); // Otherwise, redirect to login
    }
}

// Root goes to login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Route for uploaded files
app.post('/upload', requireLogin, upload.array('submission'), async (req, res) => {
    try {
        let skippedCount = 0;
        let insertedCount = 0;

        // req.files is an array of files
        for (const file of req.files) {
            // Load the uploaded file into memory as a buffer of raw bytes
            const buffer = fs.readFileSync(file.path);
            // Create an EXIF parser from the binary
            const parser = exifParser.create(buffer);
            // Run the parser, get back tagged metadata
            const result = parser.parse();

            const lat = result.tags.GPSLatitude || null;
            const lon = result.tags.GPSLongitude || null;

            // If no GPS metadata, disregard
            if (!lat || !lon) {
                skippedCount++;
                console.log(`No GPS for ${file.originalname} — skipping.`);
                fs.unlinkSync(file.path);
                continue;
            }

            // Check for duplicate
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
                skippedCount++;
                console.log(`Duplicate found for ${file.originalname} — skipping insert.`);
                fs.unlinkSync(file.path); // Delete the file
                continue; // Skip insert
            }
            
            // Insert only if no duplicate is found
            // to_timestamp converts UNIX time to SQL timestamp
            const insertQuery = `
                INSERT INTO photos (user_id, filename, originalname, filepath, lat, lon, date_taken)
                VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7))
            `;

            const insertValues = [
                req.session.user.id,
                file.filename,
                file.originalname,
                file.path,
                lat,
                lon,
                result.tags.CreateDate ? Number(result.tags.CreateDate) : null
            ];
            
            await pool.query(insertQuery, insertValues);
            insertedCount++;
        }

        res.send(`Upload complete! Added: ${insertedCount} Skipped: ${skippedCount}`);

    } catch (err) {
        console.error(err);
        res.status(500).send('Database insert failed.');
    }
});

// Route for getting uploads from DB
app.get('/uploads', requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT photos.*, users.username
            FROM photos
            JOIN users ON photos.user_id = users.id
        `);
        res.json(result.rows); // rows = all your photo records
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching uploads');
    }
});

// Login route, redirects to map route if logged in
app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/map');
    } else {
        res.sendFile(path.join(__dirname + '/login.html'));
    }
});

// Protected upload page
app.get('/upload', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname + '/upload-page.html'));
})

// Protected map page
app.get('/map', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname + '/map.html'));
})

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Login POST route
app.post('/login', async (req, res) => {
    console.log(req.body);
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT id, username, hashed_password FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];

            // Compare typed password to stored hash
            const match = await bcrypt.compare(password, user.hashed_password);

            if (match) {
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

// Serve static assets
app.use(express.static(path.join(__dirname + '/public')));

// Serve uploaded images from /uploads to URLs starting with /uploads
app.use('/uploads', express.static(path.join(__dirname + '/uploads')));

// Route for deleting photos
app.post('/delete/:id', requireLogin, async (req, res) => {
    // Pulls the :id from URL
    const photoId = req.params.id;

    try {
        // Check if photo exists and belongs to user
        const { rows } = await pool.query(
            'SELECT * FROM photos WHERE id = $1 AND user_id = $2',
            [photoId, req.session.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).send('Photo not found or not owned by you.');
        }

        const photo = rows[0];
        safeDelete(photo.filepath);

        // Delete from DB
        await pool.query('DELETE FROM photos WHERE id = $1', [photoId]);

        res.send('Photo deleted successfully.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting photo.');
    }
});

// Undefined route, sends 404 page
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname + '/404.html'));
})

// Helper function to safely delete files
function safeDelete(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    } catch (err) {
        console.error(`Could not delete ${filepath}:`, err);
    }
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});