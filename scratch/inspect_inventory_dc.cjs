const fs = require('fs');
const txt = fs.readFileSync('lotto-agent-pack/design/screens/Inventory.dc.html', 'utf8');
console.log('length:', txt.length);
// Search for edit, click, modal, or table rows
const rows = txt.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
console.log('tr count:', rows ? rows.length : 0);
if (rows && rows.length > 0) {
  console.log('First TR:\n', rows[0].slice(0, 1000));
  if (rows.length > 1) console.log('Second TR:\n', rows[1].slice(0, 1000));
}
// Also search for "edit" or modals
const editIdx = txt.indexOf('edit');
console.log('has edit:', editIdx !== -1);
if (editIdx !== -1) {
  console.log(txt.slice(editIdx - 100, editIdx + 500));
}
