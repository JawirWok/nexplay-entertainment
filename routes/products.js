const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/products - List all products (with filter & search)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { category, search, featured, sort } = req.query;

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ? OR developer LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (featured === '1') {
            query += ' AND featured = 1';
        }

        if (sort === 'price_asc') {
            query += ' ORDER BY price ASC';
        } else if (sort === 'price_desc') {
            query += ' ORDER BY price DESC';
        } else if (sort === 'rating') {
            query += ' ORDER BY rating DESC';
        } else if (sort === 'newest') {
            query += ' ORDER BY created_at DESC';
        } else {
            query += ' ORDER BY featured DESC, rating DESC';
        }

        const result = db.exec(query, params);

        if (result.length === 0) {
            return res.json({ products: [] });
        }

        const columns = result[0].columns;
        const products = result[0].values.map(row => {
            const product = {};
            columns.forEach((col, i) => { product[col] = row[i]; });
            return product;
        });

        res.json({ products });
    } catch (err) {
        console.error('Get products error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/products/:id - Product detail
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT * FROM products WHERE id = ?', [req.params.id]);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const columns = result[0].columns;
        const row = result[0].values[0];
        const product = {};
        columns.forEach((col, i) => { product[col] = row[i]; });

        res.json({ product });
    } catch (err) {
        console.error('Get product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/products - Create product (admin only)
router.post('/', isAdmin, (req, res) => {
    try {
        const { name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured } = req.body;

        if (!name || !price || !category) {
            return res.status(400).json({ error: 'Name, price, and category are required.' });
        }

        const db = getDb();
        db.run(`INSERT INTO products (name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description || '', price, category, image_url || '', stock || 100, rating || 0, platform || '', developer || '', release_year || 2024, featured || 0]);
        saveDatabase();

        const newProduct = db.exec('SELECT * FROM products ORDER BY id DESC LIMIT 1');
        const columns = newProduct[0].columns;
        const row = newProduct[0].values[0];
        const product = {};
        columns.forEach((col, i) => { product[col] = row[i]; });

        res.status(201).json({ message: 'Product created successfully', product });
    } catch (err) {
        console.error('Create product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/products/:id - Update product (admin only)
router.put('/:id', isAdmin, (req, res) => {
    try {
        const { name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured } = req.body;
        const db = getDb();

        // Check if product exists
        const existing = db.exec('SELECT id FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        db.run(`UPDATE products SET name=?, description=?, price=?, category=?, image_url=?, stock=?, rating=?, platform=?, developer=?, release_year=?, featured=? WHERE id=?`,
            [name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, req.params.id]);
        saveDatabase();

        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error('Update product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /api/products/:id - Delete product (admin only)
router.delete('/:id', isAdmin, (req, res) => {
    try {
        const db = getDb();

        const existing = db.exec('SELECT id FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        saveDatabase();

        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
