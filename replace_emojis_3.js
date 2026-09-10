const fs = require('fs');
const path = require('path');

const dirs = [
    __dirname,
    path.join(__dirname, 'public'),
    path.join(__dirname, 'public/js'),
    path.join(__dirname, 'public/admin'),
    path.join(__dirname, 'public/seller')
];

const replacements = [
    [/<i data-lucide="package" style="width:28px;height:28px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Pesanan/g, '<i data-lucide="package" style="width:28px;height:28px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Pesanan'],
    [/<i data-lucide="target" style="width:16px;height:16px;margin-bottom:-2px"></i> Katalog/g, '<i data-lucide="target" style="width:16px;height:16px;margin-bottom:-2px"></i> Katalog'],
    [/<i data-lucide="home" style="width:16px;height:16px;margin-bottom:-2px"></i> Home/g, '<i data-lucide="home" style="width:16px;height:16px;margin-bottom:-2px"></i> Home'],
    [/<i data-lucide="shopping-cart" style="width:32px;height:32px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Keranjang/g, '<i data-lucide="shopping-cart" style="width:32px;height:32px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Keranjang'],
    [/<i data-lucide="lock" style="width:48px;height:48px;margin:auto"></i>/g, '<i data-lucide="lock" style="width:48px;height:48px;margin:auto"></i>'],
    [/<i data-lucide="eye-off" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Tutup Akun/g, '<i data-lucide="eye-off" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Tutup Akun'],
    [/<i data-lucide="eye" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Buka Akun/g, '<i data-lucide="eye" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Buka Akun'],
    [/<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Invoice/g, '<i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Invoice'],
    [/<i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Sedang Diproses & Diverifikasi Admin/g, '<i data-lucide="clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></i> Sedang Diproses & Diverifikasi Admin'],
    [/💳 <span class="text-gradient">Checkout<\/span>/g, '<i data-lucide="credit-card" style="width:32px;height:32px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--text-primary)"></i> <span class="text-gradient">Checkout</span>'],
    [/<div class="logo-icon">🎮<\/div>/g, '<div class="logo-icon"><i data-lucide="gamepad-2"></i></div>'],
    [/<div class="empty-icon">🛒<\/div>/g, '<div class="empty-icon"><i data-lucide="shopping-cart" style="width:48px;height:48px;margin:auto"></i></div>'],
    
    // Auth pages
    [/🔑 <span class="text-gradient">Login<\/span>/g, '<i data-lucide="log-in" style="width:32px;height:32px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--text-primary)"></i> <span class="text-gradient">Login</span>'],
    [/📝 <span class="text-gradient">Daftar Akun<\/span>/g, '<i data-lucide="user-plus" style="width:32px;height:32px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--text-primary)"></i> <span class="text-gradient">Daftar Akun</span>']
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
        if(file.endsWith('.html') || file.endsWith('.js')) {
            const filePath = path.join(dir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;
            replacements.forEach(([regex, repl]) => {
                if (content.match(regex)) {
                    content = content.replace(regex, repl);
                    modified = true;
                }
            });
            if (modified) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated ${filePath}`);
            }
        }
    });
});
