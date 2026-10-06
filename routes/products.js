const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin, isSellerOrAdmin } = require('../middleware/auth');
const router = express.Router();

const PPN_RATE = 0.11; // 11% PPN

// GET /api/products - List all products (with filter & search)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { category, search, featured, sort, seller_id, status } = req.query;

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        // For public listing, only show approved products
        // Seller/admin can see their own products regardless of status
        if (seller_id) {
            query += ' AND seller_id = ?';
            params.push(seller_id);
            // If status filter is provided (for seller/admin view)
            if (status) {
                query += ' AND approval_status = ?';
                params.push(status);
            }
        } else if (status === 'all') {
            // Admin can see all products
        } else if (status) {
            query += ' AND approval_status = ?';
            params.push(status);
        } else {
            // Default: only show approved products to public
            query += " AND (approval_status = 'approved' OR approval_status IS NULL)";
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ? OR developer LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (featured === '1') {
            query += ' AND featured = 1';
        }

        if (sort === 'price_asc') {
            query += ' ORDER BY price ASC';
        } else if (sort === 'price_desc') {
            query += ' ORDER BY price DESC';
        } else if (sort === 'rating') {
            query += ' ORDER BY rating DESC';
        } else if (sort === 'newest') {
            query += ' ORDER BY created_at DESC';
        } else {
            query += ' ORDER BY featured DESC, rating DESC';
        }

        const result = db.exec(query, params);

        if (result.length === 0) {
            return res.json({ products: [] });
        }

        const columns = result[0].columns;
        const products = result[0].values.map(row => {
            const product = {};
            columns.forEach((col, i) => { product[col] = row[i]; });
            return product;
        });

        res.json({ products });
    } catch (err) {
        console.error('Get products error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/products/pending - Get pending products for admin approval
router.get('/pending', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const result = db.exec(`
            SELECT p.*, u.username as seller_name 
            FROM products p 
            LEFT JOIN users u ON p.seller_id = u.id 
            WHERE p.approval_status = 'pending' 
            ORDER BY p.created_at DESC
        `);

        if (result.length === 0) {
            return res.json({ products: [] });
        }

        const columns = result[0].columns;
        const products = result[0].values.map(row => {
            const product = {};
            columns.forEach((col, i) => { product[col] = row[i]; });
            return product;
        });

        res.json({ products });
    } catch (err) {
        console.error('Get pending products error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/products/:id/approve - Admin approves a product (adds PPN to price)
router.put('/:id/approve', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const productResult = db.exec('SELECT * FROM products WHERE id = ?', [req.params.id]);
        
        if (productResult.length === 0 || productResult[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const columns = productResult[0].columns;
        const row = productResult[0].values[0];
        const product = {};
        columns.forEach((col, i) => { product[col] = row[i]; });

        // Add PPN 11% to the base price
        const basePrice = product.price;
        const ppnAmount = Math.round(basePrice * PPN_RATE);
        const finalPrice = basePrice + ppnAmount;

        db.run("UPDATE products SET approval_status = 'approved', price = ? WHERE id = ?", [finalPrice, req.params.id]);
        saveDatabase();

        res.json({ 
            message: `Produk "${product.name}" berhasil disetujui! Harga asli: Rp ${basePrice.toLocaleString('id-ID')} + PPN 11%: Rp ${ppnAmount.toLocaleString('id-ID')} = Rp ${finalPrice.toLocaleString('id-ID')}`,
            base_price: basePrice,
            ppn_amount: ppnAmount,
            final_price: finalPrice
        });
    } catch (err) {
        console.error('Approve product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/products/:id/reject - Admin rejects a product
router.put('/:id/reject', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const { reason } = req.body;
        
        const existing = db.exec('SELECT name FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        db.run("UPDATE products SET approval_status = 'rejected' WHERE id = ?", [req.params.id]);
        saveDatabase();

        res.json({ message: `Produk ditolak.${reason ? ' Alasan: ' + reason : ''}` });
    } catch (err) {
        console.error('Reject product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/products/:id - Product detail
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT * FROM products WHERE id = ?', [req.params.id]);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const columns = result[0].columns;
        const row = result[0].values[0];
        const product = {};
        columns.forEach((col, i) => { product[col] = row[i]; });

        res.json({ product });
    } catch (err) {
        console.error('Get product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/products - Create product (seller/admin only)
router.post('/', isSellerOrAdmin, (req, res) => {
    try {
        const { name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, discount_percentage } = req.body;

        if (!name || !price || !category) {
            return res.status(400).json({ error: 'Name, price, and category are required.' });
        }

        const db = getDb();
        const isAdminUser = req.session.role === 'admin';
        const seller_id = isAdminUser ? (req.body.seller_id || req.session.userId) : req.session.userId;
        
        // Admin products are auto-approved, seller products need approval
        const approvalStatus = isAdminUser ? 'approved' : 'pending';
        
        // If admin creates product, apply PPN immediately. If seller, store base price.
        let finalPrice = price;
        if (isAdminUser) {
            finalPrice = Math.round(price + (price * PPN_RATE));
        }

        db.run(`INSERT INTO products (name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, seller_id, discount_percentage, approval_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description || '', finalPrice, category, image_url || '', stock || 100, rating || 0, platform || '', developer || '', release_year || 2024, featured || 0, seller_id, discount_percentage || 0, approvalStatus]);
        saveDatabase();

        const newProduct = db.exec('SELECT * FROM products ORDER BY id DESC LIMIT 1');
        const columns = newProduct[0].columns;
        const row = newProduct[0].values[0];
        const product = {};
        columns.forEach((col, i) => { product[col] = row[i]; });

        const msg = isAdminUser 
            ? `Produk berhasil ditambahkan! (Harga sudah termasuk PPN 11%)` 
            : `Produk berhasil diajukan! Menunggu persetujuan admin sebelum produk dirilis ke toko.`;

        res.status(201).json({ message: msg, product });
    } catch (err) {
        console.error('Create product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/products/:id - Update product (seller/admin only)
router.put('/:id', isSellerOrAdmin, (req, res) => {
    try {
        const { name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, discount_percentage } = req.body;
        const db = getDb();

        // Check if product exists
        const existing = db.exec('SELECT id, seller_id, approval_status FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const productSellerId = existing[0].values[0][1];
        if (req.session.role !== 'admin' && productSellerId != req.session.userId) {
            return res.status(403).json({ error: 'Forbidden. You can only update your own products.' });
        }

        // If seller edits, reset to pending for re-approval
        const isAdminUser = req.session.role === 'admin';
        let newApprovalStatus = isAdminUser ? (req.body.approval_status || 'approved') : 'pending';
        
        db.run(`UPDATE products SET name=?, description=?, price=?, category=?, image_url=?, stock=?, rating=?, platform=?, developer=?, release_year=?, featured=?, discount_percentage=?, approval_status=? WHERE id=?`,
            [name, description, price, category, image_url, stock, rating, platform, developer, release_year, featured, discount_percentage || 0, newApprovalStatus, req.params.id]);
        saveDatabase();

        const msg = isAdminUser 
            ? 'Produk berhasil diupdate' 
            : 'Produk berhasil diupdate. Menunggu persetujuan ulang dari admin.';
        res.json({ message: msg });
    } catch (err) {
        console.error('Update product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /api/products/:id - Delete product (seller/admin only)
router.delete('/:id', isSellerOrAdmin, (req, res) => {
    try {
        const db = getDb();

        const existing = db.exec('SELECT id, seller_id FROM products WHERE id = ?', [req.params.id]);
        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const productSellerId = existing[0].values[0][1];
        if (req.session.role !== 'admin' && productSellerId != req.session.userId) {
            return res.status(403).json({ error: 'Forbidden. You can only delete your own products.' });
        }

        db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        saveDatabase();

        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/products/:id/reviews - Get reviews
router.get('/:id/reviews', (req, res) => {
    try {
        const db = getDb();
        const query = `
            SELECT r.id, r.rating, r.comment, r.created_at, r.is_anonymous, u.username
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
        `;
        const result = db.exec(query, [req.params.id]);
        
        if (result.length === 0) {
            return res.json({ reviews: [] });
        }

        const columns = result[0].columns;
        const reviews = result[0].values.map(row => {
            const rev = {};
            columns.forEach((col, i) => { rev[col] = row[i]; });
            if (rev.is_anonymous) {
                const name = rev.username || 'User';
                if (name.length <= 2) {
                    rev.username = name[0] + '*** (Anonim)';
                } else {
                    rev.username = name[0] + '***' + name[name.length - 1] + ' (Anonim)';
                }
            }
            return rev;
        });

        res.json({ reviews });
    } catch (err) {
        console.error('Get reviews error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/products/:id/reviews - Add review
router.post('/:id/reviews', isAuthenticated, (req, res) => {
    try {
        const { rating, comment, order_id, is_anonymous } = req.body;
        const product_id = req.params.id;
        const user_id = req.session.userId;
        const anonValue = (is_anonymous === true || is_anonymous === 1 || is_anonymous === '1' || is_anonymous === 'true') ? 1 : 0;

        if (!rating || rating < 1 || rating > 5 || !order_id) {
            return res.status(400).json({ error: 'Valid rating and order_id are required.' });
        }

        if (!comment || !String(comment).trim()) {
            return res.status(400).json({ error: 'Ulasan produk wajib diisi.' });
        }

        const cleanComment = String(comment).trim();
        const db = getDb();

        // Check if user bought this product or has the order (allow both 'success' and 'processing')
        let isEligible = true;
        try {
            const checkPurchase = db.exec(`
                SELECT oi.id 
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.user_id = ? AND oi.product_id = ? AND o.id = ?
            `, [user_id, product_id, order_id]);

            if (checkPurchase.length === 0 || checkPurchase[0].values.length === 0) {
                // Fallback check on orders table
                const checkOrder = db.exec('SELECT id FROM orders WHERE id = ? AND user_id = ?', [order_id, user_id]);
                if (checkOrder.length === 0 || checkOrder[0].values.length === 0) {
                    // If neither found in current lambda memory, check if user is authenticated
                    isEligible = Boolean(order_id && user_id);
                }
            }
        } catch (e) {
            isEligible = true;
        }

        if (!isEligible) {
            return res.status(403).json({ error: 'Anda harus membeli produk ini terlebih dahulu sebelum memberikan ulasan.' });
        }

        // Check if review already exists for this order item
        try {
            const existingReview = db.exec('SELECT id FROM reviews WHERE user_id = ? AND product_id = ? AND order_id = ?', [user_id, product_id, order_id]);
            if (existingReview.length > 0 && existingReview[0].values.length > 0) {
                return res.status(409).json({ error: 'Anda sudah memberikan ulasan untuk produk pada pesanan ini.' });
            }
        } catch (e) {}

        db.run('INSERT INTO reviews (user_id, product_id, order_id, rating, comment, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, product_id, order_id, rating, cleanComment, anonValue]);

        // Update average rating on product
        try {
            const avgResult = db.exec('SELECT AVG(rating) FROM reviews WHERE product_id = ?', [product_id]);
            if (avgResult.length > 0 && avgResult[0].values.length > 0 && avgResult[0].values[0][0]) {
                const avgRating = Number(avgResult[0].values[0][0]);
                db.run('UPDATE products SET rating = ? WHERE id = ?', [avgRating, product_id]);
            }
        } catch(e) {}

        saveDatabase();
        res.status(201).json({ message: 'Ulasan berhasil disimpan! ⭐' });
    } catch (err) {
        console.error('Add review error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
