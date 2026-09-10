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
    const icons = { game: '🎮', film: '🎬', music: '🎵', ebook: '📚' };
    return icons[cat] || '📦';
}

// ── Navbar ──
function initNavbar() {
    // Scroll effect
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            navbar.classList.toggle('scrolled', window.scrollY > 20);
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
                🛒
                <span class="badge-count" id="cart-count" style="display:${AppState.cartCount > 0 ? 'flex' : 'none'}">${AppState.cartCount}</span>
            </a>
            <div class="user-dropdown">
                <div class="user-avatar" id="user-avatar-btn">${initial}</div>
                <div class="dropdown-menu" id="user-dropdown">
                    <div style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
                        <div style="font-weight:600;color:var(--text-primary)">${AppState.user.username}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted)">${AppState.user.role === 'admin' ? '👑 Admin' : '👤 User'}</div>
                    </div>
                    ${AppState.user.role === 'admin' ? '<a href="/admin/index.html">🛠️ Admin Dashboard</a>' : ''}
                    ${AppState.user.role === 'seller' ? '<a href="/seller/index.html">🛍️ Seller Dashboard</a>' : ''}
                    <a href="/orders.html">📦 Pesanan Saya</a>
                    <div class="dropdown-divider"></div>
                    <button onclick="logout()">🚪 Logout</button>
                </div>
            </div>
        `;

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
    localStorage.removeItem('nexplay_user');
    AppState.user = null;
    AppState.cartCount = 0;
    showToast('Logged out successfully', 'success');
    updateNavUI();
    if (window.location.pathname.includes('admin') || window.location.pathname.includes('orders') || window.location.pathname.includes('cart') || window.location.pathname.includes('checkout')) {
        window.location.href = '/';
    }
}

// ── Add to Cart ──
async function addToCart(productId) {
    if (!AppState.user) {
        showToast('Please login first', 'warning');
        window.location.href = '/login.html';
        return;
    }

    try {
        const data = await API.post('/api/cart', { product_id: productId });
        AppState.cartCount = data.cartCount || (AppState.cartCount + 1);
        updateCartBadge();
        showToast('Added to cart! 🛒', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (badge) {
        badge.textContent = AppState.cartCount;
        badge.style.display = AppState.cartCount > 0 ? 'flex' : 'none';
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
                <button class="btn-cart" onclick="event.stopPropagation(); addToCart(${product.id})" title="Add to Cart">🛒</button>
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
