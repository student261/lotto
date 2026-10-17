import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9226;

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

  // 1. Reset state to clean default so shift = 1
  console.log('--- STEP 1: Initializing Sell Counter (Shift #1) ---');
  const initState = await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.clear();
      location.reload();
      return 'RELOADED';
    })()`,
    returnByValue: true
  });
  console.log('Reset result:', initState.result.value);

  await sleep(1500);

  const checkShift1 = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        shiftBadge: document.getElementById('shiftStatusText')?.textContent,
        subtitle: document.getElementById('sellCounterSubtitle')?.textContent,
        headline: document.getElementById('shiftHeadlineText')?.textContent,
        sidebarRole: document.getElementById('sidebarUserRole')?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log('Initial Shift 1 state:', checkShift1.result.value);

  // 2. Click "End Shift" on Sell Counter
  console.log('--- STEP 2: Clicking End Shift button ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('mainShiftActionBtn')?.click();
      return 'CLICKED_END_SHIFT';
    })()`
  });
  await sleep(600);

  // 3. Verify Screen 03 (viewCloseShift) is visible
  const checkCloseScreen = await send('Runtime.evaluate', {
    expression: `(() => {
      const vClose = document.getElementById('viewCloseShift');
      const vSell = document.getElementById('viewSellCounter');
      return {
        vCloseDisplay: window.getComputedStyle(vClose).display,
        vSellDisplay: window.getComputedStyle(vSell).display,
        primaryBtnText: document.getElementById('csPrimaryActionBtn')?.textContent?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('Close Shift screen state:', checkCloseScreen.result.value);

  // 4. Click #csPrimaryActionBtn to close shift and proceed to Screen 04
  console.log('--- STEP 3: Clicking csPrimaryActionBtn to close Shift #1 ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('csPrimaryActionBtn')?.click();
      return 'CLICKED_PRIMARY_ACTION';
    })()`
  });
  await sleep(600);

  // 5. Check Screen 04 (viewShiftClosed)
  console.log('--- STEP 4: Verifying Screen 04 (viewShiftClosed) ---');
  const checkScreen04 = await send('Runtime.evaluate', {
    expression: `(() => {
      const vClosed = document.getElementById('viewShiftClosed');
      const vClose = document.getElementById('viewCloseShift');
      const vSell = document.getElementById('viewSellCounter');
      return {
        vClosedDisplay: window.getComputedStyle(vClosed).display,
        vCloseDisplay: window.getComputedStyle(vClose).display,
        vSellDisplay: window.getComputedStyle(vSell).display,
        scHeaderTitle: document.getElementById('scHeaderTitle')?.textContent,
        scHeaderSub: document.getElementById('scHeaderSub')?.textContent,
        scMainHeadline: document.getElementById('scMainHeadline')?.textContent,
        scMainSubtext: document.getElementById('scMainSubtext')?.textContent,
        scCardSales: document.getElementById('scCardSales')?.textContent,
        scCardEmailLabel: document.getElementById('scCardEmailLabel')?.textContent,
        btnCountCashPrint: document.getElementById('btnCountCashPrint')?.textContent?.trim(),
        scBtnStartNextLabel: document.getElementById('scBtnStartNextLabel')?.textContent?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log('Screen 04 elements:', checkScreen04.result.value);

  // Capture screenshot of Screen 04
  const ssScreen04 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screen04-shift-closed.png', Buffer.from(ssScreen04.result.data, 'base64'));
  console.log('Saved scratch/screen04-shift-closed.png');

  // 6. Click "Start Shift #2" (#btnStartNewShift)
  console.log('--- STEP 5: Clicking [Start Shift #2] (#btnStartNewShift) ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('btnStartNewShift')?.click();
      return 'CLICKED_START_NEXT_SHIFT';
    })()`
  });
  await sleep(600);

  // 7. Verify Shift #2 is active on Sell Counter
  console.log('--- STEP 6: Verifying Shift #2 active on Sell Counter ---');
  const checkShift2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const vSell = document.getElementById('viewSellCounter');
      const vClosed = document.getElementById('viewShiftClosed');
      return {
        vSellDisplay: window.getComputedStyle(vSell).display,
        vClosedDisplay: window.getComputedStyle(vClosed).display,
        shiftBadge: document.getElementById('shiftStatusText')?.textContent,
        subtitle: document.getElementById('sellCounterSubtitle')?.textContent,
        headline: document.getElementById('shiftHeadlineText')?.textContent,
        sidebarRole: document.getElementById('sidebarUserRole')?.textContent,
        mainShiftBtnLabel: document.getElementById('mainShiftBtnLabel')?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log('Shift 2 Sell Counter state:', checkShift2.result.value);

  // Capture screenshot of Sell Counter in Shift #2
  const ssShift2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/sell-counter-shift2.png', Buffer.from(ssShift2.result.data, 'base64'));
  console.log('Saved scratch/sell-counter-shift2.png');

  // 8. Close Chrome
  chromeProc.kill();
  console.log('--- AUDIT TEST COMPLETE ---');
}

run().catch(console.error);
