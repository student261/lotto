const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Inventory.dc.html', 'utf8');
const p = txt.indexOf('function defaultPackValue');
console.log(txt.slice(p + 1500, p + 4500));
