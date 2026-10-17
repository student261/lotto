import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');

console.log('--- Direct children of pos-main-container ---');
let insideMain = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('class="pos-main-container"')) {
    insideMain = true;
    console.log(`pos-main-container starts at line ${i+1}`);
  }
  if (insideMain) {
    if (line.includes('<section ') || line.includes('<footer') || line.includes('id="view')) {
      console.log(`Line ${i+1}: ${line.trim().slice(0, 100)}`);
    }
  }
}
