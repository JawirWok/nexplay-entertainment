const fs = require('fs');
const path = require('path');

const dirs = [
    path.join(__dirname, 'public/admin'),
    path.join(__dirname, 'public/seller')
];

const replacements = [
    [/📊 Overview/g, '<i data-lucide="bar-chart-2" style="width:18px;height:18px"></i> Overview'],
    [/📦 Produk Saya/g, '<i data-lucide="package" style="width:18px;height:18px"></i> Produk Saya'],
    [/📦 Produk/g, '<i data-lucide="package" style="width:18px;height:18px"></i> Produk'],
    [/🧾 Pesanan Masuk/g, '<i data-lucide="receipt" style="width:18px;height:18px"></i> Pesanan Masuk'],
    [/🧾 Transaksi/g, '<i data-lucide="receipt" style="width:18px;height:18px"></i> Transaksi'],
    [/🎟️ Voucher Diskon/g, '<i data-lucide="ticket" style="width:18px;height:18px"></i> Voucher Diskon'],
    [/💰 Laporan Omset/g, '<i data-lucide="banknote" style="width:18px;height:18px"></i> Laporan Omset'],
    [/👥 Users/g, '<i data-lucide="users" style="width:18px;height:18px"></i> Users'],
    [/💬 Live Chat/g, '<i data-lucide="message-square" style="width:18px;height:18px"></i> Live Chat'],
    [/💬 Chat Admin/g, '<i data-lucide="message-circle" style="width:18px;height:18px"></i> Chat Admin'],
    [/🏪 Lihat Store/g, '<i data-lucide="store" style="width:18px;height:18px"></i> Lihat Store'],
    [/🚪 Logout/g, '<i data-lucide="log-out" style="width:18px;height:18px"></i> Logout'],
    
    // Admin content emojis
    [/🎟️ Kelola /g, '<i data-lucide="ticket" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Kelola '],
    [/➕ Buat Voucher Baru/g, '<i data-lucide="plus" style="width:18px;height:18px;margin-bottom:-4px"></i> Buat Voucher Baru'],
    [/🛍️ Seller /g, '<i data-lucide="store" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Seller '],
    [/👥 Kelola /g, '<i data-lucide="users" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Kelola '],
    [/📦 Kelola /g, '<i data-lucide="package" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Kelola '],
    [/➕ Tambah Produk/g, '<i data-lucide="plus" style="width:18px;height:18px;margin-bottom:-4px"></i> Tambah Produk'],
    [/🧾 Daftar /g, '<i data-lucide="receipt" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Daftar '],
    [/💰 Laporan /g, '<i data-lucide="banknote" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Laporan '],
    [/💬 Live /g, '<i data-lucide="message-square" style="width:24px;height:24px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Live '],
    [/⏸ Nonaktifkan/g, '<i data-lucide="pause" style="width:14px;height:14px;margin-bottom:-2px"></i> Nonaktifkan'],
    [/▶ Aktifkan/g, '<i data-lucide="play" style="width:14px;height:14px;margin-bottom:-2px"></i> Aktifkan'],
    [/🗑️ Hapus/g, '<i data-lucide="trash-2" style="width:14px;height:14px;margin-bottom:-2px"></i> Hapus']
];

dirs.forEach(dir => {
    fs.readdirSync(dir).forEach(file => {
        if(file.endsWith('.html')) {
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
