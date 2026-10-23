const fs = require('fs');

const mainJs = fs.readFileSync('c:/Users/Admin/OneDrive/Documents/lotto/src/main.js', 'utf8');

function searchFunc(name) {
  const idx = mainJs.indexOf(name);
  if (idx !== -1) {
    console.log(`=== ${name} ===`);
    console.log(mainJs.slice(Math.max(0, idx - 50), idx + 800));
  }
}

searchFunc('function requireAdminAuth');
searchFunc('function openManagerApprovalModal');
searchFunc('function switchRole');
searchFunc('function isOwner');
