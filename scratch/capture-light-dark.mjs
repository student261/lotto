import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9229;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
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
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (m, params = {}) => new Promise(res => {
    const i = id++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === i) {
        ws.removeEventListener('message', handler);
        res(d);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: i, method: m, params }));
  });

  await send('Page.enable');

  // 1. Light Mode
  await send('Runtime.evaluate', { expression: "applyTheme('light', false);" });
  await sleep(500);
  const ssLight = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/light-mode.png', Buffer.from(ssLight.result.data, 'base64'));

  // 2. Dark Mode
  await send('Runtime.evaluate', { expression: "applyTheme('dark', false);" });
  await sleep(500);
  const ssDark = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/dark-mode.png', Buffer.from(ssDark.result.data, 'base64'));

  p.kill();
  console.log('Saved scratch/light-mode.png and scratch/dark-mode.png');
}

run().catch(console.error);
