const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, saveDatabase } = require('../database/init');
const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const db = getDb();

        // Check if username or email already exists
        const existing = db.exec('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing.length > 0 && existing[0].values.length > 0) {
            return res.status(409).json({ error: 'Username or email already exists.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        db.run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, 'user']);
        saveDatabase();

        // Get the newly created user
        const newUser = db.exec('SELECT id, username, email, role FROM users WHERE username = ?', [username]);
        const user = {
            id: newUser[0].values[0][0],
            username: newUser[0].values[0][1],
            email: newUser[0].values[0][2],
            role: newUser[0].values[0][3]
        };

        req.session.userId = user.id;
        req.session.role = user.role;

        res.status(201).json({ message: 'Registration successful', user });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const db = getDb();
        const result = db.exec('SELECT id, username, email, password, role FROM users WHERE username = ?', [username]);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const row = result[0].values[0];
        const user = { id: row[0], username: row[1], email: row[2], password: row[3], role: row[4] };

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        req.session.userId = user.id;
        req.session.role = user.role;

        res.json({
            message: 'Login successful',
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed.' });
        }
        res.json({ message: 'Logged out successfully.' });
    });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    const db = getDb();
    const result = db.exec('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.session.userId]);

    if (result.length === 0 || result[0].values.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
    }

    const row = result[0].values[0];
    res.json({
        user: { id: row[0], username: row[1], email: row[2], role: row[3], created_at: row[4] }
    });
});

module.exports = router;
