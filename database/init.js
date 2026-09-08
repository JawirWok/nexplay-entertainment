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
const TMP_DB_PATH = path.join('/tmp', 'database.sqlite');
const DB_PATH = IS_VERCEL ? TMP_DB_PATH : ROOT_DB_PATH;

let db = null;

const DEFAULT_PRODUCTS = [
    [1, 'Cyberpunk 2077: Ultimate Edition', 'Open-world action RPG set in Night City, a megalopolis obsessed with power, glamour and body modification. Includes Phantom Liberty expansion.', 299000, 'game', '/images/cyberpunk.jpg', 50, 4.5, 'PC, PS5, Xbox', 'CD Projekt Red', 2023, 1],
    [2, 'The Witcher 3: Wild Hunt GOTY', 'Award-winning open world RPG. As war rages across the Northern Realms, play as Geralt of Rivia and hunt down the Child of Prophecy.', 199000, 'game', '/images/witcher3.jpg', 100, 4.9, 'PC, PS5, Xbox, Switch', 'CD Projekt Red', 2015, 1],
    [3, 'Elden Ring: Shadow of the Erdtree', 'An action RPG developed by FromSoftware. The game features a vast world full of danger and discovery.', 459000, 'game', '/images/eldenring.jpg', 30, 4.8, 'PC, PS5, Xbox', 'FromSoftware', 2024, 1],
    [4, 'Red Dead Redemption 2', 'Epic tale of outlaw Arthur Morgan and the Van der Linde gang. Also provides the foundation for Red Dead Online.', 249000, 'game', '/images/rdr2.jpg', 60, 4.7, 'PC, PS4, Xbox', 'Rockstar Games', 2019, 0],
    [5, 'God of War: Ragnarök', 'Embark on an epic and heartfelt journey as Kratos and Atreus struggle with holding on and letting go.', 399000, 'game', '/images/godofwar.jpg', 45, 4.6, 'PC, PS5', 'Santa Monica Studio', 2024, 0],
    [6, 'Minecraft Java & Bedrock Edition', 'Create, explore, and survive in a blocky, procedurally generated 3D world.', 149000, 'game', '/images/minecraft.jpg', 200, 4.8, 'PC, Mobile, Console', 'Mojang Studios', 2011, 0],
    [7, 'Avengers: Endgame (4K Digital)', 'The epic conclusion to the Infinity Saga. The remaining Avengers find a way to bring back their vanquished allies.', 49000, 'film', '/images/endgame.jpg', 999, 4.7, 'Digital Download', 'Marvel Studios', 2019, 1],
    [8, 'Interstellar (4K Digital)', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.', 39000, 'film', '/images/interstellar.jpg', 999, 4.9, 'Digital Download', 'Warner Bros', 2014, 0],
    [9, 'Spider-Man: Across the Spider-Verse (4K)', 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People.', 59000, 'film', '/images/spiderverse.jpg', 999, 4.8, 'Digital Download', 'Sony Pictures', 2023, 1],
    [10, 'Dune: Part Two (4K Digital)', 'Paul Atreides unites with Chani and the Fremen while seeking revenge against those who destroyed his family.', 69000, 'film', '/images/dune2.jpg', 999, 4.6, 'Digital Download', 'Warner Bros', 2024, 0],
    [11, 'Spotify Premium — 1 Bulan', 'Akses unlimited ke jutaan lagu tanpa iklan. Download musik untuk offline listening.', 54990, 'music', '/images/spotify.jpg', 999, 4.6, 'All Devices', 'Spotify AB', 2024, 1],
    [12, 'Apple Music — 1 Bulan', 'Stream over 100 million songs ad-free. Spatial Audio with Dolby Atmos.', 49000, 'music', '/images/applemusic.svg', 999, 4.5, 'All Devices', 'Apple Inc.', 2024, 0],
    [13, 'YouTube Music Premium — 1 Bulan', 'Music streaming tanpa iklan, background play, download offline.', 49000, 'music', '/images/ytmusic.svg', 999, 4.3, 'All Devices', 'Google LLC', 2024, 0],
    [14, 'TIDAL HiFi Plus — 1 Bulan', 'Highest quality audio streaming. Master quality, Dolby Atmos, Sony 360 Reality Audio.', 79000, 'music', '/images/tidal.svg', 999, 4.4, 'All Devices', 'TIDAL', 2024, 0],
    [15, 'Atomic Habits — James Clear', 'An Easy & Proven Way to Build Good Habits & Break Bad Ones. #1 NYT bestseller.', 89000, 'ebook', '/images/atomichabits.jpg', 999, 4.8, 'PDF, EPUB', 'James Clear', 2018, 1],
    [16, 'Clean Code — Robert C. Martin', 'A Handbook of Agile Software Craftsmanship. Write code that is clean, elegant, and efficient.', 129000, 'ebook', '/images/cleancode.jpg', 999, 4.7, 'PDF, EPUB', 'Robert C. Martin', 2008, 0],
    [17, 'The Pragmatic Programmer', 'Your Journey to Mastery. Classic must-read for software developers.', 149000, 'ebook', '/images/pragmatic.jpg', 999, 4.6, 'PDF, EPUB', 'David Thomas & Andrew Hunt', 2019, 0],
    [18, 'Sapiens — Yuval Noah Harari', 'A Brief History of Humankind. Explores how biology and history have defined us.', 99000, 'ebook', '/images/sapiens.jpg', 999, 4.5, 'PDF, EPUB', 'Yuval Noah Harari', 2015, 0]
];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
`;

function createFallbackDb() {
    console.log('Using in-memory fallback database engine');
    const users = [
        { id: 1, username: 'admin', email: 'admin@nexplay.com', password: bcrypt.hashSync('admin123', 10), role: 'admin', created_at: new Date().toISOString() },
        { id: 2, username: 'user1', email: 'user1@nexplay.com', password: bcrypt.hashSync('user123', 10), role: 'user', created_at: new Date().toISOString() },
        { id: 3, username: 'gamer99', email: 'gamer99@nexplay.com', password: bcrypt.hashSync('user123', 10), role: 'user', created_at: new Date().toISOString() }
    ];

    const prodCols = ['id', 'name', 'description', 'price', 'category', 'image_url', 'stock', 'rating', 'platform', 'developer', 'release_year', 'featured'];
    const products = DEFAULT_PRODUCTS.map(p => {
        const obj = {};
        prodCols.forEach((col, idx) => { obj[col] = p[idx]; });
        return obj;
    });

    const cartItems = [];
    const orders = [];
    const orderItems = [];

    return {
        exec(sql, params = []) {
            sql = (sql || '').trim();

            if (sql.includes('COUNT(*) as count FROM users') || sql.includes('count FROM users')) {
                return [{ columns: ['count'], values: [[users.length]] }];
            }

            if (sql.includes('SELECT') && sql.includes('FROM products')) {
                let list = [...products];
                if (params && params.length) {
                    if (sql.includes('WHERE id = ?')) {
                        list = list.filter(p => p.id == params[0]);
                    } else if (sql.includes('category = ?')) {
                        list = list.filter(p => p.category === params[0]);
                    }
                }
                const values = list.map(p => prodCols.map(c => p[c]));
                return [{ columns: prodCols, values }];
            }

            if (sql.includes('SELECT') && sql.includes('FROM users')) {
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
                const cols = ['id', 'username', 'email', 'password', 'role', 'created_at'];
                const values = u.map(x => cols.map(c => x[c]));
                return [{ columns: cols, values }];
            }

            if (sql.includes('FROM cart_items')) {
                const cols = ['id', 'quantity', 'product_id', 'name', 'price', 'image_url', 'category'];
                const values = cartItems.map(c => {
                    const p = products.find(x => x.id == c.product_id) || {};
                    return [c.id, c.quantity, c.product_id, p.name || '', p.price || 0, p.image_url || '', p.category || ''];
                });
                return [{ columns: cols, values }];
            }

            if (sql.includes('FROM orders')) {
                const cols = ['id', 'user_id', 'total_amount', 'payment_method', 'payment_status', 'order_code', 'created_at'];
                const values = orders.map(o => cols.map(c => o[c]));
                return [{ columns: cols, values }];
            }

            return [{ columns: ['id'], values: [] }];
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
            } else if (sql.startsWith('INSERT INTO cart_items')) {
                cartItems.push({ id: cartItems.length + 1, user_id: params[0] || 1, product_id: params[1], quantity: params[2] || 1 });
            } else if (sql.startsWith('DELETE FROM cart_items')) {
                cartItems.length = 0;
            } else if (sql.startsWith('INSERT INTO orders')) {
                orders.push({ id: orders.length + 1, user_id: params[0], total_amount: params[1], payment_method: params[2], payment_status: params[3], order_code: params[4], created_at: new Date().toISOString() });
            }
        },

        export() {
            return new Uint8Array();
        }
    };
}

async function initDatabase() {
    if (db) return db;

    if (IS_VERCEL) {
        console.log('⚡ Running on Vercel: using instant memory DB');
        db = createFallbackDb();
        return db;
    }

    try {
        let SQL;
        const possibleWasm = [
            path.join(__dirname, 'sql-wasm.wasm'),
            path.join(__dirname, '..', 'sql-wasm.wasm'),
            path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
        ];

        const existingWasm = possibleWasm.find(p => fs.existsSync(p));

        if (existingWasm) {
            SQL = await initSqlJs({ locateFile: () => existingWasm });
        } else {
            SQL = await initSqlJs();
        }

        if (IS_VERCEL && !fs.existsSync(TMP_DB_PATH) && fs.existsSync(ROOT_DB_PATH)) {
            try {
                fs.copyFileSync(ROOT_DB_PATH, TMP_DB_PATH);
            } catch (e) { /* ignore */ }
        }

        if (fs.existsSync(DB_PATH)) {
            try {
                const buffer = fs.readFileSync(DB_PATH);
                db = new SQL.Database(buffer);
            } catch (e) {
                db = new SQL.Database();
            }
        } else if (fs.existsSync(ROOT_DB_PATH)) {
            try {
                const buffer = fs.readFileSync(ROOT_DB_PATH);
                db = new SQL.Database(buffer);
            } catch (e) {
                db = new SQL.Database();
            }
        } else {
            db = new SQL.Database();
        }

        db.run(SCHEMA_SQL);

        const result = db.exec('SELECT COUNT(*) as count FROM users');
        const userCount = result[0] ? result[0].values[0][0] : 0;

        if (userCount === 0) {
            seedUsers();
            seedProducts();
            saveDatabase();
        }

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

    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['admin', 'admin@nexplay.com', adminHash, 'admin']);
    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['user1', 'user1@nexplay.com', userHash, 'user']);
    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`,
        ['gamer99', 'gamer99@nexplay.com', userHash, 'user']);
}

function seedProducts() {
    for (const p of DEFAULT_PRODUCTS) {
        db.run(`INSERT INTO products (id, name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p);
    }
}

module.exports = { initDatabase, getDb, saveDatabase, DB_PATH };
