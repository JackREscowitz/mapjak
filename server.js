const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));

// Handles login POST request
app.post('/login', (req, res) => {
    console.log(req.body);
    const { username, password } = req.body;
    if (username === 'admin' && password === 'baobao') {
        res.send('success');
    } else {
        res.send('Login failed - try again.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});