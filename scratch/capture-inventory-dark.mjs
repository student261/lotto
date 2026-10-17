import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9239;

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

  await sleep(1500);
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('lotto_theme', 'dark');
      if (typeof window.showInventoryView === 'function') {
        window.showInventoryView();
      } else {
        document.getElementById('navInventory')?.click();
      }
    })()`
  });
  await sleep(1000);

  let ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/inventory-dark-updated.png', Buffer.from(ss.result.data, 'base64'));
  console.log('Saved scratch/inventory-dark-updated.png');
  p.kill();
}

run().catch(console.error);
