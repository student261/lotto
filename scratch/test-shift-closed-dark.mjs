import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9234;

function sleep(ms) {
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

  await sleep(2000);

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) {
      cbs.get(d.id)(d);
      cbs.delete(d.id);
    }
  };
  await new Promise(r => ws.onopen = r);

  function call(method, params = {}) {
    return new Promise(res => {
      const reqId = id++;
      cbs.set(reqId, res);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await call('Page.enable');

  // Set dark mode
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('lotto_theme', 'dark');
    })()`
  });
  await sleep(300);

  // Click End shift
  await call('Runtime.evaluate', {
    expression: `document.getElementById('mainShiftActionBtn')?.click();`
  });
  await sleep(500);

  // Close shift on screen 03
  await call('Runtime.evaluate', {
    expression: `document.getElementById('csPrimaryActionBtn')?.click();`
  });
  await sleep(500);

  // Screen 04 dark screenshot
  let ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screen04-dark.png', Buffer.from(ss.result.data, 'base64'));

  // Click Start Shift #2 to go to Screen 05 (Handover)
  await call('Runtime.evaluate', {
    expression: `document.getElementById('btnStartNewShift')?.click();`
  });
  await sleep(500);

  // Screen 05 dark screenshot
  ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/screen05-dark.png', Buffer.from(ss.result.data, 'base64'));

  console.log('Saved scratch/screen04-dark.png and scratch/screen05-dark.png');
  p.kill();
}

run().catch(console.error);
