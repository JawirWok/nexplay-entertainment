const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

// GET /api/cart - Get cart items
router.get('/', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const result = db.exec(`
            SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.image_url, p.category, p.discount_percentage
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = ?
        `, [req.session.userId]);

        if (result.length === 0) {
            return res.json({ items: [], total: 0 });
        }

        const columns = result[0].columns;
        const items = result[0].values.map(row => {
            const item = {};
            columns.forEach((col, i) => { item[col] = row[i]; });
            let actualPrice = item.price;
            if (item.discount_percentage && item.discount_percentage > 0) {
                actualPrice = item.price - (item.price * item.discount_percentage / 100);
            }
            item.actual_price = actualPrice;
            item.subtotal = actualPrice * item.quantity;
            return item;
        });

        const total = items.reduce((sum, item) => sum + item.subtotal, 0);

        res.json({ items, total });
    } catch (err) {
        console.error('Get cart error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/cart - Add item to cart
router.post('/', isAuthenticated, (req, res) => {
    try {
        const { product_id, quantity = 1 } = req.body;

        if (!product_id) {
            return res.status(400).json({ error: 'Product ID is required.' });
        }

        const db = getDb();

        // Check if product exists
        const product = db.exec('SELECT id, stock FROM products WHERE id = ?', [product_id]);
        if (product.length === 0 || product[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        // Check if already in cart
        const existing = db.exec('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?',
            [req.session.userId, product_id]);

        if (existing.length > 0 && existing[0].values.length > 0) {
            const currentQty = existing[0].values[0][1];
            db.run('UPDATE cart_items SET quantity = ? WHERE id = ?',
                [currentQty + quantity, existing[0].values[0][0]]);
        } else {
            db.run('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
                [req.session.userId, product_id, quantity]);
        }

        saveDatabase();

        // Return updated cart count
        const countResult = db.exec('SELECT SUM(quantity) FROM cart_items WHERE user_id = ?', [req.session.userId]);
        const cartCount = countResult[0] ? countResult[0].values[0][0] || 0 : 0;

        res.json({ message: 'Added to cart', cartCount });
    } catch (err) {
        console.error('Add to cart error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/cart/:id - Update quantity
router.put('/:id', isAuthenticated, (req, res) => {
    try {
        const { quantity } = req.body;
        const db = getDb();

        if (quantity <= 0) {
            db.run('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
        } else {
            db.run('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?',
                [quantity, req.params.id, req.session.userId]);
        }

        saveDatabase();
        res.json({ message: 'Cart updated' });
    } catch (err) {
        console.error('Update cart error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /api/cart/:id - Remove from cart
router.delete('/:id', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        db.run('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
        saveDatabase();
        res.json({ message: 'Item removed from cart' });
    } catch (err) {
        console.error('Delete cart error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/cart/sync - Sync client-side cart items with database
router.post('/sync', isAuthenticated, (req, res) => {
    try {
        const { items } = req.body;
        const db = getDb();
        const userId = req.session.userId;
        if (Array.isArray(items)) {
            for (const item of items) {
                const pid = parseInt(item.product_id || item.id, 10);
                const qty = parseInt(item.quantity || 1, 10);
                if (!pid) continue;
                const existing = db.exec('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?', [userId, pid]);
                if (existing.length > 0 && existing[0].values.length > 0) {
                    const cartId = existing[0].values[0][0];
                    db.run('UPDATE cart_items SET quantity = ? WHERE id = ?', [qty, cartId]);
                } else {
                    db.run('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [userId, pid, qty]);
                }
            }
            saveDatabase();
        }
        res.json({ success: true, message: 'Cart synchronized' });
    } catch (err) {
        console.error('Cart sync error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
