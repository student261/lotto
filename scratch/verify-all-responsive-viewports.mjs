import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9247;
const ARTIFACTS_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\2da9a679-e8a6-4567-8bc5-b56d1d96835d";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const VIEWPORTS = [
  { name: '1920_large_desktop', width: 1920, height: 1080 },
  { name: '1440_desktop', width: 1440, height: 900 },
  { name: '1200_laptop', width: 1200, height: 800 },
  { name: '900_tablet', width: 900, height: 750 },
  { name: '414_mobile', width: 414, height: 896 }
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
      mobile: vp.width <= 768
    });
    await sleep(600);

    const evalRes = await call('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const elMain = document.querySelector('.pos-main-container');
        const elHdr = document.querySelector('.pos-unified-header-bar');
        const elRack = document.querySelector('.dispenser-rack-container');
        const elLastScan = document.getElementById('lastScanReadoutContainer');

        const mainRect = elMain ? elMain.getBoundingClientRect() : null;
        const hdrRect = elHdr ? elHdr.getBoundingClientRect() : null;
        const rackRect = elRack ? elRack.getBoundingClientRect() : null;
        const lastScanRect = elLastScan ? elLastScan.getBoundingClientRect() : null;

        const hdrStyle = elHdr ? window.getComputedStyle(elHdr) : {};
        const rackStyle = elRack ? window.getComputedStyle(elRack) : {};

        return {
          headerHeight: hdrRect ? hdrRect.height : null,
          gapTopToHeader: (hdrRect && mainRect) ? (hdrRect.top - mainRect.top) : null,
          gapHeaderToRack: (hdrRect && rackRect) ? (rackRect.top - hdrRect.bottom) : null,
          lastScanHeight: lastScanRect ? lastScanRect.height : null,
          hdrPaddingTop: hdrStyle.paddingTop,
          hdrPaddingBottom: hdrStyle.paddingBottom,
          hdrMarginBottom: hdrStyle.marginBottom,
          rackMarginTop: rackStyle.marginTop,
          rackPaddingTop: rackStyle.paddingTop
        };
      })()`
    });

    // Capture screenshot
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ARTIFACTS_DIR, `responsive_fix_${vp.name}.png`);
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
