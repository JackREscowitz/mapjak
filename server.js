const express = require('express');
const session = require('express-session');
const app = express();
const PORT = 3000;

// USER DATA (Might want to change this to be sourced from a database)
const users = [
    { username: 'Jack Escowitz', password: 'baobao' }
]

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

// Login route, redirects to upload route if logged in
app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/upload');
    } else {
        res.sendFile(__dirname + '/login.html');
    }
});

// Protected upload page
app.get('/upload', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/upload-page.html');
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

// Undefined route, sends 404 page
app.use((req, res) => {
    res.status(404).sendFile(__dirname + '/404.html');
})

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});