const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const exifParser = require('exif-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;
const UPLOADS_JSON = './uploads.json'; // File path for database (temp)

// USER DATA (Might want to change this to be sourced from a database)
const users = [
    { username: 'Jack Escowitz', password: 'baobao' }
]

const pool = new Pool({
    user: 'postgres', // Postgres user
    host: 'localhost', // Local server
    database: 'mapjak', // Created DB
    password: 'simpleflips', // Postgres password
    port: 5432 // Default Postgres port
});

// Store uploaded files in /uploads
const upload = multer( { dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key', // TODO: should change this
    resave: false,
    saveUninitialized: false
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

        for (const file of req.files) {
            // Load the uploaded file into memory as a buffer of raw bytes
            const buffer = fs.readFileSync(file.path);
            // Create an EXIF parser from the binary
            const parser = exifParser.create(buffer);
            // Run the parser, get back tagged metadata
            const result = parser.parse();

            const lat = result.tags.GPSLatitude || null;
            const lon = result.tags.GPSLongitude || null;

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
            const insertQuery = `
                INSERT INTO photos (user_id, filename, originalname, filepath, lat, lon, date_taken)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;

            const insertValues = [
                req.session.user.id,
                file.filename,
                file.originalname,
                file.path,
                lat,
                lon,
                result.tags.CreateDate || null
            ];
            
            await pool.query(insertQuery, insertValues);
            insertedCount++;
        }

        res.send(`Upload complete! Added: ${insertedCount} Duplicates skipped: ${skippedCount}`);

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
        res.sendFile(__dirname + '/login.html');
    }
});

// Protected upload page
app.get('/upload', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/upload-page.html');
})

// Protected map page
app.get('/map', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/map.html');
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
app.use(express.static(__dirname + '/public'));

// Serve uploaded images from /uploads to URLs starting with /uploads
app.use('/uploads', express.static(__dirname + '/uploads'));

// Undefined route, sends 404 page
app.use((req, res) => {
    res.status(404).sendFile(__dirname + '/404.html');
})

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});