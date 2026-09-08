const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

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
        sameSite: 'lax'
    }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/users', userRoutes);

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Start server
async function start() {
    try {
        await initDatabase();
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
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
