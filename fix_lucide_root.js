const fs = require('fs');
const path = require('path');

const targetFiles = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'public/product.html'),
    path.join(__dirname, 'public/login.html'),
    path.join(__dirname, 'public/register.html')
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
                    observer.disconnect(); // Prevent infinite loops
                    lucide.createIcons();
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    </script>
</body>`;

targetFiles.forEach(filePath => {
    if(fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Remove old scripts that might conflict
        const oldScriptRegex = /<script src="https:\/\/unpkg\.com\/lucide@latest"><\/script>\s*<script>\s*lucide\.createIcons\(\);\s*<\/script>/i;
        content = content.replace(oldScriptRegex, '');
        
        // Add new script
        if (!content.includes('MutationObserver')) {
            content = content.replace(/<\/body>/i, lucideScript);
            modified = true;
        }
        
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Added observer to ${filePath}`);
        }
    }
});
