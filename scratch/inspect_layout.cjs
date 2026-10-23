const fs = require('fs');

function searchAll(file, term) {
  const c = fs.readFileSync(file, 'utf8');
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(term)) {
      console.log(`[${file}] ${i+1}: ${lines[i].trim()}`);
    }
  }
}

searchAll('src/style.css', 'pos-main-container');
searchAll('src/responsive.css', 'pos-main-container');
