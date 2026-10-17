import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9255;
const ARTIFACTS_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\2da9a679-e8a6-4567-8bc5-b56d1d96835d";

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

  await sleep(2500);

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

  // 1. Check visible sidebar items
  const sidebarCheck = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('.sidebar-nav-item')).map(el => {
        const cs = window.getComputedStyle(el);
        const span = el.querySelector('span');
        return {
          id: el.id,
          title: el.getAttribute('title') || (span ? span.textContent : ''),
          display: cs.display,
          visible: cs.display !== 'none' && el.offsetHeight > 0
        };
      });
      return items;
    })()`
  });

  console.log('Sidebar items:', JSON.stringify(sidebarCheck.result.result.value, null, 2));

  // Take screenshot of Sell Counter with streamlined sidebar
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'clean_sidebar_sell_counter.png'), Buffer.from(shot.result.data, 'base64'));

  // 2. Click Inventory in sidebar
  await call('Runtime.evaluate', {
    expression: `document.getElementById('navInventory').click()`
  });
  await sleep(600);

  shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'clean_sidebar_inventory_view.png'), Buffer.from(shot.result.data, 'base64'));

  // 3. Click Stock Intake button in Inventory
  await call('Runtime.evaluate', {
    expression: `document.getElementById('invBtnStockIntake').click()`
  });
  await sleep(600);

  shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'clean_sidebar_stock_intake_view.png'), Buffer.from(shot.result.data, 'base64'));

  // 4. Click Back to Inventory
  await call('Runtime.evaluate', {
    expression: `document.getElementById('btnBackToInventoryFromRp').click()`
  });
  await sleep(500);

  // 5. Click Sell Counter
  await call('Runtime.evaluate', {
    expression: `document.getElementById('navSellCounter').click()`
  });
  await sleep(500);

  // 6. Click top header Report button
  await call('Runtime.evaluate', {
    expression: `document.getElementById('btnHeaderReport').click()`
  });
  await sleep(600);

  shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'clean_sidebar_day_report_view.png'), Buffer.from(shot.result.data, 'base64'));

  // 7. Click Back to Sell Counter from Day Report
  await call('Runtime.evaluate', {
    expression: `document.getElementById('btnBackToSellFromDr').click()`
  });
  await sleep(500);

  shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'clean_sidebar_back_to_sell.png'), Buffer.from(shot.result.data, 'base64'));

  console.log('All visual flows captured successfully!');

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
