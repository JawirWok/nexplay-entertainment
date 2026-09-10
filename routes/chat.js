const express = require('express');
const { getDb, saveDatabase } = require('../database/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Helper to get Admin ID (default 1)
function getAdminId(db) {
    try {
        const res = db.exec("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (res.length > 0 && res[0].values.length > 0) {
            return res[0].values[0][0];
        }
    } catch (e) {}
    return 1;
}

// GET /api/chat/unread-count - Get total unread messages count for current user
router.get('/unread-count', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const userId = req.session.userId;
        const result = db.exec('SELECT COUNT(*) FROM chat_messages WHERE receiver_id = ? AND is_read = 0', [userId]);
        const unread_count = result[0] ? result[0].values[0][0] : 0;
        res.json({ unread_count });
    } catch (err) {
        console.error('Get unread count error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/chat/conversations - List active conversations (Admin only)
router.get('/conversations', isAdmin, (req, res) => {
    try {
        const db = getDb();
        const adminId = req.session.userId || 1;

        // Fetch all users except current admin as potential contacts
        const allUsersRes = db.exec("SELECT id, username, email, role FROM users WHERE id != ? ORDER BY role DESC, username ASC", [adminId]);
        let all_contacts = [];
        if (allUsersRes.length > 0 && allUsersRes[0].values.length > 0) {
            const cols = allUsersRes[0].columns;
            all_contacts = allUsersRes[0].values.map(row => {
                const u = {};
                cols.forEach((col, i) => { u[col] = row[i]; });
                return u;
            });
        }

        const partnersQuery = `
            SELECT pid FROM (
                SELECT DISTINCT sender_id AS pid FROM chat_messages WHERE sender_id NOT IN (SELECT id FROM users WHERE role = 'admin')
                UNION
                SELECT DISTINCT receiver_id AS pid FROM chat_messages WHERE receiver_id NOT IN (SELECT id FROM users WHERE role = 'admin')
            ) WHERE pid IS NOT NULL
        `;
        const partnersRes = db.exec(partnersQuery);

        if (partnersRes.length === 0 || partnersRes[0].values.length === 0) {
            return res.json({ conversations: [], all_contacts });
        }

        const partnerIds = [...new Set(partnersRes[0].values.map(r => r[0]))].filter(id => id && id != adminId);
        const conversations = [];

        for (const pid of partnerIds) {
            // Get partner user info
            const userRes = db.exec('SELECT id, username, email, role FROM users WHERE id = ?', [pid]);
            if (userRes.length === 0 || userRes[0].values.length === 0) continue;

            const uCols = userRes[0].columns;
            const uRow = userRes[0].values[0];
            const partner = {};
            uCols.forEach((col, i) => { partner[col] = uRow[i]; });

            // Get last message
            const lastMsgRes = db.exec(`
                SELECT message, created_at, sender_id
                FROM chat_messages
                WHERE (sender_id = ? AND (receiver_id = ? OR receiver_id IN (SELECT id FROM users WHERE role = 'admin')))
                   OR ((sender_id = ? OR sender_id IN (SELECT id FROM users WHERE role = 'admin')) AND receiver_id = ?)
                ORDER BY id DESC LIMIT 1
            `, [pid, adminId, adminId, pid]);

            let last_message = '';
            let last_message_time = '';
            let last_sender_id = null;
            if (lastMsgRes.length > 0 && lastMsgRes[0].values.length > 0) {
                last_message = lastMsgRes[0].values[0][0];
                last_message_time = lastMsgRes[0].values[0][1];
                last_sender_id = lastMsgRes[0].values[0][2];
            }

            // Get unread count from this partner
            const unreadRes = db.exec(`
                SELECT COUNT(*) FROM chat_messages
                WHERE sender_id = ? AND (receiver_id = ? OR receiver_id IN (SELECT id FROM users WHERE role = 'admin')) AND is_read = 0
            `, [pid, adminId]);
            const unread_count = unreadRes[0] ? unreadRes[0].values[0][0] : 0;

            conversations.push({
                id: partner.id,
                partner_id: partner.id,
                username: partner.username,
                email: partner.email,
                role: partner.role,
                last_message,
                last_message_at: last_message_time,
                last_message_time,
                last_sender_id,
                unread_count
            });
        }

        // Sort by last message time descending
        conversations.sort((a, b) => {
            const timeA = a.last_message_time ? new Date(a.last_message_time.replace(' ', 'T') + 'Z').getTime() : 0;
            const timeB = b.last_message_time ? new Date(b.last_message_time.replace(' ', 'T') + 'Z').getTime() : 0;
            return timeB - timeA;
        });

        res.json({ conversations, all_contacts });
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/chat/messages - Get chat messages with a partner (or admin)
router.get('/messages', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const currentUserId = req.session.userId;
        const isAdminUser = req.session.role === 'admin';
        const adminId = getAdminId(db);

        let partnerId;
        if (isAdminUser) {
            partnerId = parseInt(req.query.partner_id || req.query.user_id, 10);
            if (!partnerId) {
                return res.json({ messages: [], partner: null });
            }
        } else {
            partnerId = parseInt(req.query.partner_id || req.query.user_id, 10) || adminId;
        }

        // Get partner info
        const pRes = db.exec('SELECT id, username, email, role FROM users WHERE id = ?', [partnerId]);
        let partner = null;
        if (pRes.length > 0 && pRes[0].values.length > 0) {
            const pCols = pRes[0].columns;
            partner = {};
            pCols.forEach((col, i) => { partner[col] = pRes[0].values[0][i]; });
        }

        // Get messages between current user and partner
        const query = `
            SELECT cm.id, cm.sender_id, cm.receiver_id, cm.message, cm.is_read, cm.created_at,
                   u.username as sender_username, u.role as sender_role
            FROM chat_messages cm
            LEFT JOIN users u ON cm.sender_id = u.id
            WHERE (cm.sender_id = ? AND (cm.receiver_id = ? OR cm.receiver_id IN (SELECT id FROM users WHERE role = 'admin')))
               OR ((cm.sender_id = ? OR cm.sender_id IN (SELECT id FROM users WHERE role = 'admin')) AND cm.receiver_id = ?)
            ORDER BY cm.created_at ASC, cm.id ASC
        `;
        const queryParams = isAdminUser ? [partnerId, adminId, adminId, partnerId] : [currentUserId, partnerId, partnerId, currentUserId];

        const result = db.exec(query, queryParams);

        let messages = [];
        if (result.length > 0 && result[0].values.length > 0) {
            const cols = result[0].columns;
            messages = result[0].values.map(row => {
                const msg = {};
                cols.forEach((col, i) => { msg[col] = row[i]; });
                msg.is_mine = (msg.sender_id === currentUserId) ? 1 : 0;
                return msg;
            });
        }

        // Mark unread messages sent by partner as read
        if (isAdminUser) {
            db.run('UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND is_read = 0', [partnerId]);
        } else {
            db.run('UPDATE chat_messages SET is_read = 1 WHERE sender_id IN (SELECT id FROM users WHERE role = "admin") AND receiver_id = ? AND is_read = 0', [currentUserId]);
        }
        saveDatabase();

        res.json({ messages, partner });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/chat/messages - Send a new message
router.post('/messages', isAuthenticated, (req, res) => {
    try {
        const { message, receiver_id } = req.body;
        const currentUserId = req.session.userId;
        const isAdminUser = req.session.role === 'admin';

        if (!message || !String(message).trim()) {
            return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
        }

        const db = getDb();
        const adminId = getAdminId(db);

        let targetReceiverId;
        if (isAdminUser) {
            targetReceiverId = parseInt(receiver_id, 10);
            if (!targetReceiverId) {
                return res.status(400).json({ error: 'Penerima pesan (receiver_id) wajib ditentukan untuk admin.' });
            }
        } else {
            targetReceiverId = receiver_id ? parseInt(receiver_id, 10) : adminId;
        }

        const cleanMessage = String(message).trim();

        db.run('INSERT INTO chat_messages (sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, 0)',
            [currentUserId, targetReceiverId, cleanMessage]);
        saveDatabase();

        // Get newly created message
        const newMsgRes = db.exec(`
            SELECT cm.id, cm.sender_id, cm.receiver_id, cm.message, cm.is_read, cm.created_at,
                   u.username as sender_username, u.role as sender_role
            FROM chat_messages cm
            LEFT JOIN users u ON cm.sender_id = u.id
            ORDER BY cm.id DESC LIMIT 1
        `);

        let newMessage = {
            sender_id: currentUserId,
            receiver_id: targetReceiverId,
            message: cleanMessage,
            is_read: 0,
            created_at: new Date().toISOString()
        };

        if (newMsgRes.length > 0 && newMsgRes[0].values.length > 0) {
            const cols = newMsgRes[0].columns;
            newMessage = {};
            cols.forEach((col, i) => { newMessage[col] = newMsgRes[0].values[0][i]; });
        }

        res.status(201).json({ 
            message: 'Pesan berhasil dikirim', 
            chat: newMessage,
            chat_message: newMessage 
        });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PUT /api/chat/read - Mark messages as read
router.put('/read', isAuthenticated, (req, res) => {
    try {
        const partner_id = req.body.partner_id || req.body.sender_id || req.body.user_id;
        const currentUserId = req.session.userId;
        const db = getDb();
        const adminId = getAdminId(db);
        const targetPartnerId = partner_id ? parseInt(partner_id, 10) : adminId;

        db.run('UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
            [targetPartnerId, currentUserId]);
        saveDatabase();

        res.json({ message: 'Pesan ditandai telah dibaca' });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
