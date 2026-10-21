import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9235;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    'http://localhost:5173/#inventory'
  ]);

  await sleep(2500);

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();

  const logs = [];
  const networkLogs = [];

  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) {
      cbs.get(d.id)(d);
      cbs.delete(d.id);
    }
    if (d.method === 'Console.messageAdded') logs.push(d.params.message);
    if (d.method === 'Network.responseReceived') {
      const resp = d.params.response;
      if (resp.url.includes('.css') || resp.url.includes('style')) {
        networkLogs.push({ url: resp.url, mimeType: resp.mimeType, status: resp.status });
      }
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

  await call('Network.enable');
  await call('Page.enable');
  await call('Console.enable');

  await call('Page.reload', { ignoreCache: true });
  await sleep(2000);

  // Navigate to inventory view
  await call('Runtime.evaluate', {
    expression: `
      if (typeof window.showInventoryView === 'function') {
        window.showInventoryView();
      } else {
        document.getElementById('navInventory')?.click();
      }
    `
  });
  await sleep(500);

  const check = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      tableBg: window.getComputedStyle(document.querySelector('.inv-modern-table'))?.backgroundColor,
      tableWidth: document.querySelector('.inv-modern-table')?.offsetWidth,
      titleFont: window.getComputedStyle(document.querySelector('.inv-page-title'))?.fontSize,
      btnBg: window.getComputedStyle(document.getElementById('invBtnAddNewBook'))?.backgroundColor,
      viewDisplay: window.getComputedStyle(document.getElementById('viewInventory'))?.display
    })`,
    returnByValue: true
  });

  console.log('STYLES CHECK:', check.result?.result?.value);
  console.log('CSS NETWORK RESPONSES:', JSON.stringify(networkLogs, null, 2));
  console.log('CONSOLE LOGS (ERRORS):', logs.filter(l => l.level === 'error').map(l => l.text));

  ws.close();
  p.kill();
}

run();
