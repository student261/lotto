const fs = require('fs');

const files = ['src/main.js', 'src/data.js', 'src/dbSync.js', 'src/historyData.js', 'src/inventoryData.js'];
const storageKeys = new Set();
const storageUsages = [];

for (const file of files) {
  const content = fs.readFileSync('c:/Users/Admin/OneDrive/Documents/lotto/' + file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('localStorage') || line.includes('sessionStorage') || line.includes('indexedDB')) {
      storageUsages.push(`${file}:${idx + 1} - ${line.trim()}`);
      const matches = line.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g);
      for (const m of matches) {
        storageKeys.add(m[1]);
      }
    }
  });
}

console.log('Extracted Storage Keys:', Array.from(storageKeys));
console.log('\nTotal storage operations found:', storageUsages.length);
console.log('Sample usages:');
storageUsages.slice(0, 25).forEach(u => console.log(u));
