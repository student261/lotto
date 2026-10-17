import fs from 'fs';

function findRules(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  const regex = /([^{}]+)\{([^{}]+)\}/g;
  let m;
  while ((m = regex.exec(css)) !== null) {
    const sel = m[1].trim();
    const body = m[2];
    if (sel.includes('.pos-main-container') || sel.includes('.card-all-boxes-map') || sel.includes('viewSellCounter') || sel.includes('.sell-counter-view') || sel.includes('.dispenser-rack-container')) {
      const pad = body.match(/padding[^;:]*:[^;]+/g);
      const mar = body.match(/margin[^;:]*:[^;]+/g);
      if (pad || mar) {
        console.log(`[${filePath}] ${sel}`);
        if (pad) console.log(`  ${pad.join('; ')}`);
        if (mar) console.log(`  ${mar.join('; ')}`);
      }
    }
  }
}

findRules('src/design-system.css');
findRules('src/responsive.css');
