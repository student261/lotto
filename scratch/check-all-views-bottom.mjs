import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const viewIds = ['viewSellCounter', 'viewCloseShift', 'viewReceivePacks', 'viewDayReport', 'viewInventory', 'viewHistory', 'viewSettings'];

viewIds.forEach(id => {
  const start = html.indexOf(`id="${id}"`);
  if (start !== -1) {
    const end = html.indexOf('</section>', start);
    const slice = html.substring(start, end);
    const lines = slice.split('\n').filter(l => l.trim().length > 0);
    console.log(`=== ${id} last 5 lines: ===`);
    console.log(lines.slice(-5).join('\n'));
    console.log('');
  }
});
