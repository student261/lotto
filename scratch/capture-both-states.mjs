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
    'http://localhost:5173'
  ]);

  try {
    await sleep(2500);

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
      height: 640,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Evaluate alignment of Cancel and Undo
    const alignmentCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const cancel = document.getElementById('btnHeaderCancel');
          const undo = document.getElementById('undoActionBtn');
          const cancelRect = cancel.getBoundingClientRect();
          const undoRect = undo.getBoundingClientRect();
          const hasBackOffice = Array.from(document.querySelectorAll('.nav-group-title')).some(el => el.textContent.includes('BACK OFFICE'));
          return {
            cancelLeft: cancelRect.left,
            cancelRight: cancelRect.right,
            cancelWidth: cancelRect.width,
            undoLeft: undoRect.left,
            undoRight: undoRect.right,
            undoWidth: undoRect.width,
            diffLeft: Math.abs(cancelRect.left - undoRect.left),
            diffRight: Math.abs(cancelRect.right - undoRect.right),
            hasBackOffice
          };
        })()
      `,
      returnByValue: true
    });

    console.log('ALIGNMENT RESULT:', JSON.stringify(alignmentCheck.result?.value, null, 2));

    // Capture Normal State
    const normalShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/dashboard-normal-fixed.png', Buffer.from(normalShot.result.data, 'base64'));
    console.log('Saved scratch/dashboard-normal-fixed.png');

    // Click Update Inventory to activate mode
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btnUpdateInventoryCard').click();`
    });

    await sleep(600);

    // Capture Updating Inventory State
    const updatingShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/dashboard-updating-inventory.png', Buffer.from(updatingShot.result.data, 'base64'));
    console.log('Saved scratch/dashboard-updating-inventory.png');

    ws.close();
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    chromeProc.kill();
  }
}

run();
