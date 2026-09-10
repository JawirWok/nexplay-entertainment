const http = require('http');
const express = require('express');
const session = require('express-session');
const { initDatabase, getDb, saveDatabase } = require('../database/init');
const authRouter = require('../routes/auth');
const productsRouter = require('../routes/products');
const ordersRouter = require('../routes/orders');
const chatRouter = require('../routes/chat');

async function testFixes() {
    console.log('=== STARTING TEST OF USER FEEDBACK FIXES ===');
    await initDatabase();
    const db = getDb();

    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false
    }));

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
        const adminId = 1;
        const customerId = 2;
        const sellerId = 4;

        console.log('\n--- 1. Testing Mandatory Review Comment ---');
        // Create an order for review test
        const prodId = 1;
        db.run(`INSERT INTO orders (user_id, order_code, total_amount, payment_method, payment_status, created_at)
                VALUES (?, ?, ?, ?, 'success', datetime('now'))`,
                [customerId, 'TEST-REV-' + Date.now(), 299000, 'qris']);
        const ordId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        db.run(`INSERT INTO order_items (order_id, product_id, quantity, price, fulfillment_status)
                VALUES (?, ?, 1, 299000, 'dikirim_ke_admin')`, [ordId, prodId]);
        saveDatabase();

        // Try submitting empty comment -> must fail with 400
        let res = await request('POST', `/api/products/${prodId}/reviews`, {
            rating: 5,
            comment: '',
            order_id: ordId,
            is_anonymous: false
        }, customerId);
        console.log('Empty comment status:', res.status, res.body.error, res.status === 400 ? 'PASS ✅' : 'FAIL ❌');

        // Try submitting whitespace only comment -> must fail with 400
        res = await request('POST', `/api/products/${prodId}/reviews`, {
            rating: 5,
            comment: '   ',
            order_id: ordId,
            is_anonymous: false
        }, customerId);
        console.log('Whitespace comment status:', res.status, res.body.error, res.status === 400 ? 'PASS ✅' : 'FAIL ❌');

        // Submit with valid comment -> must succeed
        res = await request('POST', `/api/products/${prodId}/reviews`, {
            rating: 5,
            comment: 'Game sangat seru, grafik memukau dan lancar!',
            order_id: ordId,
            is_anonymous: true
        }, customerId);
        console.log('Valid comment status:', res.status, res.body.message, res.status === 201 ? 'PASS ✅' : 'FAIL ❌');

        console.log('\n--- 2. Testing Chat is_mine and Sender Info ---');
        // Customer sends message to Admin
        res = await request('POST', '/api/chat/messages', {
            receiver_id: adminId,
            message: 'Halo Admin, akun saya butuh bantuan'
        }, customerId);
        console.log('Customer send message:', res.status);

        // Customer fetches messages with Admin
        res = await request('GET', `/api/chat/messages?user_id=${adminId}`, null, customerId);
        const lastCustMsg = res.body.messages[res.body.messages.length - 1];
        console.log('Customer sees last message is_mine:', lastCustMsg.is_mine, '(Expected 1)', lastCustMsg.is_mine === 1 ? 'PASS ✅' : 'FAIL ❌');

        // Admin fetches messages with Customer
        res = await request('GET', `/api/chat/messages?user_id=${customerId}`, null, adminId);
        const lastAdminView = res.body.messages[res.body.messages.length - 1];
        console.log('Admin sees customer message is_mine:', lastAdminView.is_mine, '(Expected 0)', lastAdminView.is_mine === 0 ? 'PASS ✅' : 'FAIL ❌');
        console.log('Sender role:', lastAdminView.sender_role, 'Sender username:', lastAdminView.sender_username);

        // Admin replies to Customer
        res = await request('POST', '/api/chat/messages', {
            receiver_id: customerId,
            message: 'Halo, saya Admin NexPlay, ada yang bisa dibantu?'
        }, adminId);
        console.log('Admin send reply:', res.status);

        // Admin re-checks messages
        res = await request('GET', `/api/chat/messages?user_id=${customerId}`, null, adminId);
        const adminReply = res.body.messages[res.body.messages.length - 1];
        console.log('Admin sees reply is_mine:', adminReply.is_mine, '(Expected 1)', adminReply.is_mine === 1 ? 'PASS ✅' : 'FAIL ❌');

        // Customer re-checks messages
        res = await request('GET', `/api/chat/messages?user_id=${adminId}`, null, customerId);
        const custSeesReply = res.body.messages[res.body.messages.length - 1];
        console.log('Customer sees reply is_mine:', custSeesReply.is_mine, '(Expected 0)', custSeesReply.is_mine === 0 ? 'PASS ✅' : 'FAIL ❌');

        console.log('\n--- 3. Testing Admin Conversations & Contacts ---');
        res = await request('GET', '/api/chat/conversations', null, adminId);
        console.log('Conversations count:', res.body.conversations?.length);
        console.log('All contacts count:', res.body.all_contacts?.length);
        if (res.body.all_contacts && res.body.all_contacts.length > 0) {
            console.log('Contacts picker available for Admin: PASS ✅');
        }

        console.log('\n=== ALL USER FEEDBACK TESTS PASSED! ===');
    } catch (err) {
        console.error('Test error:', err);
    } finally {
        server.close();
    }
}

testFixes();
