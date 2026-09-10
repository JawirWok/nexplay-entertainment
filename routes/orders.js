const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// POST /api/orders/checkout - Checkout cart → create order
router.post('/checkout', isAuthenticated, (req, res) => {
    try {
        const { payment_method, selected_items, voucher_code } = req.body;
        const db = getDb();

        let query = `
            SELECT ci.id, ci.quantity, p.id as product_id, p.name, p.price, p.stock, p.seller_id, p.discount_percentage
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = ?
        `;
        let params = [req.session.userId];

        if (selected_items && Array.isArray(selected_items) && selected_items.length > 0) {
            query += ` AND ci.id IN (${selected_items.map(() => '?').join(',')})`;
            params.push(...selected_items);
        }

        const cartResult = db.exec(query, params);

        if (cartResult.length === 0 || cartResult[0].values.length === 0) {
            return res.status(400).json({ error: 'Cart is empty or items not found.' });
        }

        const columns = cartResult[0].columns;
        const items = cartResult[0].values.map(row => {
            const item = {};
            columns.forEach((col, i) => { item[col] = row[i]; });
            // Calculate actual price with discount
            item.actual_price = item.price;
            if (item.discount_percentage > 0) {
                item.actual_price = item.price - (item.price * item.discount_percentage / 100);
            }
            return item;
        });

        // Stock validation
        for (const item of items) {
            if (item.quantity > item.stock) {
                return res.status(400).json({ error: `Stok untuk ${item.name} tidak cukup. (Tersedia: ${item.stock})` });
            }
        }

        // Calculate subtotal
        const subtotal = items.reduce((sum, item) => sum + (item.actual_price * item.quantity), 0);

        // Voucher validation & discount calculation
        let voucher_discount = 0;
        let applied_voucher_code = '';
        if (voucher_code) {
            const vCode = String(voucher_code).trim().toUpperCase();
            const vRes = db.exec('SELECT * FROM vouchers WHERE code = ? AND is_active = 1', [vCode]);
            if (vRes.length > 0 && vRes[0].values.length > 0) {
                const vRow = {};
                vRes[0].columns.forEach((col, i) => { vRow[col] = vRes[0].values[0][i]; });
                
                // Expiry check
                let notExpired = true;
                if (vRow.valid_until) {
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const expiry = new Date(vRow.valid_until);
                    expiry.setHours(23, 59, 59, 999);
                    if (now > expiry) notExpired = false;
                }

                if (notExpired && (!vRow.usage_limit || vRow.used_count < vRow.usage_limit) && (!vRow.min_purchase || subtotal >= vRow.min_purchase)) {
                    applied_voucher_code = vRow.code;
                    if (vRow.discount_type === 'percentage') {
                        voucher_discount = Math.round((subtotal * vRow.discount_value) / 100);
                    } else {
                        voucher_discount = Math.min(vRow.discount_value, subtotal);
                    }
                    // Increment usage
                    db.run('UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?', [vRow.id]);
                }
            }
        }

        const total = Math.max(0, subtotal - voucher_discount);

        // Generate order code
        const orderCode = 'NXP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Create order with 'processing' status (Menunggu konfirmasi admin & pengiriman produk)
        db.run(`INSERT INTO orders (user_id, total_amount, payment_method, payment_status, order_code, voucher_code, voucher_discount)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.userId, total, payment_method || 'pending', 'processing', orderCode, applied_voucher_code, voucher_discount]);

        // Get order ID
        const orderResult = db.exec('SELECT id FROM orders WHERE order_code = ?', [orderCode]);
        const orderId = orderResult[0].values[0][0];

        // Create order items
        for (const item of items) {
            const itemTotal = item.actual_price * item.quantity;
            const adminComm = itemTotal * 0.20;
            const sellerComm = itemTotal * 0.80;
            const fulfillment = (item.seller_id && item.seller_id > 1) ? 'menunggu_seller' : 'siap_diproses';

            db.run(`INSERT INTO order_items (order_id, product_id, quantity, price, seller_id, admin_commission, seller_commission, fulfillment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.quantity, item.actual_price, item.seller_id || 1, adminComm, sellerComm, fulfillment]);

            // Decrease stock
            db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
        }

        // Clear ONLY purchased cart items
        if (selected_items && Array.isArray(selected_items) && selected_items.length > 0) {
            const delParams = [req.session.userId, ...selected_items];
            db.run(`DELETE FROM cart_items WHERE user_id = ? AND id IN (${selected_items.map(() => '?').join(',')})`, delParams);
        } else {
            db.run('DELETE FROM cart_items WHERE user_id = ?', [req.session.userId]);
        }

        saveDatabase();

        res.status(201).json({
            message: 'Order created successfully',
            order: {
                id: orderId,
                order_code: orderCode,
                total_amount: total,
                voucher_code: applied_voucher_code,
                voucher_discount: voucher_discount,
                payment_method: payment_method || 'pending',
                payment_status: 'processing'
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
                    const reviewRes = db.exec('SELECT id FROM reviews WHERE user_id = ? AND product_id = ? AND order_id = ?', [order.user_id, item.product_id, order.id]);
                    item.has_reviewed = (reviewRes.length > 0 && reviewRes[0].values.length > 0);
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
        const result = db.exec(`
            SELECT o.*, u.username, u.email as user_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = ? AND (o.user_id = ? OR ? = "admin")
        `, [req.params.id, req.session.userId, req.session.role]);

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
        const pendingOrders = db.exec('SELECT COUNT(*) FROM orders WHERE payment_status = "pending" OR payment_status = "processing"');
        
        // Admin commission
        const adminCommissionResult = db.exec(`
            SELECT COALESCE(SUM(oi.admin_commission), 0) 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.payment_status = 'success'
        `);

        // Revenue breakdowns
        const dailyRev = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'success' AND date(created_at) = date('now', 'localtime')`);
        const weeklyRev = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'success' AND date(created_at) >= date('now', '-7 days', 'localtime')`);
        const monthlyRev = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'success' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')`);

        // Admin commission breakdowns
        const dailyComm = db.exec(`SELECT COALESCE(SUM(oi.admin_commission), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.payment_status = 'success' AND date(o.created_at) = date('now', 'localtime')`);
        const weeklyComm = db.exec(`SELECT COALESCE(SUM(oi.admin_commission), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.payment_status = 'success' AND date(o.created_at) >= date('now', '-7 days', 'localtime')`);
        const monthlyComm = db.exec(`SELECT COALESCE(SUM(oi.admin_commission), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.payment_status = 'success' AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime')`);

        res.json({
            stats: {
                total_orders: totalOrders[0] ? totalOrders[0].values[0][0] : 0,
                total_revenue: totalRevenue[0] ? totalRevenue[0].values[0][0] : 0,
                admin_commission: adminCommissionResult[0] && adminCommissionResult[0].values.length > 0 ? adminCommissionResult[0].values[0][0] : 0,
                total_users: totalUsers[0] ? totalUsers[0].values[0][0] : 0,
                total_products: totalProducts[0] ? totalProducts[0].values[0][0] : 0,
                pending_orders: pendingOrders[0] ? pendingOrders[0].values[0][0] : 0,
                daily_revenue: dailyRev[0] && dailyRev[0].values.length > 0 ? dailyRev[0].values[0][0] : 0,
                weekly_revenue: weeklyRev[0] && weeklyRev[0].values.length > 0 ? weeklyRev[0].values[0][0] : 0,
                monthly_revenue: monthlyRev[0] && monthlyRev[0].values.length > 0 ? monthlyRev[0].values[0][0] : 0,
                daily_commission: dailyComm[0] && dailyComm[0].values.length > 0 ? dailyComm[0].values[0][0] : 0,
                weekly_commission: weeklyComm[0] && weeklyComm[0].values.length > 0 ? weeklyComm[0].values[0][0] : 0,
                monthly_commission: monthlyComm[0] && monthlyComm[0].values.length > 0 ? monthlyComm[0].values[0][0] : 0
            }
        });
    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders/revenue/detailed - Admin detailed revenue
router.get('/revenue/detailed', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const { range } = req.query; // 'today', 'week', 'month', 'all'
        let dateFilter = '';
        if (range === 'today') {
            dateFilter = " AND date(o.created_at) = date('now', 'localtime')";
        } else if (range === 'week') {
            dateFilter = " AND date(o.created_at) >= date('now', '-7 days', 'localtime')";
        } else if (range === 'month') {
            dateFilter = " AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime')";
        }

        const query = `
            SELECT o.id as order_id, o.order_code, o.total_amount, o.payment_method, o.payment_status, o.voucher_code, o.voucher_discount, o.created_at,
                   u.username as buyer_name,
                   oi.id as item_id, oi.quantity, oi.price, oi.admin_commission, oi.seller_commission, oi.fulfillment_status,
                   p.name as product_name,
                   COALESCE(s.username, 'Platform Admin') as seller_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            LEFT JOIN users s ON oi.seller_id = s.id
            WHERE o.payment_status = 'success' ${dateFilter}
            ORDER BY o.created_at DESC
        `;

        const result = db.exec(query);
        if (result.length === 0) {
            return res.json({ transactions: [], summary: { gross: 0, admin: 0, seller: 0, voucher: 0, count: 0 } });
        }

        const cols = result[0].columns;
        const transactions = result[0].values.map(row => {
            const t = {};
            cols.forEach((col, i) => { t[col] = row[i]; });
            return t;
        });

        const gross = transactions.reduce((sum, t) => sum + (t.price * t.quantity), 0);
        const admin = transactions.reduce((sum, t) => sum + (t.admin_commission || 0), 0);
        const seller = transactions.reduce((sum, t) => sum + (t.seller_commission || 0), 0);
        const voucher = transactions.reduce((sum, t) => sum + (t.voucher_discount || 0), 0);

        res.json({
            transactions,
            summary: { gross, admin, seller, voucher, count: transactions.length }
        });
    } catch (err) {
        console.error('Get detailed revenue error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders/seller/orders - Seller's received orders
router.get('/seller/orders', isAuthenticated, (req, res) => {
    try {
        if (req.session.role !== 'seller') {
            return res.status(403).json({ error: 'Forbidden. Seller access required.' });
        }
        const db = getDb();
        const sellerId = req.session.userId;

        const result = db.exec(`
            SELECT oi.id as item_id, oi.order_id, oi.product_id, oi.quantity, oi.price, oi.seller_commission, oi.fulfillment_status, oi.delivery_data,
                   p.name as product_name, p.image_url, p.category,
                   o.order_code, o.payment_status, o.created_at, u.username as buyer_username
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            JOIN users u ON o.user_id = u.id
            WHERE oi.seller_id = ?
            ORDER BY o.created_at DESC
        `, [sellerId]);

        if (result.length === 0) {
            return res.json({ orders: [] });
        }

        const cols = result[0].columns;
        const orders = result[0].values.map(row => {
            const item = {};
            cols.forEach((col, i) => { item[col] = row[i]; });
            return item;
        });

        res.json({ orders });
    } catch (err) {
        console.error('Get seller orders error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/orders/seller/ship-item - Seller sends product and delivery data to admin
router.put('/seller/ship-item', isAuthenticated, (req, res) => {
    try {
        if (req.session.role !== 'seller') {
            return res.status(403).json({ error: 'Forbidden. Seller access required.' });
        }
        const { item_id, delivery_data } = req.body;
        const db = getDb();
        const sellerId = req.session.userId;

        const check = db.exec('SELECT id FROM order_items WHERE id = ? AND seller_id = ?', [item_id, sellerId]);
        if (check.length === 0 || check[0].values.length === 0) {
            return res.status(404).json({ error: 'Item pesanan tidak ditemukan atau bukan milik Anda.' });
        }

        db.run("UPDATE order_items SET fulfillment_status = 'dikirim_ke_admin', delivery_data = ? WHERE id = ? AND seller_id = ?",
            [delivery_data || '', item_id, sellerId]);
        saveDatabase();

        res.json({ message: 'Produk & kredensial berhasil dikirim ke Admin untuk verifikasi! 🚀' });
    } catch (err) {
        console.error('Ship item error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/orders/items/:id/delivery - Admin update delivery data
router.put('/items/:id/delivery', isAdmin, (req, res) => {
    try {
        const { delivery_data } = req.body;
        const db = getDb();
        db.run('UPDATE order_items SET delivery_data = ? WHERE id = ?', [delivery_data || '', req.params.id]);
        saveDatabase();
        res.json({ message: 'Data akses produk berhasil diperbarui! ✅' });
    } catch (err) {
        console.error('Update delivery data error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders/user/spending - User spending breakdown (daily, weekly, monthly, total)
router.get('/user/spending', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.userId;

        const daily = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = ? AND payment_status = 'success' AND date(created_at) = date('now', 'localtime')`, [userId]);
        const weekly = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = ? AND payment_status = 'success' AND date(created_at) >= date('now', '-7 days', 'localtime')`, [userId]);
        const monthly = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = ? AND payment_status = 'success' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')`, [userId]);
        const total = db.exec(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = ? AND payment_status = 'success'`, [userId]);

        res.json({
            spending: {
                daily: daily[0] && daily[0].values.length > 0 ? daily[0].values[0][0] : 0,
                weekly: weekly[0] && weekly[0].values.length > 0 ? weekly[0].values[0][0] : 0,
                monthly: monthly[0] && monthly[0].values.length > 0 ? monthly[0].values[0][0] : 0,
                total: total[0] && total[0].values.length > 0 ? total[0].values[0][0] : 0
            }
        });
    } catch (err) {
        console.error('Get spending error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/orders/seller/stats - Seller stats with time breakdowns
router.get('/seller/stats', isAuthenticated, (req, res) => {
    try {
        if (req.session.role !== 'seller') {
            return res.status(403).json({ error: 'Forbidden. Seller access required.' });
        }
        const db = getDb();
        const sellerId = req.session.userId;

        // Seller commission total
        const commResult = db.exec(`
            SELECT COALESCE(SUM(oi.seller_commission), 0) 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.seller_id = ? AND o.payment_status = 'success'
        `, [sellerId]);

        // Daily, Weekly, Monthly commission for seller
        const dailyComm = db.exec(`
            SELECT COALESCE(SUM(oi.seller_commission), 0) 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.seller_id = ? AND o.payment_status = 'success' AND date(o.created_at) = date('now', 'localtime')
        `, [sellerId]);

        const weeklyComm = db.exec(`
            SELECT COALESCE(SUM(oi.seller_commission), 0) 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.seller_id = ? AND o.payment_status = 'success' AND date(o.created_at) >= date('now', '-7 days', 'localtime')
        `, [sellerId]);

        const monthlyComm = db.exec(`
            SELECT COALESCE(SUM(oi.seller_commission), 0) 
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.seller_id = ? AND o.payment_status = 'success' AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime')
        `, [sellerId]);

        // Seller sold items count
        const soldItems = db.exec(`
            SELECT COALESCE(SUM(oi.quantity), 0)
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.seller_id = ? AND o.payment_status = 'success'
        `, [sellerId]);

        // Seller products list sold
        const soldProductsResult = db.exec(`
            SELECT p.name, SUM(oi.quantity) as qty, SUM(oi.seller_commission) as revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.seller_id = ? AND o.payment_status = 'success'
            GROUP BY p.id
            ORDER BY qty DESC
        `, [sellerId]);
        
        let sold_products = [];
        if (soldProductsResult.length > 0) {
            const cols = soldProductsResult[0].columns;
            sold_products = soldProductsResult[0].values.map(row => {
                const sp = {};
                cols.forEach((col, i) => { sp[col] = row[i]; });
                return sp;
            });
        }

        res.json({
            stats: {
                total_commission: commResult[0] && commResult[0].values.length > 0 ? commResult[0].values[0][0] : 0,
                daily_commission: dailyComm[0] && dailyComm[0].values.length > 0 ? dailyComm[0].values[0][0] : 0,
                weekly_commission: weeklyComm[0] && weeklyComm[0].values.length > 0 ? weeklyComm[0].values[0][0] : 0,
                monthly_commission: monthlyComm[0] && monthlyComm[0].values.length > 0 ? monthlyComm[0].values[0][0] : 0,
                sold_items: soldItems[0] && soldItems[0].values.length > 0 ? soldItems[0].values[0][0] : 0,
                sold_products: sold_products
            }
        });
    } catch (err) {
        console.error('Get seller stats error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/orders/:id/cancel - Cancel order (user only if pending)
router.put('/:id/cancel', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const orderId = req.params.id;

        const result = db.exec('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, req.session.userId]);
        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const columns = result[0].columns;
        const row = result[0].values[0];
        const order = {};
        columns.forEach((col, i) => { order[col] = row[i]; });

        if (order.payment_status !== 'pending' && order.payment_status !== 'processing') {
            return res.status(400).json({ error: 'Only pending or processing orders can be cancelled.' });
        }

        // Return stock
        const items = db.exec('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
        if (items.length > 0) {
            items[0].values.forEach(item => {
                db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item[1], item[0]]);
            });
        }

        db.run('UPDATE orders SET payment_status = ? WHERE id = ?', ['failed', orderId]);
        saveDatabase();

        res.json({ message: 'Order cancelled successfully' });
    } catch (err) {
        console.error('Cancel order error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
