import { spawn } from 'child_process';
import fs from 'fs';

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

  const BREAKPOINTS = [
    { name: 'close-shift-1200', width: 1200, height: 800 },
    { name: 'close-shift-768', width: 768, height: 1024 },
    { name: 'close-shift-375', width: 375, height: 812, mobile: true }
  ];

  for (const bp of BREAKPOINTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: bp.width,
      height: bp.height,
      deviceScaleFactor: 1,
      mobile: bp.mobile || false
    });
    await sleep(400);

    // Click End Shift
    await send('Runtime.evaluate', {
      expression: `document.getElementById('mainShiftActionBtn')?.click();`
    });
    await sleep(400);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`scratch/${bp.name}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log(`Saved scratch/${bp.name}.png`);
  }

  ws.close();
  chromeProc.kill();
}

run().catch(console.error);
