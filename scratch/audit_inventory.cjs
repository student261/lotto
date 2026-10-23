const fs = require('fs');

const indexHtml = fs.readFileSync('c:/Users/Admin/OneDrive/Documents/lotto/index.html', 'utf8');

// Find all elements with id="..."
const idRegex = /id="([^"]+)"/g;
let match;
const ids = new Set();
while ((match = idRegex.exec(indexHtml)) !== null) {
  ids.add(match[1]);
}
console.log('Total unique IDs in index.html:', ids.size);

// Find elements with class="...view..." or section/page
const viewIds = Array.from(ids).filter(id => id.toLowerCase().includes('view') || id.toLowerCase().includes('page') || id.toLowerCase().includes('screen') || id.toLowerCase().includes('modal'));
console.log('View/Screen/Modal IDs:', viewIds);
