import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9249;
const ARTIFACTS_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\2da9a679-e8a6-4567-8bc5-b56d1d96835d";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const TEST_VIEWPORTS = [
  { name: '1440x900_desktop', width: 1440, height: 900 },
  { name: '1366x768_laptop', width: 1366, height: 768 },
  { name: '1200x800_laptop', width: 1200, height: 800 },
  { name: '1920x1080_bigscreen', width: 1920, height: 1080 }
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

  // Inject CSS rules to test viewport locking
  const testCss = `
    @media (min-width: 769px) {
      body, html {
        height: 100vh !important;
        overflow: hidden !important;
      }
      .pos-app-layout {
        height: 100vh !important;
        max-height: 100vh !important;
        overflow: hidden !important;
      }
      .pos-main-container {
        height: 100vh !important;
        max-height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        padding-bottom: 8px !important;
      }
      .sell-counter-view {
        height: 100% !important;
        max-height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
      .pos-unified-header-bar {
        flex-shrink: 0 !important;
      }
      .dispenser-rack-container {
        flex: 1 1 0% !important;
        min-height: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        margin-bottom: 0 !important;
        padding-bottom: 8px !important;
      }
      .rack-headline-bar,
      .filter-chips-row {
        flex-shrink: 0 !important;
      }
      .dispensers-grid-wrapper {
        flex: 1 1 0% !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        padding-right: 4px !important;
      }
      .card-all-boxes-map {
        flex-shrink: 0 !important;
        margin-top: 8px !important;
        margin-bottom: 0 !important;
        padding: 0.6rem 1.25rem !important;
      }
      .all-boxes-map-header {
        margin-bottom: 6px !important;
      }
      .all-boxes-map-title {
        font-size: 0.95rem !important;
      }
    }
  `;

  await call('Runtime.evaluate', {
    expression: `(() => {
      const style = document.createElement('style');
      style.id = 'test-footer-docking-style';
      style.textContent = \`${testCss}\`;
      document.head.appendChild(style);
    })()`
  });

  await sleep(500);

  const results = [];

  for (const vp of TEST_VIEWPORTS) {
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
          footer: box(elFooter, 'footer (cardAllBoxesMap)')
        };
      })()`
    });

    const shot = await call('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ARTIFACTS_DIR, `test_footer_docking_${vp.name}.png`);
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
