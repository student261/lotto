import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;

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

  const VIEWS = [
    { id: 'navSellCounter', name: 'sell-counter' },
    { id: 'navReceivePacks', name: 'receive-packs' },
    { id: 'navInventory', name: 'inventory' },
    { id: 'navDayReport', name: 'day-report' },
    { id: 'navHistory', name: 'history' },
    { id: 'navSettings', name: 'settings' }
  ];

  const SIZES = [
    { w: 375, h: 812, name: '375' },
    { w: 768, h: 1024, name: '768' },
    { w: 1200, h: 800, name: '1200' },
    { w: 2560, h: 1440, name: '2560' }
  ];

  for (const size of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: size.w,
      height: size.h,
      deviceScaleFactor: 1,
      mobile: size.w <= 768
    });
    await sleep(200);

    for (const v of VIEWS) {
      await send('Runtime.evaluate', {
        expression: `document.getElementById('${v.id}')?.click()`
      });
      await sleep(300);

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot.result && shot.result.data) {
        fs.writeFileSync(`scratch/${v.name}_${size.name}.png`, Buffer.from(shot.result.data, 'base64'));
        console.log(`Captured scratch/${v.name}_${size.name}.png`);
      }
    }
  }

  // Also test Cashier Modal on 375 and 1200
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await send('Runtime.evaluate', { expression: `document.getElementById('navSellCounter')?.click(); setTimeout(() => document.querySelector('.box-card')?.click(), 100);` });
  await sleep(400);
  const shotModal375 = await send('Page.captureScreenshot', { format: 'png' });
  if (shotModal375.result && shotModal375.result.data) {
    fs.writeFileSync(`scratch/modal_cashier_375.png`, Buffer.from(shotModal375.result.data, 'base64'));
  }

  ws.close();
  chromeProc.kill();
  console.log('Done capturing views!');
}

run().catch(console.error);
