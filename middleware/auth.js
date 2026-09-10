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

    // Direct check if session already marks user as admin
    if (req.session.role === 'admin' || req.session.userId == 1) {
        req.session.role = 'admin';
        return next();
    }

    try {
        const db = getDb();
        const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);

        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            const role = result[0].values[0][0];
            if (role === 'admin') {
                req.session.role = 'admin';
                return next();
            }
        }
    } catch (e) {
        console.error('isAdmin check error:', e);
    }

    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
}

function isSellerOrAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please login first.' });
    }

    if (req.session.role === 'admin' || req.session.role === 'seller' || req.session.userId == 1) {
        return next();
    }

    try {
        const db = getDb();
        const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);

        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            const role = result[0].values[0][0];
            if (role === 'admin' || role === 'seller') {
                req.session.role = role;
                return next();
            }
        }
    } catch (e) {
        console.error('isSellerOrAdmin check error:', e);
    }

    return res.status(403).json({ error: 'Forbidden. Seller or Admin access required.' });
}

module.exports = { isAuthenticated, isAdmin, isSellerOrAdmin };
