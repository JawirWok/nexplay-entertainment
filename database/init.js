let initSqlJs;
try {
    initSqlJs = require('sql.js');
} catch (e) {
    console.warn('sql.js not available:', e.message);
}
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const IS_VERCEL = !!process.env.VERCEL;
const ROOT_DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const API_DB_PATH = path.join(__dirname, '..', 'api', 'database.sqlite');
const CWD_DB_PATH = path.join(process.cwd(), 'database.sqlite');
const TMP_DB_PATH = path.join('/tmp', 'database.sqlite');
const DB_PATH = IS_VERCEL ? TMP_DB_PATH : ROOT_DB_PATH;

let db = null;

const DEFAULT_PRODUCTS = [
    [1, 'Cyberpunk 2077: Ultimate Edition', 'Open-world action RPG set in Night City, a megalopolis obsessed with power, glamour and body modification. Includes Phantom Liberty expansion.', 299000, 'game', '/images/cyberpunk.jpg', 50, 4.5, 'PC, PS5, Xbox', 'CD Projekt Red', 2023, 1, 1, 20],
    [2, 'The Witcher 3: Wild Hunt GOTY', 'Award-winning open world RPG. As war rages across the Northern Realms, play as Geralt of Rivia and hunt down the Child of Prophecy.', 199000, 'game', '/images/witcher3.jpg', 100, 4.9, 'PC, PS5, Xbox, Switch', 'CD Projekt Red', 2015, 1, 1, 15],
    [3, 'Elden Ring: Shadow of the Erdtree', 'An action RPG developed by FromSoftware. The game features a vast world full of danger and discovery.', 459000, 'game', '/images/eldenring.jpg', 30, 4.8, 'PC, PS5, Xbox', 'FromSoftware', 2024, 1, 1, 10],
    [4, 'Red Dead Redemption 2', 'Epic tale of outlaw Arthur Morgan and the Van der Linde gang. Also provides the foundation for Red Dead Online.', 249000, 'game', '/images/rdr2.jpg', 60, 4.7, 'PC, PS4, Xbox', 'Rockstar Games', 2019, 0, 1, 0],
    [5, 'God of War: Ragnarök', 'Embark on an epic and heartfelt journey as Kratos and Atreus struggle with holding on and letting go.', 399000, 'game', '/images/godofwar.jpg', 45, 4.6, 'PC, PS5', 'Santa Monica Studio', 2024, 0, 1, 0],
    [6, 'Minecraft Java & Bedrock Edition', 'Create, explore, and survive in a blocky, procedurally generated 3D world.', 149000, 'game', '/images/minecraft.jpg', 200, 4.8, 'PC, Mobile, Console', 'Mojang Studios', 2011, 0, 1, 0],
    [7, 'Avengers: Endgame (4K Digital)', 'The epic conclusion to the Infinity Saga. The remaining Avengers find a way to bring back their vanquished allies.', 49000, 'film', '/images/endgame.jpg', 999, 4.7, 'Digital Download', 'Marvel Studios', 2019, 1, 1, 0],
    [8, 'Interstellar (4K Digital)', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.', 39000, 'film', '/images/interstellar.jpg', 999, 4.9, 'Digital Download', 'Warner Bros', 2014, 0, 1, 0],
    [9, 'Spider-Man: Across the Spider-Verse (4K)', 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People.', 59000, 'film', '/images/spiderverse.jpg', 999, 4.8, 'Digital Download', 'Sony Pictures', 2023, 1, 1, 10],
    [10, 'Dune: Part Two (4K Digital)', 'Paul Atreides unites with Chani and the Fremen while seeking revenge against those who destroyed his family.', 69000, 'film', '/images/dune2.jpg', 999, 4.6, 'Digital Download', 'Warner Bros', 2024, 0, 1, 0],
    [11, 'Spotify Premium — 1 Bulan', 'Akses unlimited ke jutaan lagu tanpa iklan. Download musik untuk offline listening.', 54990, 'music', '/images/spotify.jpg', 999, 4.6, 'All Devices', 'Spotify AB', 2024, 1, 1, 10],
    [12, 'Apple Music — 1 Bulan', 'Stream over 100 million songs ad-free. Spatial Audio with Dolby Atmos.', 49000, 'music', '/images/applemusic.svg', 999, 4.5, 'All Devices', 'Apple Inc.', 2024, 0, 1, 0],
    [13, 'YouTube Music Premium — 1 Bulan', 'Music streaming tanpa iklan, background play, download offline.', 49000, 'music', '/images/ytmusic.svg', 999, 4.3, 'All Devices', 'Google LLC', 2024, 0, 1, 0],
    [14, 'TIDAL HiFi Plus — 1 Bulan', 'Highest quality audio streaming. Master quality, Dolby Atmos, Sony 360 Reality Audio.', 79000, 'music', '/images/tidal.svg', 999, 4.4, 'All Devices', 'TIDAL', 2024, 0, 1, 0],
    [15, 'Atomic Habits — James Clear', 'An Easy & Proven Way to Build Good Habits & Break Bad Ones. #1 NYT bestseller.', 89000, 'ebook', '/images/atomichabits.jpg', 999, 4.8, 'PDF, EPUB', 'James Clear', 2018, 1, 1, 25],
    [16, 'Clean Code — Robert C. Martin', 'A Handbook of Agile Software Craftsmanship. Write code that is clean, elegant, and efficient.', 129000, 'ebook', '/images/cleancode.jpg', 999, 4.7, 'PDF, EPUB', 'Robert C. Martin', 2008, 0, 1, 0],
    [17, 'The Pragmatic Programmer', 'Your Journey to Mastery. Classic must-read for software developers.', 149000, 'ebook', '/images/pragmatic.jpg', 999, 4.6, 'PDF, EPUB', 'David Thomas & Andrew Hunt', 2019, 0, 1, 0],
    [18, 'Sapiens — Yuval Noah Harari', 'A Brief History of Humankind. Explores how biology and history have defined us.', 99000, 'ebook', '/images/sapiens.jpg', 999, 4.5, 'PDF, EPUB', 'Yuval Noah Harari', 2015, 0, 1, 0]
];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'seller')),
    avatar TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('game', 'film', 'music', 'ebook')),
    image_url TEXT DEFAULT '',
    stock INTEGER DEFAULT 100,
    rating REAL DEFAULT 0,
    platform TEXT DEFAULT '',
    developer TEXT DEFAULT '',
    release_year INTEGER DEFAULT 2024,
    featured INTEGER DEFAULT 0,
    seller_id INTEGER DEFAULT 1,
    discount_percentage INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'processing', 'success', 'failed', 'refunded')),
    order_code TEXT UNIQUE,
    voucher_code TEXT DEFAULT '',
    voucher_discount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    price REAL NOT NULL,
    seller_id INTEGER DEFAULT 1,
    admin_commission REAL DEFAULT 0,
    seller_commission REAL DEFAULT 0,
    fulfillment_status TEXT DEFAULT 'menunggu_seller',
    delivery_data TEXT DEFAULT '',
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT DEFAULT 'percentage' CHECK(discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL,
    min_purchase REAL DEFAULT 0,
    usage_limit INTEGER DEFAULT 100,
    used_count INTEGER DEFAULT 0,
    valid_until DATE,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    is_anonymous INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);
`;

function createFallbackDb() {
    console.log('Using in-memory fallback database engine');
    const users = [
        { id: 1, username: 'admin', email: 'admin@nexplay.com', password: bcrypt.hashSync('admin123', 10), role: 'admin', created_at: new Date().toISOString() },
        { id: 2, username: 'user1', email: 'user1@nexplay.com', password: bcrypt.hashSync('user123', 10), role: 'user', created_at: new Date().toISOString() },
        { id: 3, username: 'gamer99', email: 'gamer99@nexplay.com', password: bcrypt.hashSync('user123', 10), role: 'user', created_at: new Date().toISOString() },
        { id: 4, username: 'seller1', email: 'seller1@nexplay.com', password: bcrypt.hashSync('seller123', 10), role: 'seller', created_at: new Date().toISOString() }
    ];

    const prodCols = ['id', 'name', 'description', 'price', 'category', 'image_url', 'stock', 'rating', 'platform', 'developer', 'release_year', 'featured', 'seller_id', 'discount_percentage'];
    const products = DEFAULT_PRODUCTS.map(p => {
        const obj = {};
        prodCols.forEach((col, idx) => { obj[col] = p[idx]; });
        return obj;
    });

    const vouchers = [
        { id: 1, code: 'HEMAT10', discount_type: 'percentage', discount_value: 10, min_purchase: 50000, usage_limit: 100, used_count: 0, valid_until: '2026-12-31', is_active: 1, created_at: new Date().toISOString() },
        { id: 2, code: 'NEXPLAY25', discount_type: 'fixed', discount_value: 25000, min_purchase: 100000, usage_limit: 50, used_count: 0, valid_until: '2026-12-31', is_active: 1, created_at: new Date().toISOString() },
        { id: 3, code: 'HEMAT30', discount_type: 'percentage', discount_value: 30, min_purchase: 0, usage_limit: 100, used_count: 1, valid_until: '2026-12-31', is_active: 1, created_at: new Date().toISOString() }
    ];

    const cartItems = [];
    const orders = [
        { id: 1, user_id: 2, total_amount: 498000, payment_method: 'qris', payment_status: 'success', order_code: 'NXP-DEMO-001', voucher_code: 'HEMAT10', voucher_discount: 49800, created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: 2, user_id: 3, total_amount: 299000, payment_method: 'bca_va', payment_status: 'pending', order_code: 'NXP-DEMO-002', voucher_code: '', voucher_discount: 0, created_at: new Date(Date.now() - 1800000).toISOString() }
    ];
    const orderItems = [
        { id: 1, order_id: 1, product_id: 1, quantity: 1, price: 299000, seller_id: 1, admin_commission: 59800, seller_commission: 239200, fulfillment_status: 'siap_diproses', delivery_data: 'Akun: user1@demo.com | Pass: demo123' },
        { id: 2, order_id: 1, product_id: 2, quantity: 1, price: 199000, seller_id: 1, admin_commission: 39800, seller_commission: 159200, fulfillment_status: 'siap_diproses', delivery_data: 'Serial Key: W3-ABCD-1234-XYZ' },
        { id: 3, order_id: 2, product_id: 1, quantity: 1, price: 299000, seller_id: 1, admin_commission: 59800, seller_commission: 239200, fulfillment_status: 'menunggu_seller', delivery_data: '' }
    ];
    const reviews = [];
    const chatMessages = [
        { id: 1, sender_id: 2, receiver_id: 1, message: 'Halo admin, apakah pesanan saya sudah diproses?', is_read: 1, created_at: new Date(Date.now() - 7200000).toISOString() },
        { id: 2, sender_id: 1, receiver_id: 2, message: 'Halo! Sudah diproses ya, silakan cek detail akun di menu pesanan.', is_read: 1, created_at: new Date(Date.now() - 3600000).toISOString() }
    ];

    return {
        exec(sql, params = []) {
            sql = (sql || '').trim();

            // Vouchers queries
            if (sql.includes('FROM vouchers')) {
                let list = [...vouchers];
                if (params && params.length) {
                    if (sql.includes('WHERE code = ?')) {
                        const code = String(params[0]).toUpperCase();
                        list = list.filter(v => v.code.toUpperCase() === code);
                        if (sql.includes('is_active = 1')) {
                            list = list.filter(v => v.is_active === 1);
                        }
                    } else if (sql.includes('WHERE id = ?')) {
                        list = list.filter(v => v.id == params[0]);
                    }
                }
                if (sql.includes('SELECT COUNT(*)')) {
                    return [{ columns: ['count'], values: [[list.length]] }];
                }
                if (sql.includes('SELECT id, is_active FROM vouchers')) {
                    return [{ columns: ['id', 'is_active'], values: list.map(v => [v.id, v.is_active]) }];
                }
                if (sql.includes('SELECT id FROM vouchers WHERE code = ?')) {
                    const code = String(params[0]).toUpperCase();
                    const matches = vouchers.filter(v => v.code.toUpperCase() === code);
                    return matches.length > 0 ? [{ columns: ['id'], values: matches.map(v => [v.id]) }] : [];
                }
                const vCols = ['id', 'code', 'discount_type', 'discount_value', 'min_purchase', 'usage_limit', 'used_count', 'valid_until', 'is_active', 'created_at'];
                const values = list.map(v => vCols.map(c => v[c]));
                return [{ columns: vCols, values }];
            }

            // Stats / Aggregates queries
            if (sql.includes('SELECT COUNT(*) FROM orders') || sql.includes('COUNT(*) FROM orders')) {
                if (sql.includes('payment_status = "pending"') || sql.includes("payment_status = 'pending'")) {
                    const c = orders.filter(o => o.payment_status === 'pending' || o.payment_status === 'processing').length;
                    return [{ columns: ['count'], values: [[c]] }];
                }
                return [{ columns: ['count'], values: [[orders.length]] }];
            }

            if (sql.includes('SUM(total_amount)') || sql.includes('COALESCE(SUM(total_amount), 0)')) {
                const total = orders.filter(o => o.payment_status === 'success').reduce((acc, o) => acc + (o.total_amount || 0), 0);
                return [{ columns: ['total'], values: [[total]] }];
            }

            if (sql.includes('COUNT(*) FROM users') || sql.includes('count FROM users')) {
                if (sql.includes('role = "user"') || sql.includes("role = 'user'")) {
                    const c = users.filter(u => u.role === 'user').length;
                    return [{ columns: ['count'], values: [[c]] }];
                }
                return [{ columns: ['count'], values: [[users.length]] }];
            }

            if (sql.includes('COUNT(*) FROM products')) {
                return [{ columns: ['count'], values: [[products.length]] }];
            }

            // Admin commission breakdown
            if (sql.includes('SUM(oi.admin_commission)')) {
                const comm = orderItems.reduce((acc, oi) => {
                    const ord = orders.find(o => o.id == oi.order_id);
                    return ord && ord.payment_status === 'success' ? acc + (oi.admin_commission || 0) : acc;
                }, 0);
                return [{ columns: ['commission'], values: [[comm]] }];
            }

            // Seller commission breakdown
            if (sql.includes('SUM(oi.seller_commission)')) {
                let sellerId = params[0];
                const comm = orderItems.filter(oi => oi.seller_id == sellerId).reduce((acc, oi) => {
                    const ord = orders.find(o => o.id == oi.order_id);
                    return ord && ord.payment_status === 'success' ? acc + (oi.seller_commission || 0) : acc;
                }, 0);
                return [{ columns: ['commission'], values: [[comm]] }];
            }

            // Products queries
            if (sql.includes('SELECT') && sql.includes('FROM products')) {
                let list = [...products];
                if (params && params.length) {
                    if (sql.includes('WHERE id = ?')) {
                        list = list.filter(p => p.id == params[0]);
                    } else if (sql.includes('category = ?')) {
                        list = list.filter(p => p.category === params[0]);
                    } else if (sql.includes('seller_id = ?')) {
                        list = list.filter(p => p.seller_id == params[0]);
                    }
                }
                if (sql.includes('ORDER BY id DESC LIMIT 1')) {
                    list = list.slice(-1);
                }
                const values = list.map(p => prodCols.map(c => p[c]));
                return [{ columns: prodCols, values }];
            }

            // Role check query
            if (sql.includes('SELECT role FROM users')) {
                let u = users;
                if (params && params.length && sql.includes('WHERE id = ?')) {
                    u = users.filter(x => x.id == params[0]);
                }
                const r = u.length > 0 ? u[0].role : 'user';
                return [{ columns: ['role'], values: [[r]] }];
            }

            // Users queries
            if (sql.includes('FROM users')) {
                let u = users;
                if (params && params.length) {
                    if (sql.includes('username = ? OR email = ?')) {
                        u = users.filter(x => x.username === params[0] || x.email === params[1]);
                    } else if (sql.includes('username = ?')) {
                        u = users.filter(x => x.username === params[0]);
                    } else if (sql.includes('WHERE id = ?')) {
                        u = users.filter(x => x.id == params[0]);
                    }
                }

                if (sql.includes('SELECT id, username, email, role, created_at')) {
                    const cols = ['id', 'username', 'email', 'role', 'created_at'];
                    const values = u.map(x => cols.map(c => x[c]));
                    return [{ columns: cols, values }];
                }

                if (sql.includes('SELECT id, username, email, role')) {
                    const cols = ['id', 'username', 'email', 'role'];
                    const values = u.map(x => cols.map(c => x[c]));
                    return [{ columns: cols, values }];
                }

                const cols = ['id', 'username', 'email', 'password', 'role', 'created_at'];
                const values = u.map(x => cols.map(c => x[c]));
                return [{ columns: cols, values }];
            }

            // Cart items
            if (sql.includes('FROM cart_items')) {
                const cols = ['id', 'quantity', 'product_id', 'name', 'price', 'stock', 'seller_id', 'image_url', 'category', 'discount_percentage'];
                let filtered = cartItems;
                if (params && params.length && sql.includes('WHERE ci.user_id = ?')) {
                    filtered = cartItems.filter(c => c.user_id == params[0]);
                }
                const values = filtered.map(c => {
                    const p = products.find(x => x.id == c.product_id) || {};
                    return [c.id, c.quantity, c.product_id, p.name || '', p.price || 0, p.stock || 100, p.seller_id || 1, p.image_url || '', p.category || '', p.discount_percentage || 0];
                });
                return [{ columns: cols, values }];
            }

            // Order items join
            if (sql.includes('FROM order_items')) {
                const cols = ['id', 'order_id', 'product_id', 'quantity', 'price', 'seller_id', 'admin_commission', 'seller_commission', 'fulfillment_status', 'name', 'image_url', 'category', 'order_code', 'payment_status', 'created_at', 'buyer_username', 'product_name'];
                let filtered = orderItems;
                if (params && params.length) {
                    if (sql.includes('WHERE oi.order_id = ?') || sql.includes('WHERE order_id = ?')) {
                        filtered = orderItems.filter(oi => oi.order_id == params[0]);
                    } else if (sql.includes('WHERE oi.seller_id = ?')) {
                        filtered = orderItems.filter(oi => oi.seller_id == params[0]);
                    }
                }
                const values = filtered.map(oi => {
                    const p = products.find(x => x.id == oi.product_id) || {};
                    const o = orders.find(x => x.id == oi.order_id) || {};
                    const u = users.find(x => x.id == o.user_id) || {};
                    return [
                        oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price, oi.seller_id || 1,
                        oi.admin_commission || 0, oi.seller_commission || 0, oi.fulfillment_status || 'siap_diproses',
                        p.name || '', p.image_url || '', p.category || '',
                        o.order_code || '', o.payment_status || 'pending', o.created_at || '', u.username || 'user', p.name || ''
                    ];
                });
                return [{ columns: cols, values }];
            }

            // Orders list
            if (sql.includes('FROM orders')) {
                const cols = ['id', 'user_id', 'total_amount', 'payment_method', 'payment_status', 'order_code', 'voucher_code', 'voucher_discount', 'created_at', 'username'];
                let list = orders;
                if (params && params.length) {
                    if (sql.includes('WHERE user_id = ?')) {
                        list = orders.filter(o => o.user_id == params[0]);
                    } else if (sql.includes('WHERE id = ?')) {
                        list = orders.filter(o => o.id == params[0]);
                    } else if (sql.includes('WHERE order_code = ?')) {
                        list = orders.filter(o => o.order_code === params[0]);
                    }
                }
                const values = list.map(o => {
                    const u = users.find(x => x.id == o.user_id) || {};
                    return [o.id, o.user_id, o.total_amount, o.payment_method, o.payment_status, o.order_code, o.voucher_code || '', o.voucher_discount || 0, o.created_at, u.username || 'user'];
                });
                return [{ columns: cols, values }];
            }

            // Reviews
            if (sql.includes('FROM reviews')) {
                let filtered = reviews;
                if (params && params.length && sql.includes('product_id = ?')) {
                    filtered = reviews.filter(r => r.product_id == params[0]);
                }
                const cols = ['id', 'user_id', 'product_id', 'order_id', 'rating', 'comment', 'is_anonymous', 'created_at', 'username', 'avatar'];
                const values = filtered.map(r => {
                    const u = users.find(x => x.id == r.user_id) || {};
                    const uname = r.is_anonymous ? (u.username ? u.username[0] + '***' : 'A***') : (u.username || 'User');
                    return [r.id, r.user_id, r.product_id, r.order_id, r.rating, r.comment, r.is_anonymous || 0, r.created_at, uname, u.avatar || ''];
                });
                return [{ columns: cols, values }];
            }

            // Chat unread count
            if (sql.includes('COUNT(*) as count FROM chat_messages') || (sql.includes('FROM chat_messages') && sql.includes('COUNT(*)'))) {
                let unread = chatMessages.filter(m => m.receiver_id == params[0] && !m.is_read).length;
                return [{ columns: ['count'], values: [[unread]] }];
            }

            // Chat conversations
            if (sql.includes('FROM chat_messages') && sql.includes('sender_id = ? OR receiver_id = ?')) {
                const uid = params[0];
                const otherUserIds = new Set();
                chatMessages.forEach(m => {
                    if (m.sender_id == uid) otherUserIds.add(m.receiver_id);
                    if (m.receiver_id == uid) otherUserIds.add(m.sender_id);
                });
                const convos = Array.from(otherUserIds).map(otherId => {
                    const otherUser = users.find(u => u.id == otherId) || {};
                    const thread = chatMessages.filter(m => (m.sender_id == uid && m.receiver_id == otherId) || (m.sender_id == otherId && m.receiver_id == uid));
                    const lastMsg = thread[thread.length - 1] || {};
                    const unreadCount = thread.filter(m => m.sender_id == otherId && m.receiver_id == uid && !m.is_read).length;
                    return {
                        other_user_id: otherId,
                        other_username: otherUser.username || 'User',
                        other_role: otherUser.role || 'user',
                        other_avatar: otherUser.avatar || '',
                        last_message: lastMsg.message || '',
                        last_message_time: lastMsg.created_at || '',
                        unread_count: unreadCount
                    };
                });
                const cols = ['other_user_id', 'other_username', 'other_role', 'other_avatar', 'last_message', 'last_message_time', 'unread_count'];
                const values = convos.map(c => cols.map(k => c[k]));
                return [{ columns: cols, values }];
            }

            // Chat messages between two users
            if (sql.includes('FROM chat_messages')) {
                let filtered = chatMessages;
                if (params && params.length >= 2) {
                    const u1 = params[0], u2 = params[1];
                    filtered = chatMessages.filter(m => (m.sender_id == u1 && m.receiver_id == u2) || (m.sender_id == u2 && m.receiver_id == u1));
                }
                const cols = ['id', 'sender_id', 'receiver_id', 'message', 'is_read', 'created_at', 'sender_name', 'sender_role'];
                const values = filtered.map(m => {
                    const s = users.find(u => u.id == m.sender_id) || {};
                    return [m.id, m.sender_id, m.receiver_id, m.message, m.is_read ? 1 : 0, m.created_at, s.username || 'User', s.role || 'user'];
                });
                return [{ columns: cols, values }];
            }

            // can-review
            if (sql.includes('SELECT o.id as order_id FROM orders') || (sql.includes('order_id') && sql.includes('JOIN order_items'))) {
                const uid = params[0];
                const pid = params[1];
                const eligibleOrder = orders.find(o => {
                    if (o.user_id != uid || o.payment_status !== 'success') return false;
                    const hasItem = orderItems.some(oi => oi.order_id == o.id && oi.product_id == pid);
                    if (!hasItem) return false;
                    const alreadyReviewed = reviews.some(r => r.order_id == o.id && r.product_id == pid && r.user_id == uid);
                    return !alreadyReviewed;
                });
                if (eligibleOrder) {
                    return [{ columns: ['order_id'], values: [[eligibleOrder.id]] }];
                }
                return [];
            }

            // spending-stats
            if (sql.includes('SELECT o.id, o.total_amount, o.created_at FROM orders')) {
                const uid = params[0];
                const filtered = orders.filter(o => o.user_id == uid && o.payment_status === 'success');
                const cols = ['id', 'total_amount', 'created_at'];
                const values = filtered.map(o => [o.id, o.total_amount, o.created_at]);
                return [{ columns: cols, values }];
            }

            return [];
        },

        run(sql, params = []) {
            sql = (sql || '').trim();
            if (sql.startsWith('INSERT INTO users')) {
                users.push({
                    id: users.length + 1,
                    username: params[0],
                    email: params[1],
                    password: params[2],
                    role: params[3] || 'user',
                    created_at: new Date().toISOString()
                });
            } else if (sql.startsWith('INSERT INTO products')) {
                const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
                products.push({
                    id: newId,
                    name: params[0],
                    description: params[1] || '',
                    price: params[2],
                    category: params[3],
                    image_url: params[4] || '',
                    stock: params[5] || 100,
                    rating: params[6] || 0,
                    platform: params[7] || '',
                    developer: params[8] || '',
                    release_year: params[9] || 2024,
                    featured: params[10] || 0,
                    seller_id: params[11] || 1,
                    discount_percentage: params[12] || 0,
                    created_at: new Date().toISOString()
                });
            } else if (sql.startsWith('UPDATE products')) {
                if (sql.includes('SET name=')) {
                    const id = params[params.length - 1];
                    const idx = products.findIndex(p => p.id == id);
                    if (idx !== -1) {
                        products[idx].name = params[0];
                        products[idx].description = params[1];
                        products[idx].price = params[2];
                        products[idx].category = params[3];
                        products[idx].image_url = params[4];
                        products[idx].stock = params[5];
                        products[idx].rating = params[6];
                        products[idx].platform = params[7];
                        products[idx].developer = params[8];
                        products[idx].release_year = params[9];
                        products[idx].featured = params[10];
                        products[idx].discount_percentage = params[11];
                    }
                } else if (sql.includes('stock = stock - ?')) {
                    const qty = params[0];
                    const pid = params[1];
                    const p = products.find(x => x.id == pid);
                    if (p) p.stock = Math.max(0, p.stock - qty);
                } else if (sql.includes('stock = stock + ?')) {
                    const qty = params[0];
                    const pid = params[1];
                    const p = products.find(x => x.id == pid);
                    if (p) p.stock += qty;
                }
            } else if (sql.startsWith('DELETE FROM products')) {
                const id = params[0];
                const idx = products.findIndex(p => p.id == id);
                if (idx !== -1) products.splice(idx, 1);
            } else if (sql.startsWith('INSERT INTO vouchers')) {
                vouchers.push({
                    id: vouchers.length + 1,
                    code: String(params[0]).toUpperCase(),
                    discount_type: params[1],
                    discount_value: params[2],
                    min_purchase: params[3] || 0,
                    usage_limit: params[4] || 100,
                    used_count: 0,
                    valid_until: params[5] || null,
                    is_active: 1,
                    created_at: new Date().toISOString()
                });
            } else if (sql.startsWith('UPDATE vouchers')) {
                if (sql.includes('is_active = ?')) {
                    const v = vouchers.find(x => x.id == params[1]);
                    if (v) v.is_active = params[0];
                } else if (sql.includes('used_count = used_count + 1')) {
                    const v = vouchers.find(x => x.id == params[0]);
                    if (v) v.used_count = (v.used_count || 0) + 1;
                }
            } else if (sql.startsWith('DELETE FROM vouchers')) {
                const idx = vouchers.findIndex(x => x.id == params[0]);
                if (idx !== -1) vouchers.splice(idx, 1);
            } else if (sql.startsWith('INSERT INTO cart_items')) {
                cartItems.push({ id: cartItems.length + 1, user_id: params[0] || 1, product_id: params[1], quantity: params[2] || 1 });
            } else if (sql.startsWith('DELETE FROM cart_items')) {
                if (sql.includes('WHERE user_id = ? AND id IN')) {
                    const uid = params[0];
                    const itemIds = params.slice(1);
                    const rem = cartItems.filter(c => !(c.user_id == uid && itemIds.includes(c.id)));
                    cartItems.length = 0;
                    cartItems.push(...rem);
                } else {
                    const uid = params[0];
                    const rem = cartItems.filter(c => c.user_id != uid);
                    cartItems.length = 0;
                    cartItems.push(...rem);
                }
            } else if (sql.startsWith('INSERT INTO orders')) {
                orders.push({
                    id: orders.length + 1,
                    user_id: params[0],
                    total_amount: params[1],
                    payment_method: params[2],
                    payment_status: params[3],
                    order_code: params[4],
                    voucher_code: params[5] || '',
                    voucher_discount: params[6] || 0,
                    created_at: new Date().toISOString()
                });
            } else if (sql.startsWith('UPDATE orders')) {
                if (sql.includes('payment_status = ?')) {
                    const ord = orders.find(o => o.id == params[1]);
                    if (ord) ord.payment_status = params[0];
                }
            } else if (sql.startsWith('INSERT INTO order_items')) {
                orderItems.push({
                    id: orderItems.length + 1,
                    order_id: params[0],
                    product_id: params[1],
                    quantity: params[2],
                    price: params[3],
                    seller_id: params[4] || 1,
                    admin_commission: params[5] || 0,
                    seller_commission: params[6] || 0,
                    fulfillment_status: params[7] || 'menunggu_seller'
                });
            } else if (sql.startsWith('UPDATE order_items')) {
                if (sql.includes('fulfillment_status =')) {
                    const item = orderItems.find(x => x.id == params[0]);
                    if (item) item.fulfillment_status = 'dikirim_ke_admin';
                }
            } else if (sql.startsWith('INSERT INTO reviews')) {
                reviews.push({
                    id: reviews.length + 1,
                    user_id: params[0],
                    product_id: params[1],
                    order_id: params[2],
                    rating: params[3],
                    comment: params[4],
                    is_anonymous: params[5] || 0,
                    created_at: new Date().toISOString()
                });
            } else if (sql.startsWith('INSERT INTO chat_messages')) {
                chatMessages.push({
                    id: chatMessages.length + 1,
                    sender_id: params[0],
                    receiver_id: params[1],
                    message: params[2],
                    is_read: 0,
                    created_at: new Date().toISOString()
                });
            } else if (sql.startsWith('UPDATE chat_messages')) {
                if (sql.includes('is_read = 1')) {
                    const sender = params[0], receiver = params[1];
                    chatMessages.forEach(m => {
                        if (m.sender_id == sender && m.receiver_id == receiver) m.is_read = 1;
                    });
                }
            }
        },

        export() {
            return new Uint8Array();
        }
    };
}

async function initDatabase() {
    if (db) return db;

    try {
        if (!initSqlJs) {
            throw new Error('sql.js module is not loaded');
        }

        let sqlJsWasmDir = null;
        try {
            sqlJsWasmDir = path.dirname(require.resolve('sql.js'));
        } catch (e) {}

        const possibleWasm = [
            path.join(__dirname, 'sql-wasm.wasm'),
            path.join(__dirname, 'database', 'sql-wasm.wasm'),
            path.join(__dirname, 'api', 'sql-wasm.wasm'),
            path.join(__dirname, '..', 'sql-wasm.wasm'),
            path.join(__dirname, '..', 'database', 'sql-wasm.wasm'),
            path.join(__dirname, '..', 'api', 'sql-wasm.wasm'),
            path.join(process.cwd(), 'sql-wasm.wasm'),
            path.join(process.cwd(), 'database', 'sql-wasm.wasm'),
            path.join(process.cwd(), 'api', 'sql-wasm.wasm'),
            '/var/task/sql-wasm.wasm',
            '/var/task/database/sql-wasm.wasm',
            '/var/task/api/sql-wasm.wasm'
        ];
        if (sqlJsWasmDir) {
            possibleWasm.push(path.join(sqlJsWasmDir, 'sql-wasm.wasm'));
            possibleWasm.push(path.join(sqlJsWasmDir, '..', 'sql-wasm.wasm'));
        }

        let wasmBinary = null;
        for (const p of possibleWasm) {
            if (fs.existsSync(p)) {
                try {
                    wasmBinary = fs.readFileSync(p);
                    console.log('⚡ Loaded SQLite WASM binary from:', p);
                    break;
                } catch (e) {
                    console.warn('Could not read WASM from', p, e.message);
                }
            }
        }

        let SQL;
        if (wasmBinary) {
            SQL = await initSqlJs({ wasmBinary });
        } else {
            const existingWasm = possibleWasm.find(p => fs.existsSync(p));
            if (existingWasm) {
                SQL = await initSqlJs({ locateFile: () => existingWasm });
            } else {
                throw new Error('SQLite WASM binary not found in filesystem');
            }
        }

        // On Vercel, copy persistent initial database into writable /tmp
        if (IS_VERCEL && !fs.existsSync(TMP_DB_PATH)) {
            const seedSources = [
                ROOT_DB_PATH,
                API_DB_PATH,
                CWD_DB_PATH,
                path.join(__dirname, 'database.sqlite'),
                path.join(__dirname, '..', 'database.sqlite'),
                path.join(__dirname, 'database', 'database.sqlite'),
                path.join(process.cwd(), 'database.sqlite'),
                path.join(process.cwd(), 'api', 'database.sqlite'),
                path.join(process.cwd(), 'database', 'database.sqlite'),
                '/var/task/database.sqlite',
                '/var/task/api/database.sqlite',
                '/var/task/database/database.sqlite'
            ];
            const seedSource = seedSources.find(p => fs.existsSync(p));
            if (seedSource) {
                try {
                    fs.copyFileSync(seedSource, TMP_DB_PATH);
                    console.log('⚡ Copied initial database into /tmp from:', seedSource);
                } catch (e) {
                    console.warn('Failed copying initial DB into /tmp:', e.message);
                }
            }
        }

        const candidateDbPaths = [
            DB_PATH,
            ROOT_DB_PATH,
            API_DB_PATH,
            CWD_DB_PATH,
            path.join(__dirname, 'database.sqlite'),
            path.join(__dirname, '..', 'database.sqlite'),
            path.join(process.cwd(), 'database.sqlite'),
            path.join(process.cwd(), 'api', 'database.sqlite'),
            '/var/task/database.sqlite',
            '/var/task/api/database.sqlite'
        ];
        const existingDbPath = candidateDbPaths.find(p => fs.existsSync(p));

        if (existingDbPath) {
            try {
                const buffer = fs.readFileSync(existingDbPath);
                db = new SQL.Database(buffer);
                console.log('⚡ Opened existing SQLite database from:', existingDbPath);
            } catch (e) {
                console.warn('Failed opening existing DB, creating fresh instance:', e.message);
                db = new SQL.Database();
            }
        } else {
            console.log('⚡ Creating new in-memory SQLite database instance');
            db = new SQL.Database();
        }

        // Ensure tables exist
        db.run(SCHEMA_SQL);

        // Run migrations for existing databases to guarantee all columns exist
        try {
            // Check products table columns
            const prodCols = db.exec('PRAGMA table_info(products)')[0].values.map(v => v[1]);
            if (!prodCols.includes('discount_percentage')) {
                db.run('ALTER TABLE products ADD COLUMN discount_percentage INTEGER DEFAULT 0');
                console.log('⚡ Migration: added discount_percentage to products');
            }
            if (!prodCols.includes('seller_id')) {
                db.run('ALTER TABLE products ADD COLUMN seller_id INTEGER DEFAULT 1');
                console.log('⚡ Migration: added seller_id to products');
            }

            // Check orders table columns
            const orderCols = db.exec('PRAGMA table_info(orders)')[0].values.map(v => v[1]);
            if (!orderCols.includes('voucher_code')) {
                db.run('ALTER TABLE orders ADD COLUMN voucher_code TEXT DEFAULT ""');
                console.log('⚡ Migration: added voucher_code to orders');
            }
            if (!orderCols.includes('voucher_discount')) {
                db.run('ALTER TABLE orders ADD COLUMN voucher_discount REAL DEFAULT 0');
                console.log('⚡ Migration: added voucher_discount to orders');
            }

            // Check order_items table columns
            const itemCols = db.exec('PRAGMA table_info(order_items)')[0].values.map(v => v[1]);
            if (!itemCols.includes('fulfillment_status')) {
                db.run('ALTER TABLE order_items ADD COLUMN fulfillment_status TEXT DEFAULT "menunggu_seller"');
                console.log('⚡ Migration: added fulfillment_status to order_items');
            }
            if (!itemCols.includes('seller_id')) {
                db.run('ALTER TABLE order_items ADD COLUMN seller_id INTEGER DEFAULT 1');
            }
            if (!itemCols.includes('admin_commission')) {
                db.run('ALTER TABLE order_items ADD COLUMN admin_commission REAL DEFAULT 0');
            }
            if (!itemCols.includes('seller_commission')) {
                db.run('ALTER TABLE order_items ADD COLUMN seller_commission REAL DEFAULT 0');
            }
            if (!itemCols.includes('delivery_data')) {
                db.run('ALTER TABLE order_items ADD COLUMN delivery_data TEXT DEFAULT ""');
                console.log('⚡ Migration: added delivery_data to order_items');
            }

            // Check reviews table columns
            const reviewCols = db.exec('PRAGMA table_info(reviews)')[0].values.map(v => v[1]);
            if (!reviewCols.includes('is_anonymous')) {
                db.run('ALTER TABLE reviews ADD COLUMN is_anonymous INTEGER DEFAULT 0');
                console.log('⚡ Migration: added is_anonymous to reviews');
            }
        } catch (e) {
            console.warn('Migration check note:', e.message);
        }

        // Seed initial vouchers if empty
        try {
            const vResult = db.exec('SELECT COUNT(*) FROM vouchers');
            const vCount = vResult[0] ? vResult[0].values[0][0] : 0;
            if (vCount === 0) {
                db.run(`INSERT INTO vouchers (code, discount_type, discount_value, min_purchase, usage_limit, used_count, valid_until, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['HEMAT10', 'percentage', 10, 50000, 100, 0, '2026-12-31', 1]);
                db.run(`INSERT INTO vouchers (code, discount_type, discount_value, min_purchase, usage_limit, used_count, valid_until, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['NEXPLAY25', 'fixed', 25000, 100000, 50, 0, '2026-12-31', 1]);
                db.run(`INSERT INTO vouchers (code, discount_type, discount_value, min_purchase, usage_limit, used_count, valid_until, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['HEMAT30', 'percentage', 30, 0, 100, 0, '2026-12-31', 1]);
            }
        } catch (e) { /* ignore */ }

        // Seed users & products if empty
        const result = db.exec('SELECT COUNT(*) as count FROM users');
        const userCount = result[0] ? result[0].values[0][0] : 0;

        if (userCount === 0) {
            seedUsers();
            seedProducts();
        }

        saveDatabase();
        console.log('✅ SQLite database initialized successfully');
        return db;
    } catch (err) {
        console.warn('SQLite init error, falling back to memory DB:', err.message);
        db = createFallbackDb();
        return db;
    }
}

function getDb() {
    if (!db) db = createFallbackDb();
    return db;
}

function saveDatabase() {
    if (db && typeof db.export === 'function') {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_PATH, buffer);
        } catch (e) { /* ignore */ }
    }
}

function seedUsers() {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const userHash = bcrypt.hashSync('user123', 10);
    const sellerHash = bcrypt.hashSync('seller123', 10);

    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['admin', 'admin@nexplay.com', adminHash, 'admin']);
    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['user1', 'user1@nexplay.com', userHash, 'user']);
    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['gamer99', 'gamer99@nexplay.com', userHash, 'user']);
    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['seller1', 'seller1@nexplay.com', sellerHash, 'seller']);
}

function seedProducts() {
    for (const p of DEFAULT_PRODUCTS) {
        db.run(`INSERT INTO products (id, name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, seller_id, discount_percentage)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p);
    }
}

module.exports = { initDatabase, getDb, saveDatabase, DB_PATH };
