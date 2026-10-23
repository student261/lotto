const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const mainJs = fs.readFileSync('src/main.js', 'utf8');

// Find all buttons
const btnRegex = /<button\b([^>]*)>(.*?)<\/button>/gis;
const buttons = [];
let match;
while ((match = btnRegex.exec(html)) !== null) {
  const attrs = match[1];
  const innerText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const idMatch = attrs.match(/id=["']([^"']+)["']/i);
  const onclickMatch = attrs.match(/onclick=["']([^"']+)["']/i);
  const classMatch = attrs.match(/class=["']([^"']+)["']/i);
  buttons.push({
    id: idMatch ? idMatch[1] : null,
    text: innerText,
    onclick: onclickMatch ? onclickMatch[1] : null,
    className: classMatch ? classMatch[1] : null,
  });
}

// Find all modals
const modalRegex = /<div\b[^>]*\bid=["']([^"']*(?:modal|dialog|popup|drawer|overlay)[^"']*)["'][^>]*>/gi;
const modals = [];
while ((match = modalRegex.exec(html)) !== null) {
  modals.push(match[1]);
}

// Find all views
const viewRegex = /<div\b[^>]*\bid=["'](view[A-Z][a-zA-Z0-9]+)["'][^>]*>/gi;
const views = [];
while ((match = viewRegex.exec(html)) !== null) {
  views.push(match[1]);
}

// Check role logic in mainJs
const roles = ['Owner', 'Manager', 'Cashier', 'Salesperson'];
console.log('Total buttons found in HTML:', buttons.length);
console.log('Buttons with ID:', buttons.filter(b => b.id).length);
console.log('Modals found:', modals);
console.log('Views found:', views);

fs.writeFileSync('scratch/buttons_extracted.json', JSON.stringify(buttons, null, 2));
