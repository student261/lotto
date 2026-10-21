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
    'http://localhost:5173'
  ]);

  try {
    await sleep(2000);

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

    // Emulate 1400 x 600 or 1440 x 640 (exact proportion of user screenshot)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 640,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1000);

    // Capture screenshot
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const b64 = shot.result ? shot.result.data : shot.data;
    fs.writeFileSync('scratch/dashboard-target-view.png', Buffer.from(b64, 'base64'));
    console.log('Saved scratch/dashboard-target-view.png');

    ws.close();
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    chromeProc.kill();
  }
}

run();
