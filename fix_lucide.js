const fs = require('fs');
const path = require('path');

const dirs = [
    path.join(__dirname, 'public/admin'),
    path.join(__dirname, 'public/seller')
];

const lucideScript = `
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>
        if (window.lucide) {
            lucide.createIcons();
            // Automatically update icons when DOM changes (for dynamic content)
            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                for (let m of mutations) {
                    if (m.addedNodes.length > 0) {
                        shouldUpdate = true;
                        break;
                    }
                }
                if (shouldUpdate) {
                    lucide.createIcons();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    </script>
</body>`;

dirs.forEach(dir => {
    fs.readdirSync(dir).forEach(file => {
        if(file.endsWith('.html')) {
            const filePath = path.join(dir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;
            
            if (!content.includes('https://unpkg.com/lucide@latest')) {
                content = content.replace(/<\/body>/i, lucideScript);
                modified = true;
            }
            
            if (modified) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Added script to ${filePath}`);
            }
        }
    });
});
