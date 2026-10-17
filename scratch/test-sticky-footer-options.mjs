import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9251;
const ARTIFACTS_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\2da9a679-e8a6-4567-8bc5-b56d1d96835d";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,750',
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

  // Approach 1: Flex Viewport Lock for Sell Counter
  const flexViewportCss = `
    @media (min-width: 769px) {
      .pos-main-container {
        display: flex !important;
        flex-direction: column !important;
        height: 100vh !important;
        max-height: 100vh !important;
        overflow-y: auto !important;
        box-sizing: border-box !important;
        padding-bottom: 8px !important;
      }
      .sell-counter-view {
        flex: 1 1 0% !important;
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important;
        height: 100% !important;
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
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        padding: 0.85rem 1.25rem 0.5rem !important;
      }
      .rack-headline-bar,
      .filter-chips-row {
        flex-shrink: 0 !important;
        margin-bottom: 0.5rem !important;
      }
      .dispensers-grid-wrapper {
        flex: 1 1 0% !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        padding-right: 6px !important;
        scrollbar-width: thin !important;
        scrollbar-color: #cbd5e1 transparent !important;
      }
      .dispensers-grid-wrapper::-webkit-scrollbar {
        width: 6px;
      }
      .dispensers-grid-wrapper::-webkit-scrollbar-thumb {
        background-color: #cbd5e1;
        border-radius: 4px;
      }
      .card-all-boxes-map {
        flex-shrink: 0 !important;
        margin-top: 8px !important;
        margin-bottom: 0 !important;
        padding: 0.65rem 1.25rem !important;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.03) !important;
      }
      .all-boxes-map-header {
        margin-bottom: 6px !important;
      }
      .all-boxes-map-title {
        font-size: 0.95rem !important;
      }
      .slots-ribbon-grid {
        gap: 4px !important;
      }
      .ribbon-cell {
        height: 28px !important;
        font-size: 0.75rem !important;
      }
    }
  `;

  await call('Runtime.evaluate', {
    expression: `(() => {
      const style = document.createElement('style');
      style.id = 'approach1-style';
      style.textContent = \`${flexViewportCss}\`;
      document.head.appendChild(style);
    })()`
  });

  await sleep(600);

  const eval1 = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elHdr = document.querySelector('.pos-unified-header-bar');
      const elRack = document.querySelector('.dispenser-rack-container');
      const elGridWrap = document.querySelector('.dispensers-grid-wrapper');
      const elFooter = document.getElementById('cardAllBoxesMap');

      function inspect(el, name) {
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
        header: inspect(elHdr, 'header'),
        rack: inspect(elRack, 'rack'),
        gridWrap: inspect(elGridWrap, 'gridWrap'),
        footer: inspect(elFooter, 'footer (cardAllBoxesMap)'),
        canScrollGrid: elGridWrap.scrollHeight > elGridWrap.clientHeight
      };
    })()`
  });

  console.log('Metrics at 1440x750 (laptop with browser chrome):', JSON.stringify(eval1.result.result.value, null, 2));

  const shot = await call('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(ARTIFACTS_DIR, `approach1_1440x750.png`);
  fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));

  // Test scrolling down inside gridWrap
  await call('Runtime.evaluate', {
    expression: `(() => {
      const wrap = document.querySelector('.dispensers-grid-wrapper');
      if (wrap) wrap.scrollTop = 250;
    })()`
  });
  await sleep(400);

  const shotScrolled = await call('Page.captureScreenshot', { format: 'png' });
  const shotScrolledPath = path.join(ARTIFACTS_DIR, `approach1_1440x750_scrolled.png`);
  fs.writeFileSync(shotScrolledPath, Buffer.from(shotScrolled.result.data, 'base64'));

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
