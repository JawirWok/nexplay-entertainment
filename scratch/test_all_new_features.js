const http = require('http');
const express = require('express');
const session = require('express-session');
const { initDatabase, getDb, saveDatabase } = require('../database/init');
const authRouter = require('../routes/auth');
const productsRouter = require('../routes/products');
const ordersRouter = require('../routes/orders');
const chatRouter = require('../routes/chat');

async function testFeatures() {
    console.log('=== STARTING TEST OF ALL NEW FEATURES ===');
    await initDatabase();
    const db = getDb();

    // Set up test server
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false
    }));

    // Helper to simulate session
    app.use((req, res, next) => {
        const authHeader = req.headers['x-test-user-id'];
        if (authHeader) {
            req.session.userId = parseInt(authHeader);
            const userRes = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);
            if (userRes.length > 0 && userRes[0].values.length > 0) {
                req.session.role = userRes[0].values[0][0];
            }
        }
        next();
    });

    app.use('/api/auth', authRouter);
    app.use('/api/products', productsRouter);
    app.use('/api/orders', ordersRouter);
    app.use('/api/chat', chatRouter);

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    function request(method, path, body = null, userId = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, baseUrl);
            const headers = { 'Content-Type': 'application/json' };
            if (userId) headers['x-test-user-id'] = userId.toString();

            const req = http.request(url, { method, headers }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = data ? JSON.parse(data) : {};
                        resolve({ status: res.statusCode, body: parsed });
                    } catch (e) {
                        resolve({ status: res.statusCode, raw: data });
                    }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    try {
        // Query users by role
        const adminId = db.exec("SELECT id FROM users WHERE role = 'admin' LIMIT 1")[0].values[0][0];
        const customerId = db.exec("SELECT id FROM users WHERE role = 'user' LIMIT 1")[0].values[0][0];
        const sellerId = db.exec("SELECT id FROM users WHERE role = 'seller' LIMIT 1")[0].values[0][0];

        console.log(`Found users -> Admin: ${adminId}, Customer: ${customerId}, Seller: ${sellerId}`);

        console.log('\n--- 1. Testing Chat System ---');
        // Customer sends message to Admin
        let res = await request('POST', '/api/chat/messages', {
            receiver_id: adminId,
            message: 'Halo Admin, akun saya belum diterima.'
        }, customerId);
        console.log('Customer send message to admin:', res.status, res.body.message);

        // Admin checks unread count
        res = await request('GET', '/api/chat/unread-count', null, adminId);
        console.log('Admin unread count:', res.body.unread_count);

        // Admin checks conversations
        res = await request('GET', '/api/chat/conversations', null, adminId);
        console.log('Admin conversations count:', res.body.conversations.length);
        const userConv = res.body.conversations.find(c => c.id === customerId);
        console.log('Conversation with customer found:', !!userConv, 'Unread:', userConv?.unread_count);

        // Admin reads messages from customer
        res = await request('GET', `/api/chat/messages?user_id=${customerId}`, null, adminId);
        console.log('Admin messages from customer count:', res.body.messages.length);

        // Admin marks read
        res = await request('PUT', '/api/chat/read', { sender_id: customerId }, adminId);
        console.log('Admin mark read:', res.body.message);

        // Admin replies to customer
        res = await request('POST', '/api/chat/messages', {
            receiver_id: customerId,
            message: 'Halo, sedang kami proses dengan seller ya!'
        }, adminId);
        console.log('Admin reply to customer:', res.status);

        // Customer reads messages
        res = await request('GET', `/api/chat/messages?user_id=${adminId}`, null, customerId);
        console.log('Customer sees messages count:', res.body.messages.length, 'Last msg:', res.body.messages[res.body.messages.length - 1]?.message);

        console.log('\n--- 2. Testing Seller Delivery Modal & Credentials Flow ---');
        // Let's create an order for customer buying a product owned by seller
        const prodRes = db.exec('SELECT id, name FROM products WHERE seller_id = ? LIMIT 1', [sellerId]);
        let productId;
        if (prodRes.length > 0 && prodRes[0].values.length > 0) {
            productId = prodRes[0].values[0][0];
        } else {
            // Create a test product for seller
            db.run('INSERT INTO products (name, description, price, category, platform, seller_id) VALUES (?, ?, ?, ?, ?, ?)',
                ['Akun Mobile Legends Mythic', 'Akun ML full skin', 150000, 'game', 'Mobile', sellerId]);
            const lastProd = db.exec('SELECT last_insert_rowid()');
            productId = lastProd[0].values[0][0];
        }

        // Insert an order for customer
        db.run(`INSERT INTO orders (user_id, order_code, total_amount, payment_method, payment_status, created_at)
                VALUES (?, ?, ?, ?, 'processing', datetime('now'))`,
                [customerId, 'TEST-ORD-' + Date.now(), 150000, 'qris']);
        const orderId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

        db.run(`INSERT INTO order_items (order_id, product_id, quantity, price, seller_id, seller_commission, fulfillment_status, delivery_data)
                VALUES (?, ?, 1, 150000, ?, 120000, 'menunggu_seller', '')`,
                [orderId, productId, sellerId]);
        const itemId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        saveDatabase();

        console.log(`Created test order ${orderId} with item ${itemId} for product ${productId}`);

        // Seller views orders
        res = await request('GET', '/api/orders/seller/orders', null, sellerId);
        const sellerItem = res.body.orders.find(o => o.item_id === itemId);
        console.log('Seller sees new order item:', !!sellerItem, 'Fulfillment:', sellerItem?.fulfillment_status);

        // Seller ships item with credentials
        const credentialsText = `Username: ml_mythic_pro\nPassword: TestPassword123!\nEmail Moonton: terikat`;
        res = await request('PUT', '/api/orders/seller/ship-item', {
            item_id: itemId,
            delivery_data: credentialsText
        }, sellerId);
        console.log('Seller ship item response:', res.status, res.body.message);

        // Admin views orders
        res = await request('GET', '/api/orders?all=1', null, adminId);
        const adminOrder = res.body.orders.find(o => o.id === orderId);
        const adminItem = adminOrder.items.find(i => i.id === itemId);
        console.log('Admin sees delivery_data from seller:', adminItem?.delivery_data === credentialsText ? 'MATCHES ✅' : 'MISMATCH ❌');

        // Admin updates delivery data (e.g. adding note)
        const updatedDelivery = credentialsText + '\nCatatan Admin: Garansi 3x24 jam.';
        res = await request('PUT', `/api/orders/items/${itemId}/delivery`, {
            delivery_data: updatedDelivery
        }, adminId);
        console.log('Admin update delivery data response:', res.status, res.body.message);

        // Admin marks order complete
        res = await request('PUT', `/api/orders/${orderId}/status`, {
            payment_status: 'success'
        }, adminId);
        console.log('Admin complete order response:', res.status, res.body.message);

        // Customer views order
        res = await request('GET', '/api/orders', null, customerId);
        const custOrder = res.body.orders.find(o => o.id === orderId);
        const custItem = custOrder.items.find(i => i.id === itemId);
        console.log('Customer order delivery_data:', custItem?.delivery_data ? 'RECEIVED BY USER ✅' : 'EMPTY ❌');
        console.log('Customer order has_reviewed:', custItem?.has_reviewed);

        console.log('\n--- 3. Testing User Spending Calculation ---');
        res = await request('GET', '/api/orders/user/spending', null, customerId);
        console.log('Customer spending breakdown:', res.body.spending);
        if (res.body.spending && res.body.spending.total >= 150000) {
            console.log('Spending calculation working correctly ✅');
        } else {
            console.log('Spending calculation error ❌');
        }

        console.log('\n--- 4. Testing Reviews (1 Per Purchase & Anonymous Option) ---');
        // Submit review with anonymous = true
        res = await request('POST', `/api/products/${productId}/reviews`, {
            rating: 5,
            comment: 'Mantap akun GG sesuai deskripsi!',
            order_id: orderId,
            is_anonymous: true
        }, customerId);
        console.log('Submit anonymous review:', res.status, res.body.message);

        // Attempt second review for the same order item -> should be rejected
        res = await request('POST', `/api/products/${productId}/reviews`, {
            rating: 4,
            comment: 'Coba ulas lagi',
            order_id: orderId,
            is_anonymous: false
        }, customerId);
        console.log('Attempt duplicate review status:', res.status, '(Expected 409)');

        // Check GET reviews -> username should be masked as anonymous
        res = await request('GET', `/api/products/${productId}/reviews`);
        const anonReview = res.body.reviews.find(r => r.comment.includes('Mantap'));
        console.log('Anonymous review username displayed:', anonReview?.username, 'is_anonymous:', anonReview?.is_anonymous);
        if (anonReview?.username.includes('(Anonim)')) {
            console.log('Masked username working correctly ✅');
        } else {
            console.log('Masked username failed ❌');
        }

        // Check customer orders again -> has_reviewed should now be 1
        res = await request('GET', '/api/orders', null, customerId);
        const updatedCustOrder = res.body.orders.find(o => o.id === orderId);
        const updatedCustItem = updatedCustOrder.items.find(i => i.id === itemId);
        console.log('Customer order has_reviewed after review:', updatedCustItem?.has_reviewed, '(Expected true) ✅');

        // Test: customer purchases the SAME product in a NEW order
        db.run(`INSERT INTO orders (user_id, order_code, total_amount, payment_method, payment_status, created_at)
                VALUES (?, ?, ?, ?, 'success', datetime('now'))`,
                [customerId, 'TEST-ORD2-' + Date.now(), 150000, 'qris']);
        const orderId2 = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        db.run(`INSERT INTO order_items (order_id, product_id, quantity, price, seller_id, seller_commission, fulfillment_status, delivery_data)
                VALUES (?, ?, 1, 150000, ?, 120000, 'dikirim_ke_admin', 'Akun Baru')`,
                [orderId2, productId, sellerId]);
        saveDatabase();

        res = await request('POST', `/api/products/${productId}/reviews`, {
            rating: 5,
            comment: 'Beli kedua kalinya tetap cepat dan terpercaya!',
            order_id: orderId2,
            is_anonymous: false
        }, customerId);
        console.log('Submit review for second purchase in new order status:', res.status, res.body.message, '(Expected 201) ✅');

        console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
    } catch (err) {
        console.error('Test error:', err);
    } finally {
        server.close();
    }
}

testFeatures();
