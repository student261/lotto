const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Inventory.dc.html', 'utf8');
const scriptIdx = txt.indexOf('<script');
if (scriptIdx !== -1) {
  const scriptContent = txt.slice(scriptIdx);
  console.log(scriptContent.slice(0, 3000));
}
