const fs = require('fs');

const mainJs = fs.readFileSync('src/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// Scan all addEventListener across all files in src/
const srcFiles = fs.readdirSync('src').filter(f => f.endsWith('.js'));
let allListeners = [];

srcFiles.forEach(file => {
  const content = fs.readFileSync('src/' + file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('.addEventListener(')) {
      allListeners.push({
        file: 'src/' + file,
        line: idx + 1,
        code: line.trim()
      });
    }
  });
});

console.log('Total addEventListener calls in src/:', allListeners.length);
fs.writeFileSync('scratch/all_src_listeners.json', JSON.stringify(allListeners, null, 2));
