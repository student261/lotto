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

  await sleep(800);

  // Click End Shift
  await send('Runtime.evaluate', {
    expression: `document.getElementById('mainShiftActionBtn')?.click();`
  });
  await sleep(500);

  // Scroll down pos-main-container to see Box 16, 21, 22, 27, 60
  await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('.pos-main-container') || document.documentElement || document.body;
      el.scrollTop = 550;
      window.scrollTo(0, 550);
    })()`
  });
  await sleep(500);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/close-shift-bottom-rows.png', Buffer.from(shot.result.data, 'base64'));

  ws.close();
  chromeProc.kill();
}

run().catch(console.error);
