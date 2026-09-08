const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const IS_VERCEL = !!process.env.VERCEL;
const ROOT_DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const TMP_DB_PATH = path.join('/tmp', 'database.sqlite');
const DB_PATH = IS_VERCEL ? TMP_DB_PATH : ROOT_DB_PATH;

let db = null;

async function initDatabase() {
    if (db) return db;
    const SQL = await initSqlJs();

    // On Vercel, copy database to /tmp if not yet present
    if (IS_VERCEL && !fs.existsSync(TMP_DB_PATH) && fs.existsSync(ROOT_DB_PATH)) {
        try {
            fs.copyFileSync(ROOT_DB_PATH, TMP_DB_PATH);
        } catch (e) {
            console.warn('Notice: Could not copy initial DB to /tmp:', e.message);
        }
    }

    // Load existing DB or create new one
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

    // Read and execute schema
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        db.run(schema);
    } catch (e) {
        console.warn('Schema execution note:', e.message);
    }

    // Seed data if tables are empty
    try {
        const result = db.exec('SELECT COUNT(*) as count FROM users');
        const userCount = result[0] ? result[0].values[0][0] : 0;

        if (userCount === 0) {
            seedUsers();
            seedProducts();
            saveDatabase();
            console.log('✅ Database seeded with demo data');
        }
    } catch (e) {
        console.error('Seeding check error:', e);
    }

    return db;
}

function getDb() {
    return db;
}

function saveDatabase() {
    if (db) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_PATH, buffer);
        } catch (e) {
            // In serverless, catch any read-only disk errors safely
            console.warn('Notice: Disk save skipped in serverless environment:', e.message);
        }
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

    console.log('   → Users seeded');
}

function seedProducts() {
    const products = [
        // Games
        ['Cyberpunk 2077: Ultimate Edition', 'Open-world action RPG set in Night City, a megalopolis obsessed with power, glamour and body modification. Includes Phantom Liberty expansion.', 299000, 'game', '/images/cyberpunk.jpg', 50, 4.5, 'PC, PS5, Xbox', 'CD Projekt Red', 2023, 1],
        ['The Witcher 3: Wild Hunt GOTY', 'Award-winning open world RPG. As war rages across the Northern Realms, play as Geralt of Rivia and hunt down the Child of Prophecy.', 199000, 'game', '/images/witcher3.jpg', 100, 4.9, 'PC, PS5, Xbox, Switch', 'CD Projekt Red', 2015, 1],
        ['Elden Ring: Shadow of the Erdtree', 'An action RPG developed by FromSoftware. The game features a vast world full of danger and discovery.', 459000, 'game', '/images/eldenring.jpg', 30, 4.8, 'PC, PS5, Xbox', 'FromSoftware', 2024, 1],
        ['Red Dead Redemption 2', 'Epic tale of outlaw Arthur Morgan and the Van der Linde gang. Also provides the foundation for Red Dead Online.', 249000, 'game', '/images/rdr2.jpg', 60, 4.7, 'PC, PS4, Xbox', 'Rockstar Games', 2019, 0],
        ['God of War: Ragnarök', 'Embark on an epic and heartfelt journey as Kratos and Atreus struggle with holding on and letting go.', 399000, 'game', '/images/godofwar.jpg', 45, 4.6, 'PC, PS5', 'Santa Monica Studio', 2024, 0],
        ['Minecraft Java & Bedrock Edition', 'Create, explore, and survive in a blocky, procedurally generated 3D world.', 149000, 'game', '/images/minecraft.jpg', 200, 4.8, 'PC, Mobile, Console', 'Mojang Studios', 2011, 0],
        // Films
        ['Avengers: Endgame (4K Digital)', 'The epic conclusion to the Infinity Saga. The remaining Avengers find a way to bring back their vanquished allies.', 49000, 'film', '/images/endgame.jpg', 999, 4.7, 'Digital Download', 'Marvel Studios', 2019, 1],
        ['Interstellar (4K Digital)', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.', 39000, 'film', '/images/interstellar.jpg', 999, 4.9, 'Digital Download', 'Warner Bros', 2014, 0],
        ['Spider-Man: Across the Spider-Verse (4K)', 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People.', 59000, 'film', '/images/spiderverse.jpg', 999, 4.8, 'Digital Download', 'Sony Pictures', 2023, 1],
        ['Dune: Part Two (4K Digital)', 'Paul Atreides unites with Chani and the Fremen while seeking revenge against those who destroyed his family.', 69000, 'film', '/images/dune2.jpg', 999, 4.6, 'Digital Download', 'Warner Bros', 2024, 0],
        // Music
        ['Spotify Premium — 1 Bulan', 'Akses unlimited ke jutaan lagu tanpa iklan. Download musik untuk offline listening.', 54990, 'music', '/images/spotify.jpg', 999, 4.6, 'All Devices', 'Spotify AB', 2024, 1],
        ['Apple Music — 1 Bulan', 'Stream over 100 million songs ad-free. Spatial Audio with Dolby Atmos.', 49000, 'music', '/images/applemusic.svg', 999, 4.5, 'All Devices', 'Apple Inc.', 2024, 0],
        ['YouTube Music Premium — 1 Bulan', 'Music streaming tanpa iklan, background play, download offline.', 49000, 'music', '/images/ytmusic.svg', 999, 4.3, 'All Devices', 'Google LLC', 2024, 0],
        ['TIDAL HiFi Plus — 1 Bulan', 'Highest quality audio streaming. Master quality, Dolby Atmos, Sony 360 Reality Audio.', 79000, 'music', '/images/tidal.svg', 999, 4.4, 'All Devices', 'TIDAL', 2024, 0],
        // eBooks
        ['Atomic Habits — James Clear', 'An Easy & Proven Way to Build Good Habits & Break Bad Ones. #1 NYT bestseller.', 89000, 'ebook', '/images/atomichabits.jpg', 999, 4.8, 'PDF, EPUB', 'James Clear', 2018, 1],
        ['Clean Code — Robert C. Martin', 'A Handbook of Agile Software Craftsmanship. Write code that is clean, elegant, and efficient.', 129000, 'ebook', '/images/cleancode.jpg', 999, 4.7, 'PDF, EPUB', 'Robert C. Martin', 2008, 0],
        ['The Pragmatic Programmer', 'Your Journey to Mastery. Classic must-read for software developers.', 149000, 'ebook', '/images/pragmatic.jpg', 999, 4.6, 'PDF, EPUB', 'David Thomas & Andrew Hunt', 2019, 0],
        ['Sapiens — Yuval Noah Harari', 'A Brief History of Humankind. Explores how biology and history have defined us.', 99000, 'ebook', '/images/sapiens.jpg', 999, 4.5, 'PDF, EPUB', 'Yuval Noah Harari', 2015, 0]
    ];

    for (const p of products) {
        db.run(`INSERT INTO products (name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p);
    }

    console.log('   → Products seeded (' + products.length + ' items)');
}

module.exports = { initDatabase, getDb, saveDatabase, DB_PATH };
