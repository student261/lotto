const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Main.dc.html', 'utf8');

// Find all onClick handlers in Main.dc.html
const clicks = txt.match(/onClick="\{\{[^}]+\}\}"/g) || [];
console.log('Main.dc.html clicks:', [...new Set(clicks)]);

// Find any modal / drawer / sheet in Main.dc.html
const modals = txt.match(/<div class="[^"]*(?:modal|sheet|drawer|dialog|panel|overlay|pop)[^"]*"[\s\S]*?>/gi) || [];
console.log('Main.dc.html modals/drawers:', modals);
