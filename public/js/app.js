// ═══════════════════════════════════════════════════════════
//  NexPlay — Core Application Logic
// ═══════════════════════════════════════════════════════════

const API = {
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        let user = AppState.user;
        if (!user) {
            try {
                user = JSON.parse(localStorage.getItem('nexplay_user') || 'null');
                if (user) AppState.user = user;
            } catch (e) { }
        }
        if (user && user.id) {
            headers['x-user-id'] = String(user.id);
            headers['x-user-role'] = String(user.role || (user.id == 1 ? 'admin' : 'user'));
        }
        return headers;
    },
    async request(url, options = {}) {
        try {
            const headers = { ...this.getHeaders(), ...options.headers };
            const res = await fetch(url, {
                headers,
                credentials: 'include',
                ...options
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        } catch (err) {
            throw err;
        }
    },
    get: (url) => API.request(url),
    post: (url, body) => API.request(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url, body) => API.request(url, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (url) => API.request(url, { method: 'DELETE' })
};

// ── State ──
const AppState = {
    user: null,
    cartCount: 0
};

// ── Client-Side Cart Store (Resilient to Serverless Cold Starts) ──
const CartStore = {
    STORAGE_KEY: 'nexplay_local_cart',
    getItems() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    },
    saveItems(items) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
        } catch (e) {}
        AppState.cartCount = this.getCount();
        updateCartBadge();
        window.dispatchEvent(new CustomEvent('nexplay_cart_updated', { detail: items }));
    },
    addItem(product, quantity = 1) {
        const items = this.getItems();
        const pid = parseInt(product.id || product.product_id, 10);
        const existing = items.find(i => (i.product_id || i.id) === pid);
        if (existing) {
            existing.quantity = (existing.quantity || 1) + quantity;
        } else {
            let actualPrice = product.price || 0;
            if (product.discount_percentage && product.discount_percentage > 0) {
                actualPrice = product.price - (product.price * product.discount_percentage / 100);
            }
            items.push({
                id: product.cart_id || pid,
                product_id: pid,
                name: product.name || ('Item #' + pid),
                price: product.price || 0,
                actual_price: actualPrice,
                image_url: product.image_url || '',
                category: product.category || 'game',
                seller_id: product.seller_id || 1,
                stock: product.stock || 100,
                discount_percentage: product.discount_percentage || 0,
                quantity: quantity
            });
        }
        this.saveItems(items);
    },
    updateQty(productId, qty) {
        let items = this.getItems();
        const pid = parseInt(productId, 10);
        if (qty <= 0) {
            items = items.filter(i => (i.product_id || i.id) !== pid && i.id !== pid);
        } else {
            const item = items.find(i => (i.product_id || i.id) === pid || i.id === pid);
            if (item) item.quantity = qty;
        }
        this.saveItems(items);
    },
    removeItem(productId) {
        const pid = parseInt(productId, 10);
        const items = this.getItems().filter(i => (i.product_id || i.id) !== pid && i.id !== pid);
        this.saveItems(items);
    },
    clear() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {}
        AppState.cartCount = 0;
        updateCartBadge();
        window.dispatchEvent(new CustomEvent('nexplay_cart_updated', { detail: [] }));
    },
    getCount() {
        return this.getItems().reduce((sum, i) => sum + (i.quantity || 1), 0);
    }
};

// ── Client-Side Chat Cache (Instant Tab-to-Tab Synchronization) ──
const ChatCache = {
    STORAGE_KEY: 'nexplay_chat_cache',
    getAll() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    },
    saveAll(msgs) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(msgs));
            localStorage.setItem('nexplay_chat_last_update', String(Date.now()));
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('nexplay_chat_message', { detail: msgs }));
    },
    addMessage(msg) {
        if (!msg) return;
        const all = this.getAll();
        const exists = all.some(m => 
            (m.id && msg.id && m.id === msg.id) ||
            (m.sender_id === msg.sender_id && m.receiver_id === msg.receiver_id && m.message === msg.message && Math.abs(new Date(m.created_at || Date.now()) - new Date(msg.created_at || Date.now())) < 5000)
        );
        if (!exists) {
            all.push({
                ...msg,
                id: msg.id || ('local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
                created_at: msg.created_at || new Date().toISOString()
            });
            this.saveAll(all);
        }
    },
    saveMessage(msg) {
        if (!msg) return;
        this.addMessage(msg);
    },
    mergeMessages(serverMessages = []) {
        const localMsgs = this.getAll();
        const map = new Map();
        for (const m of (serverMessages || [])) {
            if (m && m.id) map.set(String(m.id), m);
        }
        for (const m of localMsgs) {
            const key = String(m.id || (m.sender_id + '_' + m.receiver_id + '_' + m.message));
            if (!map.has(key)) {
                map.set(key, m);
            }
        }
        const combined = Array.from(map.values());
        combined.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        return combined;
    },
    getMessagesBetween(userA, userB) {
        const a = parseInt(userA, 10), b = parseInt(userB, 10);
        return this.getAll().filter(m => 
            (m.sender_id == a && m.receiver_id == b) || 
            (m.sender_id == b && m.receiver_id == a) ||
            (b === 1 && m.receiver_id == 1 && m.sender_id == a) ||
            (a === 1 && m.receiver_id == 1 && m.sender_id == b)
        );
    }
};

// ── Client-Side Review Store (Resilient to Serverless Cold Starts) ──
const ReviewStore = {
    STORAGE_KEY: 'nexplay_user_reviews',
    getReviews() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    },
    saveReview(review) {
        const list = this.getReviews();
        const exists = list.some(r => r.order_id == review.order_id && r.product_id == review.product_id);
        if (!exists) {
            list.push({
                ...review,
                created_at: review.created_at || new Date().toISOString()
            });
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
            } catch (e) {}
        }
    },
    hasReviewed(orderId, productId) {
        return this.getReviews().some(r => r.order_id == orderId && r.product_id == productId);
    },
    getByProduct(productId) {
        return this.getReviews().filter(r => r.product_id == productId);
    }
};

// ── Toast Notifications ──
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ── Format Currency ──
function formatRupiah(amount) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(amount);
}

// ── Category Icons ──
function getCategoryIcon(cat) {
    const icons = { game: '<i data-lucide="gamepad-2"></i>', film: '<i data-lucide="clapperboard"></i>', music: '<i data-lucide="music"></i>', ebook: '<i data-lucide="book"></i>' };
    return icons[cat] || '<i data-lucide="box"></i>';
}

// ── Navbar ──
function initNavbar() {
    // Scroll effect & Scroll Spy
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            navbar.classList.toggle('scrolled', window.scrollY > 20);
        }

        // Scroll Spy
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
        if (navLinks.length > 0 && window.location.pathname === '/') {
            let current = '/';
            if (window.scrollY > 200) {
                sections.forEach(section => {
                    const sectionTop = section.offsetTop;
                    if (window.scrollY >= (sectionTop - 150)) {
                        current = '#' + section.getAttribute('id');
                    }
                });
            }
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === current) {
                    link.classList.add('active');
                }
            });
        }
    });

    // Mobile toggle
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navMenu = document.querySelector('.navbar-nav');
    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('show');
        });
    }

    // User dropdown
    const userAvatar = document.querySelector('.user-avatar');
    const dropdown = document.querySelector('.dropdown-menu');
    if (userAvatar && dropdown) {
        userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            dropdown.classList.remove('show');
        });
    }
}

// ── Update Nav UI ──
function updateNavUI() {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    if (AppState.user) {
        const initial = AppState.user.username.charAt(0).toUpperCase();
        navActions.innerHTML = `
            <a href="/cart.html" class="btn btn-secondary btn-icon cart-badge" id="cart-nav-btn">
                <i data-lucide="shopping-cart"></i>
                <span class="badge-count" id="cart-count" style="display:${AppState.cartCount > 0 ? 'flex' : 'none'}">${AppState.cartCount}</span>
            </a>
            <div class="user-dropdown">
                <div class="user-avatar" id="user-avatar-btn">${initial}</div>
                <div class="dropdown-menu" id="user-dropdown">
                    <div style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
                        <div style="font-weight:600;color:var(--text-primary)">${AppState.user.username}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted)">${AppState.user.role === 'admin' ? '<i data-lucide="crown" style="width:14px;height:14px"></i> Admin' : '<i data-lucide="user" style="width:14px;height:14px"></i> User'}</div>
                    </div>
                    ${AppState.user.role === 'admin' ? '<a href="/admin/dashboard.html"><i data-lucide="layout-dashboard" style="width:16px;height:16px"></i> Admin Dashboard</a>' : ''}
                    ${AppState.user.role === 'seller' ? '<a href="/seller/index.html"><i data-lucide="store" style="width:16px;height:16px"></i> Seller Dashboard</a>' : ''}
                    <a href="/orders.html"><i data-lucide="package" style="width:16px;height:16px"></i> Pesanan Saya</a>
                    <div class="dropdown-divider"></div>
                    <button onclick="logout()"><i data-lucide="log-out" style="width:16px;height:16px"></i> Logout</button>
                </div>
            </div>
        `;

        if (window.lucide) {
            lucide.createIcons();
        }

        // Reinitialize dropdown
        const avatar = document.getElementById('user-avatar-btn');
        const dropdown = document.getElementById('user-dropdown');
        if (avatar && dropdown) {
            avatar.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });
            document.addEventListener('click', () => {
                dropdown.classList.remove('show');
            });
        }
    } else {
        navActions.innerHTML = `
            <a href="/login.html" class="btn btn-secondary btn-sm">Login</a>
            <a href="/register.html" class="btn btn-primary btn-sm">Register</a>
        `;
    }
}

// ── Auth Check ──
async function checkAuth() {
    try {
        const cached = JSON.parse(localStorage.getItem('nexplay_user') || 'null');
        if (cached) {
            AppState.user = cached;
            updateNavUI();
        }
    } catch (e) { }

    try {
        const data = await API.get('/api/auth/me');
        if (data.user) {
            AppState.user = data.user;
            localStorage.setItem('nexplay_user', JSON.stringify(data.user));
        }

        // Get cart count
        try {
            const cartData = await API.get('/api/cart/count');
            AppState.cartCount = cartData.count || 0;
        } catch (e) { /* ignore */ }

        updateNavUI();
    } catch (err) {
        if (!AppState.user) {
            localStorage.removeItem('nexplay_user');
            AppState.user = null;
            updateNavUI();
        }
    }
}

// ── Logout ──
async function logout() {
    try {
        await API.post('/api/auth/logout');
    } catch (e) { }

    try {
        localStorage.removeItem('nexplay_user');
        sessionStorage.removeItem('nexplay_checkout_data');
        sessionStorage.removeItem('nexplay_checkout_items');
        if (typeof CartStore !== 'undefined') CartStore.clear();
        AppState.user = null;
        AppState.cartCount = 0;
    } catch (err) { console.error(err); }

    // Redirect to login to force navigation
    window.location.href = '/login.html';
}

// ── Add to Cart ──
async function addToCart(productId) {
    if (!AppState.user) {
        showToast('Please login first', 'warning');
        window.location.href = '/login.html';
        return;
    }

    try {
        let prod = null;
        if (window.catalogProducts && Array.isArray(window.catalogProducts)) {
            prod = window.catalogProducts.find(p => p.id == productId);
        }
        if (!prod) {
            try {
                const res = await API.get(`/api/products/${productId}`);
                prod = res.product || res;
            } catch (e) {}
        }

        if (prod) {
            CartStore.addItem(prod, 1);
        } else {
            CartStore.addItem({ id: productId, name: 'Produk #' + productId, price: 0 }, 1);
        }

        // Background server sync
        API.post('/api/cart', { product_id: productId }).catch(() => {});
        API.post('/api/cart/sync', { items: CartStore.getItems() }).catch(() => {});

        AppState.cartCount = CartStore.getCount();
        updateCartBadge();
        showToast('Berhasil ditambahkan ke keranjang! 🛒', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (badge) {
        const count = CartStore.getCount();
        AppState.cartCount = count;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// ── Scroll Animations ──
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));
}

// ── Product Card HTML ──
function renderProductCard(product) {
    const imgTag = product.image_url
        ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">`
        : '';
    const placeholderDisplay = product.image_url ? 'display:none;' : '';
    
    let priceHtml = `<span class="price">${formatRupiah(product.price)}</span>`;
    if (product.discount_percentage > 0) {
        const discountedPrice = product.price - (product.price * product.discount_percentage / 100);
        priceHtml = `
            <div style="display:flex; flex-direction:column;">
                <span style="text-decoration: line-through; font-size: 0.8rem; color: #888;">${formatRupiah(product.price)}</span>
                <span class="price" style="color: #ff4757;">${formatRupiah(discountedPrice)} <span style="font-size:0.7rem; background:#ff4757; color:white; padding:2px 4px; border-radius:4px;">-${product.discount_percentage}%</span></span>
            </div>
        `;
    }

    return `
        <div class="glass-card product-card" onclick="window.location.href='/product.html?id=${product.id}'" data-product-id="${product.id}">
            <div class="card-image">
                ${imgTag}
                <div class="placeholder-img" style="${placeholderDisplay}">${getCategoryIcon(product.category)}</div>
                <span class="category-badge ${product.category}">${product.category}</span>
                <span class="rating-badge">⭐ ${Number(product.rating).toFixed(1)}</span>
            </div>
            <div class="card-body">
                <h4>${product.name}</h4>
                <div class="developer">${product.developer || product.platform}</div>
            </div>
            <div class="card-footer" style="align-items:flex-end;">
                ${priceHtml}
                <button class="btn-cart" onclick="event.stopPropagation(); addToCart(${product.id})" title="Add to Cart"><i data-lucide="shopping-cart" style="width:18px;height:18px"></i></button>
            </div>
        </div>
    `;
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    checkAuth();
    initScrollAnimations();

    // Dynamically load chat widget if not already present
    if (!document.getElementById('nex-chat-widget-script')) {
        const chatScript = document.createElement('script');
        chatScript.id = 'nex-chat-widget-script';
        chatScript.src = '/js/chat-widget.js';
        chatScript.defer = true;
        document.body.appendChild(chatScript);
    }
});
