import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9228;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const chromeProc = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

  await sleep(1500);

  const res = await fetch(`http://127.0.0.1:${PORT}/json`);
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let idCounter = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data);
      callbacks.delete(data.id);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = idCounter++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('DOM.enable');

  // Toggle to dark mode
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('themeToggleBtn')?.click();
      const mainBtn = document.getElementById('mainShiftActionBtn');
      const repBtn = document.getElementById('btnHeaderReport');
      const refBtn = document.getElementById('btnHeaderRefresh');
      const scanBox = document.querySelector('.header-scanner-box');
      const lastScan = document.getElementById('lastScanReadoutContainer');
      const rack = document.querySelector('.card-all-boxes-map');
      const slot = document.querySelector('.dispenser-slot, .box-card');

      function getInfo(el) {
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          classes: el.className,
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.borderColor
        };
      }

      return {
        theme: document.documentElement.getAttribute('data-theme'),
        mainBtn: getInfo(mainBtn),
        repBtn: getInfo(repBtn),
        refBtn: getInfo(refBtn),
        scanBox: getInfo(scanBox),
        lastScan: getInfo(lastScan),
        rack: getInfo(rack),
        slot: getInfo(slot)
      };
    })()`,
    returnByValue: true
  });

  console.log('Dark mode computed styles:\n', JSON.stringify(evalRes.result.value, null, 2));

  // Take screenshot in dark mode
  const ss = await send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('fs');
  fs.writeFileSync('scratch/dark-mode-audit.png', Buffer.from(ss.result.data, 'base64'));
  console.log('Saved scratch/dark-mode-audit.png');

  chromeProc.kill();
}

run().catch(console.error);
