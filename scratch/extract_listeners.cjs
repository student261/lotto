const fs = require('fs');

const mainJs = fs.readFileSync('src/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// Parse all click event listeners in main.js
const clickListeners = [];
const clickRegex = /(?:document\.getElementById\(['"]([^'"]+)['"]\)|(\$[a-zA-Z0-9_]+))\s*\.addEventListener\(\s*['"]click['"]\s*,\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);/g;
let m;
while ((m = clickRegex.exec(mainJs)) !== null) {
  const target = m[1] || m[2];
  const handlerBody = m[4].trim();
  const summary = handlerBody.split('\n')[0].trim().slice(0, 100);
  clickListeners.push({ target, summary });
}

console.log('Explicit click listeners found:', clickListeners.length);
fs.writeFileSync('scratch/click_listeners.json', JSON.stringify(clickListeners, null, 2));
