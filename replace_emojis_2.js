const fs = require('fs');
const path = require('path');

const targetFiles = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'public/js/app.js'),
    path.join(__dirname, 'public/js/chat-widget.js'),
    path.join(__dirname, 'public/product.html') // Just in case
];

const replacements = [
    // index.html
    [/📦 Katalog/g, '<i data-lucide="package" style="width:28px;height:28px;display:inline-block;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i> Katalog'],
    [/🔍/g, '<i data-lucide="search" style="width:20px;height:20px;margin-bottom:-4px;color:var(--text-muted)"></i>'],
    [/🌐 Semua/g, '<i data-lucide="globe" style="width:16px;height:16px;margin-bottom:-2px"></i> Semua'],
    [/🎮 Games/g, '<i data-lucide="gamepad-2" style="width:16px;height:16px;margin-bottom:-2px"></i> Games'],
    [/🎬 Film/g, '<i data-lucide="clapperboard" style="width:16px;height:16px;margin-bottom:-2px"></i> Film'],
    [/🎵 Musik/g, '<i data-lucide="music" style="width:16px;height:16px;margin-bottom:-2px"></i> Musik'],
    [/📚 eBook/g, '<i data-lucide="book" style="width:16px;height:16px;margin-bottom:-2px"></i> eBook'],
    
    // app.js & product.html
    [/⭐/g, '<i data-lucide="star" style="width:14px;height:14px;color:orange;margin-bottom:-2px;fill:orange"></i>'],
    
    // chat-widget.js
    [/💬/g, '<i data-lucide="message-circle" style="width:20px;height:20px;margin-bottom:-4px"></i>'],
    [/🛡️/g, '<i data-lucide="shield" style="width:18px;height:18px"></i>'],
    [/👋/g, '<i data-lucide="hand" style="width:32px;height:32px;margin:auto"></i>'],
    [/🚀/g, '<i data-lucide="send" style="width:18px;height:18px;margin-bottom:-2px"></i>']
];

targetFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
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
