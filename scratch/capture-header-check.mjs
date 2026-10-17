import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;

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
    await sleep(2000);

    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await res.json();
    const page = targets.find(t => t.type === 'page');
    if (!page) {
      console.error('No page target found');
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

    const SIZES = [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1200, height: 800 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 }
    ];

    for (const size of SIZES) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: size.width,
        height: size.height,
        deviceScaleFactor: 1,
        mobile: size.width <= 768
      });
      await sleep(400);

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot.result && shot.result.data) {
        fs.writeFileSync(`scratch/header_check_${size.width}.png`, Buffer.from(shot.result.data, 'base64'));
        console.log(`Saved scratch/header_check_${size.width}.png`);
      }
    }
    ws.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch(console.error);
