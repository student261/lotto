import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9225;

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
  if (!page) {
    console.error('No page target found');
    chromeProc.kill();
    return;
  }

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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  await sleep(1000);

  // 1. Click End Shift button
  console.log('1. Clicking #mainShiftActionBtn...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('mainShiftActionBtn');
      if (!btn) return 'NO_BTN';
      btn.click();
      return 'CLICKED';
    })()`
  });
  console.log('Click result:', clickRes.result.value);

  await sleep(600);

  // 2. Check if #viewCloseShift is visible
  const checkCloseView = await send('Runtime.evaluate', {
    expression: `(() => {
      const vClose = document.getElementById('viewCloseShift');
      const vSell = document.getElementById('viewSellCounter');
      return {
        closeDisplay: window.getComputedStyle(vClose).display,
        sellDisplay: window.getComputedStyle(vSell).display,
        rowCount: document.querySelectorAll('#csTableBody tr').length,
        sales: document.getElementById('csTotalsSales')?.textContent,
        tickets: document.getElementById('csTotalsTickets')?.textContent,
        problems: document.getElementById('csProblemCountBadge')?.textContent,
        progress: document.getElementById('csScannedCountText')?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log('Close view state:', checkCloseView.result.value);

  // 3. Capture initial Close Shift screenshot
  const screenshot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/close-shift-initial.png', Buffer.from(screenshot1.result.data, 'base64'));
  console.log('Saved scratch/close-shift-initial.png');

  // 4. Test clicking Back button
  console.log('4. Clicking back button #btnBackFromCloseShift...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('btnBackFromCloseShift')?.click();
    })()`
  });
  await sleep(400);

  const checkBackState = await send('Runtime.evaluate', {
    expression: `(() => {
      const vClose = document.getElementById('viewCloseShift');
      const vSell = document.getElementById('viewSellCounter');
      return {
        closeDisplay: window.getComputedStyle(vClose).display,
        sellDisplay: window.getComputedStyle(vSell).display
      };
    })()`,
    returnByValue: true
  });
  console.log('After back button:', checkBackState.result.value);

  // 5. Click End Shift again to return to Close Shift view
  console.log('5. Clicking End Shift again...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('mainShiftActionBtn')?.click();
    })()`
  });
  await sleep(400);

  // 6. Test Prototype Scan Button
  console.log('6. Clicking Prototype: scan next...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('csProtoScanBtn')?.click();
    })()`
  });
  await sleep(400);

  const checkScannedState = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        sales: document.getElementById('csTotalsSales')?.textContent,
        tickets: document.getElementById('csTotalsTickets')?.textContent,
        problems: document.getElementById('csProblemCountBadge')?.textContent,
        progress: document.getElementById('csScannedCountText')?.textContent,
        primaryBtn: document.getElementById('csPrimaryActionBtn')?.textContent?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('After proto scan:', checkScannedState.result.value);

  // 7. Capture scanned screenshot
  const screenshot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/close-shift-scanned.png', Buffer.from(screenshot2.result.data, 'base64'));
  console.log('Saved scratch/close-shift-scanned.png');

  ws.close();
  chromeProc.kill();
  console.log('Done!');
}

run().catch(console.error);
