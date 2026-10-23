const fs = require('fs');

const mainJs = fs.readFileSync('c:/Users/Admin/OneDrive/Documents/lotto/src/main.js', 'utf8');
const clerksJs = fs.readFileSync('c:/Users/Admin/OneDrive/Documents/lotto/src/clerksData.js', 'utf8');

// Search for role references
const roleRegex = /(Owner|Manager|Cashier|Salesperson|Clerk|role)/gi;
const matches = [];
for (const line of mainJs.split('\n')) {
  if (line.includes('role') || line.includes('Salesperson') || line.includes('isOwner') || line.includes('isManager')) {
    matches.push(line.trim());
  }
}
console.log('Sample role logic lines in main.js:', matches.slice(0, 30));
console.log('Clerks data snippet:');
console.log(clerksJs.slice(0, 500));
