const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin, isSellerOrAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/products - List all products (with filter & search)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { category, search, featured, sort, seller_id } = req.query;

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (seller_id) {
            query += ' AND seller_id = ?';
            params.push(seller_id);
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

// POST /api/products - Create product (seller/admin only)
router.post('/', isSellerOrAdmin, (req, res) => {
    try {
        const { name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, discount_percentage } = req.body;

        if (!name || !price || !category) {
            return res.status(400).json({ error: 'Name, price, and category are required.' });
        }

        const db = getDb();
        const seller_id = req.session.role === 'admin' ? (req.body.seller_id || req.session.userId) : req.session.userId;

        db.run(`INSERT INTO products (name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, seller_id, discount_percentage)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description || '', price, category, image_url || '', stock || 100, rating || 0, platform || '', developer || '', release_year || 2024, featured || 0, seller_id, discount_percentage || 0]);
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

// PUT /api/products/:id - Update product (seller/admin only)
router.put('/:id', isSellerOrAdmin, (req, res) => {
    try {
        const { name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, discount_percentage } = req.body;
        const db = getDb();

        // Check if product exists
        const existing = db.exec('SELECT id, seller_id FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const productSellerId = existing[0].values[0][1];
        if (req.session.role !== 'admin' && productSellerId != req.session.userId) {
            return res.status(403).json({ error: 'Forbidden. You can only update your own products.' });
        }

        db.run(`UPDATE products SET name=?, description=?, price=?, category=?, image_url=?, stock=?, rating=?, platform=?, developer=?, release_year=?, featured=?, discount_percentage=? WHERE id=?`,
            [name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, discount_percentage || 0, req.params.id]);
        saveDatabase();

        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error('Update product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /api/products/:id - Delete product (seller/admin only)
router.delete('/:id', isSellerOrAdmin, (req, res) => {
    try {
        const db = getDb();

        const existing = db.exec('SELECT id, seller_id FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const productSellerId = existing[0].values[0][1];
        if (req.session.role !== 'admin' && productSellerId != req.session.userId) {
            return res.status(403).json({ error: 'Forbidden. You can only delete your own products.' });
        }

        db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        saveDatabase();

        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/products/:id/reviews - Get reviews
router.get('/:id/reviews', (req, res) => {
    try {
        const db = getDb();
        const query = `
            SELECT r.id, r.rating, r.comment, r.created_at, u.username
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
        `;
        const result = db.exec(query, [req.params.id]);
        
        if (result.length === 0) {
            return res.json({ reviews: [] });
        }

        const columns = result[0].columns;
        const reviews = result[0].values.map(row => {
            const rev = {};
            columns.forEach((col, i) => { rev[col] = row[i]; });
            return rev;
        });

        res.json({ reviews });
    } catch (err) {
        console.error('Get reviews error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/products/:id/reviews - Add review
router.post('/:id/reviews', isAuthenticated, (req, res) => {
    try {
        const { rating, comment, order_id } = req.body;
        const product_id = req.params.id;
        const user_id = req.session.userId;

        if (!rating || rating < 1 || rating > 5 || !order_id) {
            return res.status(400).json({ error: 'Valid rating and order_id are required.' });
        }

        const db = getDb();
        // Check if user bought this product
        const checkPurchase = db.exec(`
            SELECT oi.id 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.user_id = ? AND oi.product_id = ? AND o.id = ? AND o.payment_status = 'success'
        `, [user_id, product_id, order_id]);

        if (checkPurchase.length === 0 || checkPurchase[0].values.length === 0) {
            return res.status(403).json({ error: 'You must purchase this product successfully before reviewing it.' });
        }

        // Check if review already exists for this order item
        const existingReview = db.exec('SELECT id FROM reviews WHERE user_id = ? AND product_id = ? AND order_id = ?', [user_id, product_id, order_id]);
        if (existingReview.length > 0 && existingReview[0].values.length > 0) {
            return res.status(409).json({ error: 'You have already reviewed this product for this order.' });
        }

        db.run('INSERT INTO reviews (user_id, product_id, order_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [user_id, product_id, order_id, rating, comment || '']);

        // Update average rating on product
        const avgResult = db.exec('SELECT AVG(rating) FROM reviews WHERE product_id = ?', [product_id]);
        if (avgResult.length > 0 && avgResult[0].values.length > 0) {
            const avgRating = avgResult[0].values[0][0];
            db.run('UPDATE products SET rating = ? WHERE id = ?', [avgRating, product_id]);
        }

        saveDatabase();
        res.status(201).json({ message: 'Review added successfully' });
    } catch (err) {
        console.error('Add review error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
