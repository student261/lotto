const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');
const m = txt.match(/id="[^"]*(?:modal|dialog|drawer|popup|overlay)[^"]*"/gi);
console.log(m ? [...new Set(m)] : 'none');
