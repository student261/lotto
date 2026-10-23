const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('id="boxAdjustModal"')) {
    console.log('line:', i + 1);
    console.log(lines.slice(i, i + 80).join('\n'));
  }
});
