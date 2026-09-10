const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Safety handlers for serverless environments
process.on('unhandledRejection', (reason) => {
    console.warn('⚡ Caught unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚡ Caught uncaughtException:', err);
});

// Trust proxy on Vercel / reverse proxies
if (process.env.VERCEL) {
    app.set('trust proxy', 1);
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
    secret: 'nexplay-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax',
        secure: false
    }
}));

// Serverless Session Bridge (ensures auth persists across Vercel Lambdas)
app.use((req, res, next) => {
    // 1. Recover session from custom header (sent by API client)
    const headerUserId = req.headers['x-user-id'];
    const headerUserRole = req.headers['x-user-role'];
    if (headerUserId && (!req.session || !req.session.userId)) {
        if (!req.session) req.session = {};
        req.session.userId = parseInt(headerUserId, 10) || headerUserId;
        req.session.role = headerUserRole || (headerUserId == 1 ? 'admin' : 'user');
    }

    // 2. Recover session from cookie
    if ((!req.session || !req.session.userId) && req.headers.cookie) {
        const uidMatch = req.headers.cookie.match(/nexplay_uid=([^;]+)/);
        const roleMatch = req.headers.cookie.match(/nexplay_role=([^;]+)/);
        if (uidMatch) {
            if (!req.session) req.session = {};
            req.session.userId = parseInt(uidMatch[1], 10) || uidMatch[1];
            req.session.role = roleMatch ? roleMatch[1] : (req.session.userId == 1 ? 'admin' : 'user');
        }
    }

    // 3. Attach session cookies on JSON responses when logged in
    const origJson = res.json;
    res.json = function(data) {
        if (req.session && req.session.userId) {
            const uid = req.session.userId;
            const role = req.session.role || (uid == 1 ? 'admin' : 'user');
            res.setHeader('Set-Cookie', [
                `nexplay_uid=${uid}; Path=/; SameSite=Lax; Max-Age=86400`,
                `nexplay_role=${role}; Path=/; SameSite=Lax; Max-Age=86400`
            ]);
        } else if (req.session && req.session.userId === null) {
            res.setHeader('Set-Cookie', [
                `nexplay_uid=; Path=/; SameSite=Lax; Max-Age=0`,
                `nexplay_role=; Path=/; SameSite=Lax; Max-Age=0`
            ]);
        }
        return origJson.call(this, data);
    };

    next();
});

// Initialize database
let dbInitPromise = initDatabase().catch(err => {
    console.error('Failed to init DB:', err);
});

// Ensure DB is ready before handling requests
app.use(async (req, res, next) => {
    try {
        await dbInitPromise;
        next();
    } catch (e) {
        console.error('DB Middleware Error:', e);
        next();
    }
});

// Serve static files if available
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    const rootIndex = path.join(__dirname, 'index.html');
    if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex);
    }
    res.send('NexPlay Entertainment');
});

// API Healthcheck
app.get(['/api', '/api/health'], (req, res) => {
    res.json({
        status: 'ok',
        service: 'NexPlay API',
        timestamp: new Date().toISOString()
    });
});

// Routes (supports both /api/prefix and stripped /prefix)
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const userRoutes = require('./routes/users');
const voucherRoutes = require('./routes/vouchers');
const chatRoutes = require('./routes/chat');

app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/products', '/products'], productRoutes);
app.use(['/api/cart', '/cart'], cartRoutes);
app.use(['/api/orders', '/orders'], orderRoutes);
app.use(['/api/payment', '/payment'], paymentRoutes);
app.use(['/api/users', '/users'], userRoutes);
app.use(['/api/vouchers', '/vouchers'], voucherRoutes);
app.use(['/api/chat', '/chat'], chatRoutes);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Only listen when executed directly (not when imported as a serverless function)
if (require.main === module && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log('');
        console.log('  ╔══════════════════════════════════════╗');
        console.log('  ║                                      ║');
        console.log('  ║   🎮  NexPlay is running!            ║');
        console.log(`  ║   🌐  http://localhost:${PORT}       ║`);
        console.log('  ║                                      ║');
        console.log('  ║   Demo Accounts:                     ║');
        console.log('  ║   👑 Admin: admin / admin123         ║');
        console.log('  ║   👤 User:  user1 / user123          ║');
        console.log('  ║   🧑‍💼 Seller: seller1 / seller123     ║');
        console.log('  ╚══════════════════════════════════════╝');
        console.log('');
    });
}

// Export for Vercel Serverless Function
module.exports = app;
