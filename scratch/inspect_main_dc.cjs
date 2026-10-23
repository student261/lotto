const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Main.dc.html', 'utf8');
const p = txt.indexOf('class="ctl"');
console.log(txt.slice(p + 1500, p + 4000));
