import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9254;
const ARTIFACTS_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\2da9a679-e8a6-4567-8bc5-b56d1d96835d";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const VIEWPORTS = [
  { name: '1920x1080_desktop', width: 1920, height: 1080 },
  { name: '1440x900_laptop', width: 1440, height: 900 },
  { name: '1366x768_standard_laptop', width: 1366, height: 768 },
  { name: '1280x720_compact', width: 1280, height: 720 },
  { name: '1024x768_tablet_landscape', width: 1024, height: 768 }
];

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

  await sleep(2500);

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) {
      cbs.get(d.id)(d);
      cbs.delete(d.id);
    }
  };
  await new Promise(r => ws.onopen = r);

  function call(method, params = {}) {
    return new Promise(res => {
      const reqId = id++;
      cbs.set(reqId, res);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await call('Page.enable');
  await sleep(1500);

  const results = [];

  for (const vp of VIEWPORTS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(600);

    const evalRes = await call('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const elHdr = document.querySelector('.pos-unified-header-bar');
        const elRack = document.querySelector('.dispenser-rack-container');
        const elGrid = document.querySelector('.dispensers-grid-wrapper');
        const elFooter = document.getElementById('cardAllBoxesMap');

        function box(el, name) {
          if (!el) return { name, exists: false };
          const r = el.getBoundingClientRect();
          return {
            name,
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            height: Math.round(r.height),
            inViewport: r.bottom <= window.innerHeight && r.top >= 0
          };
        }

        return {
          windowH: window.innerHeight,
          header: box(elHdr, 'header'),
          rack: box(elRack, 'rack'),
          grid: box(elGrid, 'grid'),
          footer: box(elFooter, 'footer (cardAllBoxesMap)'),
          footerFullyVisibleWithoutScroll: elFooter ? (elFooter.getBoundingClientRect().bottom <= window.innerHeight) : false
        };
      })()`
    });

    const shot = await call('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ARTIFACTS_DIR, `verified_footer_${vp.name}.png`);
    fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));

    results.push({
      viewport: vp.name,
      metrics: evalRes.result.result.value,
      screenshot: shotPath
    });
  }

  console.log(JSON.stringify(results, null, 2));

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
