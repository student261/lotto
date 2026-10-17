import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9252;
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

  // Apply the CSS
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
      }
      .card-all-boxes-map {
        flex-shrink: 0 !important;
        margin-top: 8px !important;
        margin-bottom: 0 !important;
        padding: 0.65rem 1.25rem !important;
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

  await sleep(400);

  // Click on Day Report in sidebar
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('navDayReport').click();
    })()`
  });

  await sleep(600);

  const dayReportEval = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elMain = document.querySelector('.pos-main-container');
      const elDR = document.getElementById('viewDayReport');
      return {
        mainScrollHeight: elMain.scrollHeight,
        mainClientHeight: elMain.clientHeight,
        canScrollDayReport: elMain.scrollHeight > elMain.clientHeight,
        drDisplay: window.getComputedStyle(elDR).display
      };
    })()`
  });

  console.log('Day Report navigation check:', JSON.stringify(dayReportEval.result.result.value, null, 2));

  // Click back to Sell Counter
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('navSellCounter').click();
    })()`
  });
  await sleep(400);

  const backEval = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elFooter = document.getElementById('cardAllBoxesMap');
      const r = elFooter.getBoundingClientRect();
      return {
        footerTop: r.top,
        footerBottom: r.bottom,
        windowH: window.innerHeight,
        inViewport: r.bottom <= window.innerHeight
      };
    })()`
  });

  console.log('Back to Sell Counter footer check:', JSON.stringify(backEval.result.result.value, null, 2));

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
