const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
  if (l.includes('.box-details-modal') || l.includes('.box-details-card')) {
    console.log(i + 1, l);
  }
});
