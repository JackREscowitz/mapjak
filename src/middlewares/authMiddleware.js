function requireLogin(req, res, next) {
    if (req.session.user) {
        next(); // If logged in already, continue on route
    } else {
        res.redirect('/login'); // Otherwise, redirect to login
    }
}

module.exports = requireLogin;