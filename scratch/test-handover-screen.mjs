import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9227;

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

  // 1. Reset state
  console.log('1. Resetting state to clean default...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.clear();
      location.reload();
    })()`
  });
  await sleep(1500);

  // 2. Click End Shift on Sell Counter
  console.log('2. Clicking End Shift button on Sell Counter...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('mainShiftActionBtn')?.click();
    })()`
  });
  await sleep(500);

  // 3. Click Close Shift #1 on Screen 03
  console.log('3. Clicking csPrimaryActionBtn to close shift...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('csPrimaryActionBtn')?.click();
    })()`
  });
  await sleep(500);

  // 4. Click [Start Shift #2 ->] on Screen 04 to open Handover screen
  console.log('4. Clicking btnStartNewShift on Screen 04...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('btnStartNewShift')?.click();
    })()`
  });
  await sleep(600);

  // 5. Check Screen 05 visibility & elements
  console.log('5. Verifying Screen 05 (Handover screen)...');
  const checkScreen05 = await send('Runtime.evaluate', {
    expression: `(() => {
      const vHandover = document.getElementById('viewStartShiftHandover');
      const vClosed = document.getElementById('viewShiftClosed');
      const title = document.getElementById('sshHeaderTitle')?.textContent;
      const sub = document.getElementById('sshHeaderSub')?.textContent;
      const clerks = Array.from(document.querySelectorAll('#sshClerksGrid .ssh-clerk-name')).map(el => el.textContent);
      const prevShiftNum = document.getElementById('sshPrevShiftNumLabel')?.textContent;
      const prevShiftSales = document.getElementById('sshPrevShiftSalesLabel')?.textContent;
      const tableRows = document.querySelectorAll('#sshOpeningTableBody tr').length;
      const confirmLabel = document.getElementById('sshConfirmBtnLabel')?.textContent;
      return {
        vHandoverDisplay: window.getComputedStyle(vHandover).display,
        vClosedDisplay: window.getComputedStyle(vClosed).display,
        title,
        sub,
        clerks,
        prevShiftNum,
        prevShiftSales,
        tableRows,
        confirmLabel
      };
    })()`,
    returnByValue: true
  });
  console.log('Screen 05 Details:', checkScreen05.result.value);

  // 6. Capture screenshot of Screen 05
  const ssHandover = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screen05-handover.png', Buffer.from(ssHandover.result.data, 'base64'));
  console.log('Saved scratch/screen05-handover.png');

  // 7. Select Carlos and click Start Shift #2
  console.log('7. Selecting Carlos clerk card and clicking Start Shift #2...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const carlosCard = document.querySelector('#sshClerksGrid .ssh-clerk-card[data-cashier-name="Carlos"]');
      carlosCard?.click();
    })()`
  });
  await sleep(300);

  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('btnConfirmStartShiftHandover')?.click();
    })()`
  });
  await sleep(600);

  // 8. Verify Sell Counter active in Shift #2
  console.log('8. Verifying Sell Counter in Shift #2...');
  const checkSellCounter = await send('Runtime.evaluate', {
    expression: `(() => {
      const vSell = document.getElementById('viewSellCounter');
      const vHandover = document.getElementById('viewStartShiftHandover');
      return {
        vSellDisplay: window.getComputedStyle(vSell).display,
        vHandoverDisplay: window.getComputedStyle(vHandover).display,
        cashier: document.getElementById('sidebarUserName')?.textContent,
        role: document.getElementById('sidebarUserRole')?.textContent,
        subtitle: document.getElementById('sellCounterSubtitle')?.textContent
      };
    })()`,
    returnByValue: true
  });
  console.log('Sell Counter Shift 2 Details:', checkSellCounter.result.value);

  const ssSellCounter = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/sell-counter-shift2-handover.png', Buffer.from(ssSellCounter.result.data, 'base64'));
  console.log('Saved scratch/sell-counter-shift2-handover.png');

  chromeProc.kill();
  console.log('--- TEST RUN FINISHED ---');
}

run().catch(console.error);
