const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Inventory.dc.html', 'utf8');
const p = txt.lastIndexOf('<script type="text/x-dc"');
console.log(txt.slice(p, p + 3000));
