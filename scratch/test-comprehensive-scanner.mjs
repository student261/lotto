import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9247;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Comprehensive Barcode Scanning Audit ===');

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2500);

    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const cbs = new Map();
    const consoleLogs = [];

    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push({ type: d.params.type, args: d.params.args.map(a => a.value) });
      }
      if (d.method === 'Runtime.exceptionThrown') {
        console.error('Browser Exception:', JSON.stringify(d.params.exceptionDetails));
      }
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

    async function evaluate(expression) {
      const resp = await call('Runtime.evaluate', { expression, returnByValue: true });
      return resp.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Helper: Simulate scanning via barcode input
    async function scanViaInput(barcode) {
      return await evaluate(`
        (() => {
          const input = document.getElementById('barcodeInput');
          if (!input) return { error: 'barcodeInput not found' };
          input.focus();
          input.value = ${JSON.stringify(barcode)};
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
          return { success: true };
        })()
      `);
    }

    // Helper: Simulate hardware scanner (rapid keystrokes + Enter)
    async function scanViaHardware(barcode) {
      return await evaluate(`
        new Promise(resolve => {
          const s = ${JSON.stringify(barcode)};
          for (let i = 0; i < s.length; i++) {
            window.dispatchEvent(new KeyboardEvent('keydown', {
              key: s[i],
              code: 'Key' + s[i].toUpperCase(),
              bubbles: true,
              cancelable: true
            }));
          }
          setTimeout(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
              cancelable: true
            }));
            resolve(true);
          }, 30);
        })
      `);
    }

    async function getStateSnapshot() {
      return await evaluate(`
        (() => {
          const scanTitle = document.getElementById('scanActionTitle')?.textContent;
          const lastScan = document.getElementById('lastScanDisplay')?.textContent;
          const stat = document.getElementById('largeStatReadout')?.textContent;
          const setTixModalOpen = document.getElementById('setTicketDetailsModal')?.open || false;
          const setBoxModalOpen = document.getElementById('setBoxModal')?.open || false;
          const activationModalOpen = document.getElementById('activationModal')?.open || false;
          const toast = document.querySelector('.toast-container')?.textContent?.trim() || document.querySelector('.toast')?.textContent?.trim() || '';
          
          return { scanTitle, lastScan, stat, setTixModalOpen, setBoxModalOpen, activationModalOpen, toast };
        })()
      `);
    }

    console.log('\n--- Initial UI State ---');
    console.log(await getStateSnapshot());

    // Test 1: Scan active ticket in default rack: 5X Money (Box 1, pack 128842)
    console.log('\n--- Test 1: Scan 5X Money (Box 1 ticket) ---');
    // In default state, Box 1 is 5X Money, pack 128842.
    // Let's scan a ticket matching Box 1: 1417 (game) + 128842 (pack) + 0 (check) + 014 (ticket) = 14171288420014
    await scanViaHardware('14171288420014');
    await sleep(400);
    console.log('Result of 14171288420014 scan:', await getStateSnapshot());

    // Test 2: Scan Epic Riches (Game 1648) from test sheet: 16480183788000
    console.log('\n--- Test 2: Scan 16480183788000 (Epic Riches #000 - Not in default rack) ---');
    await scanViaHardware('16480183788000');
    await sleep(400);
    console.log('Result of 16480183788000 scan:', await getStateSnapshot());

    // Check what modal opened
    const modalCheck = await evaluate(`
      (() => {
        const m1 = document.getElementById('setTicketDetailsModal');
        const m2 = document.getElementById('setBoxModal');
        const m3 = document.getElementById('activationModal');
        return {
          setTicketDetailsModal: {
            open: m1?.open,
            barcodeDisplay: document.getElementById('setTicketBarcodeDisplay')?.textContent,
            gameName: document.getElementById('setBoxGameNameInput')?.value,
            price: document.getElementById('setBoxPriceInput')?.value
          },
          setBoxModal: { open: m2?.open },
          activationModal: { open: m3?.open }
        };
      })()
    `);
    console.log('Modal details for 16480183788000:', JSON.stringify(modalCheck, null, 2));

    // Test 3: Close modal and scan hyphenated format: 1417-067017-0-009(290)
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());`);
    await sleep(300);

    console.log('\n--- Test 3: Scan 1417-067017-0-009(290) ---');
    await scanViaInput('1417-067017-0-009(290)');
    await sleep(400);
    console.log('Result of 1417-067017-0-009(290):', await getStateSnapshot());

    // Test 4: Scan 24-digit 2D barcode: 141706701700098494869032
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());`);
    await sleep(300);

    console.log('\n--- Test 4: Scan 24-digit 2D barcode: 141706701700098494869032 ---');
    await scanViaInput('141706701700098494869032');
    await sleep(400);
    console.log('Result of 24-digit 2D scan:', await getStateSnapshot());

    // Test 5: Scan Box barcode: BOX-02
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());`);
    await sleep(300);

    console.log('\n--- Test 5: Scan BOX-02 ---');
    await scanViaInput('BOX-02');
    await sleep(400);
    console.log('Result of BOX-02:', await getStateSnapshot());

    // Test 6: Scan Retail merchandise: 012345678905
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close());`);
    await sleep(300);

    console.log('\n--- Test 6: Scan Retail UPC: 012345678905 ---');
    await scanViaInput('012345678905');
    await sleep(400);
    console.log('Result of retail UPC:', await getStateSnapshot());

    // Test 7: Navigate to Inventory View and test scanning
    console.log('\n--- Test 7: Navigate to Inventory View and Scan ---');
    await evaluate(`
      (() => {
        const navInv = document.getElementById('navInventory');
        if (navInv) navInv.click();
      })()
    `);
    await sleep(500);

    const invViewCheck = await evaluate(`
      (() => {
        const viewInv = document.getElementById('viewInventory');
        const viewSell = document.getElementById('viewSellCounter');
        const banner = document.getElementById('invUpdateBanner');
        return {
          viewInvDisplay: viewInv ? window.getComputedStyle(viewInv).display : 'none',
          viewSellDisplay: viewSell ? window.getComputedStyle(viewSell).display : 'none',
          invUpdateBannerDisplay: banner ? window.getComputedStyle(banner).display : 'none'
        };
      })()
    `);
    console.log('Inventory View Display:', invViewCheck);

    // Scan a pack barcode while on Inventory view: 16480183788
    console.log('Scanning 16480183788 while on Inventory view...');
    await scanViaHardware('16480183788');
    await sleep(500);

    const invPostScan = await evaluate(`
      (() => {
        const viewInv = document.getElementById('viewInventory');
        const viewSell = document.getElementById('viewSellCounter');
        const setTix = document.getElementById('setTicketDetailsModal');
        const addedEl = document.getElementById('invAddedCount');
        const inStockRows = document.querySelectorAll('#invTableBody tr').length;
        const toast = document.querySelector('.toast-container')?.textContent?.trim() || '';
        return {
          viewInvDisplay: viewInv ? window.getComputedStyle(viewInv).display : 'none',
          setTixModalOpen: setTix?.open || false,
          addedCount: addedEl?.textContent,
          inStockRows,
          toast
        };
      })()
    `);
    console.log('Post-scan on Inventory view:', invPostScan);

    // Capture screenshot
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/comprehensive_scan_audit.png', Buffer.from(shot.result.data, 'base64'));

    console.log('\n=== AUDIT COMPLETE ===');
  } finally {
    p.kill();
  }
}

run().catch(console.error);
