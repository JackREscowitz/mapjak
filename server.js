const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const exifParser = require('exif-parser');
const app = express();
const PORT = 3000;
const UPLOADS_JSON = './uploads.json'; // File path for database (temp)

// USER DATA (Might want to change this to be sourced from a database)
const users = [
    { username: 'Jack Escowitz', password: 'baobao' }
]

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

// Helper function to read current records
function readUploads() {
    if (!fs.existsSync(UPLOADS_JSON)) {
        return [];
    }
    const data = fs.readFileSync(UPLOADS_JSON);
    return JSON.parse(data); // Returns JS array of objects
}

// Helper function to write new records
function saveUploads(data) {
    fs.writeFileSync(UPLOADS_JSON, JSON.stringify(data, null, 2));
}

// Root goes to login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Route for uploaded files
app.post('/upload', requireLogin, upload.array('submission'), (req, res) => {
    // Get current records so we append and not overwrite
    const uploads = readUploads(); 

    req.files.forEach(file => {
        // Load the uploaded file into memory as a buffer of raw bytes
        const buffer = fs.readFileSync(file.path);
        // Create an EXIF parser from the binary
        const parser = exifParser.create(buffer);
        // Run the parser, get back tagged metadata
        const result = parser.parse();

        const record = {
            user: req.session.user.username,
            filename: file.filename,
            originalname: file.originalname,
            path: file.path,
            gps: {
                lat: result.tags.GPSLatitude || null,
                lon: result.tags.GPSLongitude || null
            },
            dateTaken: result.tags.DateTimeOriginal || null,
            uploadedAt: new Date().toISOString()
        };

        uploads.push(record); // Append new record to growing list

    });

    saveUploads(uploads); // Write the updated list uploads

    res.send('Upload successful and metadata saved!');
})

// Route for getting uploads.json
app.get('/uploads', requireLogin, (req, res) => {
    const uploads = readUploads();
    res.json(uploads); // Send it as JSON
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
app.post('/login', (req, res) => {
    console.log(req.body);
    const { username, password } = req.body;

    const user = users.find(user => user.username === username && user.password === password);

    if (user) {
        // Store username in the session
        req.session.user = { username: user.username };
        res.send('success');
    } else {
        res.send('Invalid username or password.');
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