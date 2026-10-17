import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9230;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

  await sleep(2000);

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

  // Ensure Light Mode first
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('lotto_theme', 'light');
    })()`
  });
  await sleep(500);

  // Capture light
  let ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/view-light.png', Buffer.from(ss.result.data, 'base64'));

  // Toggle to dark mode by clicking the actual toggle button
  const toggleRes = await call('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.click();
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        themeText: document.getElementById('themeToggleText')?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log('Toggled to dark:', toggleRes.result.value);

  await sleep(600);

  // Inspect computed styles in dark mode
  const inspectRes = await call('Runtime.evaluate', {
    expression: `(() => {
      function get(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.border,
          boxShadow: cs.boxShadow
        };
      }
      return {
        mainShiftBtn: get(document.getElementById('mainShiftActionBtn')),
        btnHeaderReport: get(document.getElementById('btnHeaderReport')),
        btnHeaderRefresh: get(document.getElementById('btnHeaderRefresh')),
        scannerBox: get(document.querySelector('.header-scanner-box')),
        lastScanCard: get(document.getElementById('lastScanReadoutContainer')),
        lastScanTitle: get(document.querySelector('.header-last-scan-game')),
        sidebar: get(document.querySelector('.pos-sidebar')),
        sidebarPill: get(document.getElementById('sidebarUserPill')),
        rackHeading: get(document.querySelector('.rack-main-heading')),
        firstBox: get(document.querySelector('.box-card.active'))
      };
    })()`,
    returnByValue: true
  });
  console.log('Dark styles:', JSON.stringify(inspectRes.result.value, null, 2));

  // Capture dark
  ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/view-dark.png', Buffer.from(ss.result.data, 'base64'));

  console.log('Saved scratch/view-light.png and scratch/view-dark.png');
  p.kill();
}

run().catch(console.error);
