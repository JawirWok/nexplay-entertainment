const express = require('express');
const { getDb } = require('../database/init');
const { isAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users - List all users (admin only)
router.get('/', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');

        if (result.length === 0) {
            return res.json({ users: [] });
        }

        const columns = result[0].columns;
        const users = result[0].values.map(row => {
            const user = {};
            columns.forEach((col, i) => { user[col] = row[i]; });
            return user;
        });

        res.json({ users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
