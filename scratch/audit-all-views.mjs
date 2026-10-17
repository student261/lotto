import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9231;

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

  async function checkNavView(name, navSelector) {
    // Light
    await call('Runtime.evaluate', {
      expression: `(() => {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('lotto_theme', 'light');
        document.querySelector('${navSelector}')?.click();
      })()`
    });
    await sleep(400);
    let ss = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`scratch/test-${name}-light.png`, Buffer.from(ss.result.data, 'base64'));

    // Dark
    await call('Runtime.evaluate', {
      expression: `(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('lotto_theme', 'dark');
      })()`
    });
    await sleep(400);
    ss = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`scratch/test-${name}-dark.png`, Buffer.from(ss.result.data, 'base64'));
    console.log(`Captured ${name} light & dark`);
  }

  await checkNavView('sell-counter', '#navSellCounter');
  await checkNavView('inventory', '#navInventory');
  await checkNavView('day-report', '#navDayReport');
  await checkNavView('settings', '#navSettings');

  p.kill();
}

run().catch(console.error);
