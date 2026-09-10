const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/vouchers - List all vouchers (admin only)
router.get('/', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const result = db.exec('SELECT * FROM vouchers ORDER BY created_at DESC');

        if (result.length === 0) {
            return res.json({ vouchers: [] });
        }

        const columns = result[0].columns;
        const vouchers = result[0].values.map(row => {
            const v = {};
            columns.forEach((col, i) => { v[col] = row[i]; });
            return v;
        });

        res.json({ vouchers });
    } catch (err) {
        console.error('Get vouchers error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/vouchers - Create new voucher (admin only)
router.post('/', isAdmin, (req, res) => {
    try {
        let { code, discount_type, discount_value, min_purchase, usage_limit, valid_until } = req.body;

        if (!code || !discount_value) {
            return res.status(400).json({ error: 'Kode voucher dan nilai diskon wajib diisi.' });
        }

        code = String(code).trim().toUpperCase();
        discount_type = discount_type === 'fixed' ? 'fixed' : 'percentage';
        discount_value = parseFloat(discount_value) || 0;
        min_purchase = parseFloat(min_purchase) || 0;
        usage_limit = parseInt(usage_limit, 10) || 100;
        valid_until = valid_until ? String(valid_until).trim() : null;

        if (discount_value <= 0) {
            return res.status(400).json({ error: 'Nilai diskon harus lebih dari 0.' });
        }
        if (discount_type === 'percentage' && discount_value > 100) {
            return res.status(400).json({ error: 'Diskon persentase tidak boleh lebih dari 100%.' });
        }

        const db = getDb();

        // Check duplicate code
        const existing = db.exec('SELECT id FROM vouchers WHERE code = ?', [code]);
        if (existing.length > 0 && existing[0].values.length > 0) {
            return res.status(409).json({ error: `Voucher dengan kode "${code}" sudah ada.` });
        }

        db.run(`INSERT INTO vouchers (code, discount_type, discount_value, min_purchase, usage_limit, used_count, valid_until, is_active)
                VALUES (?, ?, ?, ?, ?, 0, ?, 1)`,
            [code, discount_type, discount_value, min_purchase, usage_limit, valid_until]);
        saveDatabase();

        res.status(201).json({ message: 'Voucher berhasil dibuat! 🎉' });
    } catch (err) {
        console.error('Create voucher error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/vouchers/:id/toggle - Toggle voucher active status (admin only)
router.put('/:id/toggle', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const existing = db.exec('SELECT id, is_active FROM vouchers WHERE id = ?', [req.params.id]);

        if (existing.length === 0 || existing[0].values.length === 0) {
            return res.status(404).json({ error: 'Voucher tidak ditemukan.' });
        }

        const currentActive = existing[0].values[0][1];
        const newActive = currentActive ? 0 : 1;

        db.run('UPDATE vouchers SET is_active = ? WHERE id = ?', [newActive, req.params.id]);
        saveDatabase();

        res.json({ message: `Voucher telah ${newActive ? 'diaktifkan' : 'dinonaktifkan'}.`, is_active: newActive });
    } catch (err) {
        console.error('Toggle voucher error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /api/vouchers/:id - Delete voucher (admin only)
router.delete('/:id', isAdmin, (req, res) => {
    try {
        const db = getDb();
        db.run('DELETE FROM vouchers WHERE id = ?', [req.params.id]);
        saveDatabase();

        res.json({ message: 'Voucher berhasil dihapus.' });
    } catch (err) {
        console.error('Delete voucher error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/vouchers/apply - Check and calculate voucher discount (user)
router.post('/apply', isAuthenticated, (req, res) => {
    try {
        let { code, total_amount } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Masukkan kode voucher.' });
        }

        code = String(code).trim().toUpperCase();
        total_amount = parseFloat(total_amount) || 0;

        const db = getDb();
        const result = db.exec('SELECT * FROM vouchers WHERE code = ?', [code]);

        if (result.length === 0 || result[0].values.length === 0) {
            return res.status(404).json({ error: 'Kode voucher tidak valid atau tidak ditemukan.' });
        }

        const columns = result[0].columns;
        const voucher = {};
        columns.forEach((col, i) => { voucher[col] = result[0].values[0][i]; });

        // 1. Check if active
        if (!voucher.is_active) {
            return res.status(400).json({ error: 'Voucher ini sedang tidak aktif.' });
        }

        // 2. Check expiry date
        if (voucher.valid_until) {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const expiry = new Date(voucher.valid_until);
            expiry.setHours(23, 59, 59, 999);
            if (now > expiry) {
                return res.status(400).json({ error: `Voucher telah kedaluwarsa pada ${voucher.valid_until}.` });
            }
        }

        // 3. Check usage limit
        if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
            return res.status(400).json({ error: 'Batas kuota penggunaan voucher ini sudah habis.' });
        }

        // 4. Check minimum purchase
        if (voucher.min_purchase && total_amount < voucher.min_purchase) {
            return res.status(400).json({
                error: `Minimal total belanja untuk voucher ini adalah Rp ${new Intl.NumberFormat('id-ID').format(voucher.min_purchase)}.`
            });
        }

        // Calculate discount
        let discountAmount = 0;
        if (voucher.discount_type === 'percentage') {
            discountAmount = Math.round((total_amount * voucher.discount_value) / 100);
        } else {
            discountAmount = Math.min(voucher.discount_value, total_amount);
        }

        const finalAmount = Math.max(0, total_amount - discountAmount);

        res.json({
            valid: true,
            voucher: {
                id: voucher.id,
                code: voucher.code,
                discount_type: voucher.discount_type,
                discount_value: voucher.discount_value,
                discount_amount: discountAmount,
                final_amount: finalAmount
            },
            message: `Voucher "${voucher.code}" berhasil diterapkan! Hemat Rp ${new Intl.NumberFormat('id-ID').format(discountAmount)}.`
        });
    } catch (err) {
        console.error('Apply voucher error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
