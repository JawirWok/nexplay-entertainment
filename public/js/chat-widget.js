// NexPlay Live Chat Floating Widget for Users & Sellers
(function() {
    let currentUser = null;
    let isOpen = false;
    let pollTimer = null;
    let unreadTimer = null;
    const ADMIN_TARGET_ID = 1; // Admin user ID

    // Inject CSS for chat widget
    const style = document.createElement('style');
    style.textContent = `
        .nex-chat-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 9998;
            background: linear-gradient(135deg, #00d2ff, #7928ca);
            color: #ffffff;
            border: none;
            border-radius: 50px;
            padding: 12px 20px;
            font-size: 0.95rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(0, 210, 255, 0.35);
            transition: all 0.25s ease;
        }
        .nex-chat-btn:hover {
            transform: translateY(-3px) scale(1.03);
            box-shadow: 0 12px 28px rgba(121, 40, 202, 0.45);
        }
        .nex-chat-badge {
            background: #ff4757;
            color: white;
            font-size: 0.72rem;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 12px;
            display: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .nex-chat-window {
            position: fixed;
            bottom: 84px;
            right: 24px;
            width: 380px;
            max-width: calc(100vw - 32px);
            height: 520px;
            max-height: calc(100vh - 120px);
            background: rgba(16, 20, 32, 0.96);
            backdrop-filter: blur(18px);
            border: 1px solid rgba(0, 210, 255, 0.25);
            border-radius: 18px;
            display: none;
            flex-direction: column;
            z-index: 9999;
            box-shadow: 0 22px 48px rgba(0, 0, 0, 0.7);
            overflow: hidden;
            animation: nexChatPop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes nexChatPop {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .nex-chat-header {
            padding: 14px 16px;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .nex-chat-messages {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            background: radial-gradient(circle at bottom left, rgba(121, 40, 202, 0.05), transparent 70%);
        }

        /* Distinct message alignment */
        .nex-row {
            display: flex;
            gap: 8px;
            width: 100%;
            align-items: flex-end;
        }
        .nex-row-out {
            justify-content: flex-end;
        }
        .nex-row-in {
            justify-content: flex-start;
        }
        .nex-avatar-mini {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: rgba(0, 210, 255, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            flex-shrink: 0;
            border: 1px solid rgba(0, 210, 255, 0.3);
            margin-bottom: 2px;
        }

        .nex-bubble-container {
            max-width: 80%;
            display: flex;
            flex-direction: column;
        }
        .nex-bubble {
            padding: 10px 14px;
            border-radius: 14px;
            font-size: 0.88rem;
            line-height: 1.42;
            word-break: break-word;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .nex-row-in .nex-bubble {
            background: rgba(28, 34, 52, 0.95);
            color: #f1f2f6;
            border: 1px solid rgba(0, 210, 255, 0.2);
            border-bottom-left-radius: 3px;
        }
        .nex-row-out .nex-bubble {
            background: linear-gradient(135deg, #00b4d8, #0077b6);
            color: #ffffff;
            border-bottom-right-radius: 3px;
        }
        .nex-time {
            font-size: 0.66rem;
            margin-top: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .nex-row-out .nex-time {
            justify-content: flex-end;
            color: rgba(255, 255, 255, 0.75);
        }
        .nex-row-in .nex-time {
            justify-content: flex-start;
            color: #a4b0be;
        }
        .nex-chat-footer {
            padding: 12px 14px;
            background: rgba(255, 255, 255, 0.04);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            gap: 8px;
        }
    `;
    document.head.appendChild(style);

    async function initChatWidget() {
        try {
            if (typeof API === 'undefined') return;
            const res = await API.get('/api/auth/me');
            if (!res || !res.user) return;
            currentUser = res.user;

            // Admin has full chat console in admin panel
            if (currentUser.role === 'admin') return;

            renderChatUI();
            checkUnread();
            unreadTimer = setInterval(checkUnread, 6000);
        } catch (e) {
            // Not logged in or error
        }
    }

    function renderChatUI() {
        if (document.getElementById('nex-chat-toggle-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'nex-chat-toggle-btn';
        btn.className = 'nex-chat-btn';
        btn.innerHTML = `
            <span style="font-size:1.2rem">💬</span>
            <span>Chat Admin</span>
            <span class="nex-chat-badge" id="nex-chat-badge">0</span>
        `;
        btn.onclick = toggleChatWindow;
        document.body.appendChild(btn);

        const win = document.createElement('div');
        win.id = 'nex-chat-window';
        win.className = 'nex-chat-window';
        win.innerHTML = `
            <div class="nex-chat-header">
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:34px;height:34px;border-radius:50%;background:rgba(0,210,255,0.2);display:flex;align-items:center;justify-content:center;font-size:1.1rem">🛡️</div>
                    <div>
                        <div style="font-weight:700;font-size:0.9rem;color:#ffffff">Admin NexPlay</div>
                        <div style="font-size:0.72rem;color:#00b894;display:flex;align-items:center;gap:4px">
                            <span style="width:6px;height:6px;background:#00b894;border-radius:50%;display:inline-block"></span> Online Support
                        </div>
                    </div>
                </div>
                <button type="button" onclick="window.toggleNexChat(false)" style="background:none;border:none;color:#a4b0be;font-size:1.3rem;cursor:pointer;padding:4px" title="Tutup Chat">✕</button>
            </div>
            <div class="nex-chat-messages" id="nex-chat-msgs">
                <div style="text-align:center;padding:28px 10px;color:rgba(255,255,255,0.5);font-size:0.82rem">
                    <div style="font-size:2rem;margin-bottom:6px">👋</div>
                    Halo <strong>${escapeHtml(currentUser.username)}</strong>! Ada yang bisa kami bantu seputar pesanan atau akun game Anda?
                </div>
            </div>
            <form class="nex-chat-footer" id="nex-chat-form" onsubmit="window.sendNexChatMessage(event)">
                <input type="text" id="nex-chat-input" class="form-control" placeholder="Tulis pesan ke admin..." autocomplete="off" required style="font-size:0.85rem;padding:9px 12px">
                <button type="submit" id="nex-chat-send-btn" class="btn btn-primary" style="padding:8px 14px;font-size:0.9rem">🚀</button>
            </form>
        `;
        document.body.appendChild(win);
    }

    async function checkUnread() {
        try {
            const data = await API.get('/api/chat/unread-count');
            const count = data.unread_count || 0;
            const badge = document.getElementById('nex-chat-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) {}
    }

    async function toggleChatWindow(forceState) {
        const win = document.getElementById('nex-chat-window');
        if (!win) return;
        isOpen = (typeof forceState === 'boolean') ? forceState : !isOpen;

        if (isOpen) {
            win.style.display = 'flex';
            await loadMessages();
            // Mark read
            try {
                await API.put('/api/chat/read', { partner_id: ADMIN_TARGET_ID });
                checkUnread();
            } catch (e) {}
            // Start polling messages while open
            if (!pollTimer) {
                pollTimer = setInterval(loadMessages, 3000);
            }
            setTimeout(() => {
                const input = document.getElementById('nex-chat-input');
                if (input) input.focus();
            }, 100);
        } else {
            win.style.display = 'none';
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }
    }

    async function loadMessages() {
        try {
            const data = await API.get(`/api/chat/messages?user_id=${ADMIN_TARGET_ID}`);
            const messages = data.messages || [];
            const container = document.getElementById('nex-chat-msgs');
            if (!container) return;

            if (messages.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center;padding:28px 10px;color:rgba(255,255,255,0.5);font-size:0.82rem">
                        <div style="font-size:2rem;margin-bottom:6px">👋</div>
                        Halo <strong>${escapeHtml(currentUser ? currentUser.username : 'User')}</strong>! Ada yang bisa kami bantu seputar pesanan atau akun game Anda?
                    </div>
                `;
                return;
            }

            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

            container.innerHTML = messages.map(m => {
                const isMine = m.is_mine === 1;
                let timeStr = '';
                try {
                    timeStr = new Date(m.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                } catch(e) {
                    timeStr = '';
                }

                if (isMine) {
                    // Outgoing (User) -> RIGHT
                    return `
                        <div class="nex-row nex-row-out">
                            <div class="nex-bubble-container">
                                <div style="font-size:0.7rem;font-weight:600;color:rgba(255,255,255,0.85);margin-bottom:3px;text-align:right">
                                    Anda
                                </div>
                                <div class="nex-bubble">
                                    ${escapeHtml(m.message)}
                                </div>
                                <div class="nex-time">
                                    <span>${timeStr}</span>
                                    <span>${m.is_read ? '✓✓' : '✓'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    // Incoming (Admin) -> LEFT
                    return `
                        <div class="nex-row nex-row-in">
                            <div class="nex-avatar-mini">🛡️</div>
                            <div class="nex-bubble-container">
                                <div style="font-size:0.7rem;font-weight:700;color:#00d2ff;margin-bottom:3px;display:flex;align-items:center;gap:4px">
                                    🛡️ Admin NexPlay
                                </div>
                                <div class="nex-bubble">
                                    ${escapeHtml(m.message)}
                                </div>
                                <div class="nex-time">
                                    <span>${timeStr}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }).join('');

            if (isNearBottom || messages.length <= 3) {
                container.scrollTop = container.scrollHeight;
            }
        } catch (e) {}
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    window.toggleNexChat = toggleChatWindow;
    window.openNexChat = () => toggleChatWindow(true);
    window.sendNexChatMessage = async (e) => {
        e.preventDefault();
        const input = document.getElementById('nex-chat-input');
        const btn = document.getElementById('nex-chat-send-btn');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        btn.disabled = true;

        try {
            await API.post('/api/chat/messages', {
                receiver_id: ADMIN_TARGET_ID,
                message: text
            });
            await loadMessages();
            const container = document.getElementById('nex-chat-msgs');
            if (container) container.scrollTop = container.scrollHeight;
        } catch (err) {
            alert(err.message || 'Gagal mengirim pesan');
            input.value = text;
        } finally {
            btn.disabled = false;
            input.focus();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatWidget);
    } else {
        initChatWidget();
    }
})();
