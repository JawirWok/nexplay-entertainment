const fs = require('fs');
const path = require('path');

const dirs = [
    path.join(__dirname, 'public/admin'),
    path.join(__dirname, 'public/seller')
];

dirs.forEach(dir => {
    fs.readdirSync(dir).forEach(file => {
        if(file.endsWith('.html')) {
            const filePath = path.join(dir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            
            // Replace the buggy MutationObserver code with a safe one
            const buggyCode = `if (shouldUpdate) {
                    lucide.createIcons();
                }`;
                
            const safeCode = `if (shouldUpdate) {
                    observer.disconnect(); // Prevent infinite loops
                    lucide.createIcons();
                    observer.observe(document.body, { childList: true, subtree: true });
                }`;
                
            if (content.includes(buggyCode)) {
                content = content.replace(buggyCode, safeCode);
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Fixed infinite loop in ${filePath}`);
            }
        }
    });
});
