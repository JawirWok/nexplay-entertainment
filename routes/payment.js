const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

// GET /api/payment/methods - Available payment methods
router.get('/methods', (req, res) => {
    const methods = [
        {
            id: 'gopay',
            name: 'GoPay',
            type: 'e-wallet',
            icon: '💚',
            description: 'Bayar dengan saldo GoPay'
        },
        {
            id: 'ovo',
            name: 'OVO',
            type: 'e-wallet',
            icon: '💜',
            description: 'Bayar dengan saldo OVO'
        },
        {
            id: 'dana',
            name: 'DANA',
            type: 'e-wallet',
            icon: '💙',
            description: 'Bayar dengan saldo DANA'
        },
        {
            id: 'shopeepay',
            name: 'ShopeePay',
            type: 'e-wallet',
            icon: '🧡',
            description: 'Bayar dengan ShopeePay'
        },
        {
            id: 'bca_va',
            name: 'BCA Virtual Account',
            type: 'bank_transfer',
            icon: '🏦',
            description: 'Transfer via BCA Virtual Account'
        },
        {
            id: 'bni_va',
            name: 'BNI Virtual Account',
            type: 'bank_transfer',
            icon: '🏦',
            description: 'Transfer via BNI Virtual Account'
        },
        {
            id: 'mandiri_va',
            name: 'Mandiri Virtual Account',
            type: 'bank_transfer',
            icon: '🏦',
            description: 'Transfer via Mandiri Virtual Account'
        },
        {
            id: 'bri_va',
            name: 'BRI Virtual Account',
            type: 'bank_transfer',
            icon: '🏦',
            description: 'Transfer via BRI Virtual Account'
        },
        {
            id: 'credit_card',
            name: 'Credit Card',
            type: 'card',
            icon: '💳',
            description: 'Visa, Mastercard, JCB'
        },
        {
            id: 'qris',
            name: 'QRIS',
            type: 'qris',
            icon: '📱',
            description: 'Scan QR untuk bayar dari e-wallet manapun'
        }
    ];

    res.json({ methods });
});

// POST /api/payment/process - Demo payment processing
router.post('/process', isAuthenticated, (req, res) => {
    try {
        const { order_id, payment_method } = req.body;
        const db = getDb();

        if (!order_id || !payment_method) {
            return res.status(400).json({ error: 'Order ID and payment method are required.' });
        }

        // Verify order exists and belongs to user
        const orderResult = db.exec('SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [order_id, req.session.userId]);

        if (orderResult.length === 0 || orderResult[0].values.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Update order with payment method and set to processing
        db.run('UPDATE orders SET payment_method = ?, payment_status = ? WHERE id = ?',
            [payment_method, 'processing', order_id]);
        saveDatabase();

        // Simulate payment gateway response
        // In a real app, this would redirect to payment provider
        const paymentResponse = {
            order_id: order_id,
            payment_method: payment_method,
            status: 'processing',
            transaction_id: 'TXN-' + Date.now().toString(36).toUpperCase(),
            message: 'Payment is being processed. Please complete payment.',
            // Demo: generate virtual account number or QR
            payment_details: generatePaymentDetails(payment_method)
        };

        res.json(paymentResponse);
    } catch (err) {
        console.error('Payment process error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/payment/confirm - Demo payment confirmation
router.post('/confirm', isAuthenticated, (req, res) => {
    try {
        const { order_id } = req.body;
        const db = getDb();

        // Verify order
        const orderResult = db.exec('SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [order_id, req.session.userId]);

        if (orderResult.length === 0 || orderResult[0].values.length === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Demo: simulate successful payment
        db.run('UPDATE orders SET payment_status = ? WHERE id = ?', ['success', order_id]);
        saveDatabase();

        res.json({
            message: 'Payment confirmed successfully! 🎉',
            order_id: order_id,
            status: 'success'
        });
    } catch (err) {
        console.error('Payment confirm error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

function generatePaymentDetails(method) {
    if (method.includes('va') || method.includes('bca') || method.includes('bni') || method.includes('mandiri') || method.includes('bri')) {
        return {
            type: 'virtual_account',
            va_number: Math.floor(Math.random() * 9000000000000 + 1000000000000).toString(),
            bank: method.replace('_va', '').toUpperCase(),
            expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
    } else if (method === 'qris') {
        return {
            type: 'qris',
            qr_data: 'DEMO-QRIS-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
            expiry: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        };
    } else if (method === 'credit_card') {
        return {
            type: 'credit_card',
            message: 'Demo mode: Click "Confirm Payment" to simulate successful card payment'
        };
    } else {
        return {
            type: 'e-wallet',
            deeplink: '#demo-' + method,
            message: 'Demo mode: Click "Confirm Payment" to simulate ' + method + ' payment'
        };
    }
}

module.exports = router;
