const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/tokens-and-components.css', 'utf8');
const p = txt.indexOf('.modal{');
if (p !== -1) {
  console.log(txt.slice(p, p + 2500));
} else {
  const m = txt.indexOf('.modal');
  console.log(txt.slice(m, m + 2500));
}
