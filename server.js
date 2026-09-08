const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Routes (supports both /api/prefix and stripped /prefix)
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const userRoutes = require('./routes/users');

app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/products', '/products'], productRoutes);
app.use(['/api/cart', '/cart'], cartRoutes);
app.use(['/api/orders', '/orders'], orderRoutes);
app.use(['/api/payment', '/payment'], paymentRoutes);
app.use(['/api/users', '/users'], userRoutes);

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
        console.log(`  ║   🌐  http://localhost:${PORT}            ║`);
        console.log('  ║                                      ║');
        console.log('  ║   Demo Accounts:                     ║');
        console.log('  ║   👑 Admin: admin / admin123          ║');
        console.log('  ║   👤 User:  user1 / user123           ║');
        console.log('  ║                                      ║');
        console.log('  ╚══════════════════════════════════════╝');
        console.log('');
    });
}

// Export for Vercel Serverless Function
module.exports = app;
