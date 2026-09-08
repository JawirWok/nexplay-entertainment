const { getDb } = require('../database/init');

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
}

function isAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please login first.' });
    }

    const db = getDb();
    const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);

    if (result.length === 0 || result[0].values[0][0] !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    return next();
}

module.exports = { isAuthenticated, isAdmin };
