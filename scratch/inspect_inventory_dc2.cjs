const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Inventory.dc.html', 'utf8');
// search for modal, dialog, sheet, drawer, form, click
const matches = txt.match(/<div class="[^"]*modal[^"]*"[\s\S]*?<\/div>/g) || [];
console.log('modal divs:', matches.length);
// Find all button clicks or row clicks
const clicks = txt.match(/onClick="\{\{[^}]+\}\}"/g) || [];
console.log('clicks in Inventory.dc.html:', [...new Set(clicks)]);
