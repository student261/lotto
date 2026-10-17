import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9230;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const chromeProc = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
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

  // Scroll all the way to the bottom of .pos-main-container
  await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.pos-main-container');
      c.scrollTop = c.scrollHeight;
    })()`
  });

  await sleep(400);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/sell-counter-bottom-fixed.png', Buffer.from(shot.result.data, 'base64'));
  console.log('Saved scratch/sell-counter-bottom-fixed.png');

  ws.close();
  chromeProc.kill();
}

run().catch(console.error);
