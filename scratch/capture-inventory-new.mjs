import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9228;

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
    'http://localhost:5173/#inventory'
  ]);

  try {
    await sleep(2500);

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

    async function evaluate(expression) {
      const resp = await send('Runtime.evaluate', { expression, returnByValue: true });
      return resp.result?.result?.value;
    }

    await send('Page.enable');
    await send('DOM.enable');

    // Set viewport to 1440 x 700 to match reference screen exactly
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 650,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1000);

    // Make sure we are on the inventory screen
    await evaluate(`
      if (typeof window.showInventoryView === 'function') {
        window.showInventoryView();
      } else {
        document.getElementById('navInventory')?.click();
      }
    `);
    await sleep(500);

    // 1. Capture Normal Inventory View (Image 1 State)
    console.log('Capturing normal Inventory view (Image 1)...');
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/inventory-view-normal.png', Buffer.from(snap1.result.data, 'base64'));
    console.log('Saved scratch/inventory-view-normal.png');

    // 2. Click "Update Inventory" to open banner (Image 2 State)
    console.log('Clicking Update Inventory button...');
    await evaluate(`document.getElementById('invBtnToggleUpdateInventory')?.click()`);
    await sleep(400);

    const bannerDisplay = await evaluate(`document.getElementById('invUpdateBanner')?.style.display`);
    console.log('Banner display is:', bannerDisplay);

    console.log('Capturing Update Inventory mode view (Image 2)...');
    const snap2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/inventory-view-update-banner.png', Buffer.from(snap2.result.data, 'base64'));
    console.log('Saved scratch/inventory-view-update-banner.png');

    // 3. Click one of the demo chips: 1415-560411-000
    console.log('Clicking demo chip 1415-560411-000...');
    await evaluate(`
      const chip = document.querySelector('.inv-demo-chip[data-barcode="1415-560411-000"]');
      if (chip) chip.click();
    `);
    await sleep(400);

    const addedCount = await evaluate(`document.getElementById('invAddedCount')?.textContent`);
    const inStockBadge = await evaluate(`document.getElementById('invBadgeInStock')?.textContent`);
    console.log('Added count in banner:', addedCount);
    console.log('In stock badge in tabs:', inStockBadge);

    const snap3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/inventory-view-pack-added.png', Buffer.from(snap3.result.data, 'base64'));
    console.log('Saved scratch/inventory-view-pack-added.png');

    ws.close();
  } catch (err) {
    console.error('Error in capture:', err);
  } finally {
    chromeProc.kill();
  }
}

run();
