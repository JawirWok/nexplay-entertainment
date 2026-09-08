const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// POST /api/orders/checkout - Checkout cart → create order
router.post('/checkout', isAuthenticated, (req, res) => {
    try {
        const { payment_method } = req.body;
        const db = getDb();

        // Get cart items
        const cartResult = db.exec(`
            SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.stock
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = ?
        `, [req.session.userId]);

        if (cartResult.length === 0 || cartResult[0].values.length === 0) {
            return res.status(400).json({ error: 'Cart is empty.' });
        }

        const columns = cartResult[0].columns;
        const items = cartResult[0].values.map(row => {
            const item = {};
            columns.forEach((col, i) => { item[col] = row[i]; });
            return item;
        });

        // Calculate total
        const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Generate order code
        const orderCode = 'NXP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Create order
        db.run(`INSERT INTO orders (user_id, total_amount, payment_method, payment_status, order_code)
                VALUES (?, ?, ?, ?, ?)`,
            [req.session.userId, total, payment_method || 'pending', 'pending', orderCode]);

        // Get order ID
        const orderResult = db.exec('SELECT id FROM orders WHERE order_code = ?', [orderCode]);
        const orderId = orderResult[0].values[0][0];

        // Create order items
        for (const item of items) {
            db.run(`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`,
                [orderId, item.product_id, item.quantity, item.price]);

            // Decrease stock
            db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
        }

        // Clear cart
        db.run('DELETE FROM cart_items WHERE user_id = ?', [req.session.userId]);

        saveDatabase();

        res.status(201).json({
            message: 'Order created successfully',
            order: {
                id: orderId,
                order_code: orderCode,
                total_amount: total,
                payment_method: payment_method || 'pending',
                payment_status: 'pending'
            }
        });
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders - User's order history
router.get('/', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        let query, params;

        if (req.session.role === 'admin' && req.query.all === '1') {
            query = `SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`;
            params = [];
        } else {
            query = `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`;
            params = [req.session.userId];
        }

        const result = db.exec(query, params);

        if (result.length === 0) {
            return res.json({ orders: [] });
        }

        const columns = result[0].columns;
        const orders = result[0].values.map(row => {
            const order = {};
            columns.forEach((col, i) => { order[col] = row[i]; });
            return order;
        });

        // For each order, get order items
        for (const order of orders) {
            const itemsResult = db.exec(`
                SELECT oi.*, p.name, p.image_url, p.category
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?
            `, [order.id]);

            if (itemsResult.length > 0) {
                const itemColumns = itemsResult[0].columns;
                order.items = itemsResult[0].values.map(row => {
                    const item = {};
                    itemColumns.forEach((col, i) => { item[col] = row[i]; });
                    return item;
                });
            } else {
                order.items = [];
            }
        }

        res.json({ orders });
    } catch (err) {
        console.error('Get orders error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders/:id - Order detail
router.get('/:id', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? = "admin")',
            [req.params.id, req.session.userId, req.session.role]);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const columns = result[0].columns;
        const row = result[0].values[0];
        const order = {};
        columns.forEach((col, i) => { order[col] = row[i]; });

        // Get order items
        const itemsResult = db.exec(`
            SELECT oi.*, p.name, p.image_url, p.category
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [order.id]);

        if (itemsResult.length > 0) {
            const itemColumns = itemsResult[0].columns;
            order.items = itemsResult[0].values.map(row => {
                const item = {};
                itemColumns.forEach((col, i) => { item[col] = row[i]; });
                return item;
            });
        } else {
            order.items = [];
        }

        res.json({ order });
    } catch (err) {
        console.error('Get order error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/orders/:id/status - Update order status (admin only)
router.put('/:id/status', isAdmin, (req, res) => {
    try {
        const { payment_status } = req.body;
        const db = getDb();

        const validStatuses = ['pending', 'processing', 'success', 'failed', 'refunded'];
        if (!validStatuses.includes(payment_status)) {
            return res.status(400).json({ error: 'Invalid payment status.' });
        }

        db.run('UPDATE orders SET payment_status = ? WHERE id = ?', [payment_status, req.params.id]);
        saveDatabase();

        res.json({ message: 'Order status updated' });
    } catch (err) {
        console.error('Update order error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders/stats/summary - Admin stats
router.get('/stats/summary', isAdmin, (req, res) => {
    try {
        const db = getDb();

        const totalOrders = db.exec('SELECT COUNT(*) FROM orders');
        const totalRevenue = db.exec('SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = "success"');
        const totalUsers = db.exec('SELECT COUNT(*) FROM users WHERE role = "user"');
        const totalProducts = db.exec('SELECT COUNT(*) FROM products');
        const pendingOrders = db.exec('SELECT COUNT(*) FROM orders WHERE payment_status = "pending"');

        res.json({
            stats: {
                total_orders: totalOrders[0] ? totalOrders[0].values[0][0] : 0,
                total_revenue: totalRevenue[0] ? totalRevenue[0].values[0][0] : 0,
                total_users: totalUsers[0] ? totalUsers[0].values[0][0] : 0,
                total_products: totalProducts[0] ? totalProducts[0].values[0][0] : 0,
                pending_orders: pendingOrders[0] ? pendingOrders[0].values[0][0] : 0
            }
        });
    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
