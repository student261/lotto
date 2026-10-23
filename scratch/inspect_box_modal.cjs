const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Main.dc.html', 'utf8');
const p = txt.indexOf('aria-labelledby="box-h"');
console.log(txt.slice(p - 100, p + 2500));
