import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9246;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Testing Barcode Scanning Functionality ===');

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

    async function evaluate(expression) {
      const resp = await call('Runtime.evaluate', { expression, returnByValue: true });
      return resp.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await call('Input.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Test 1: Check barcodeInput element exists and is visible
    const inputCheck = await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        if (!input) return { exists: false };
        const style = window.getComputedStyle(input);
        const wrap = input.closest('.dashboard-scanner-input-wrap');
        const wrapStyle = wrap ? window.getComputedStyle(wrap) : null;
        return {
          exists: true,
          display: style.display,
          visibility: style.visibility,
          wrapDisplay: wrapStyle?.display,
          wrapVisibility: wrapStyle?.visibility,
          disabled: input.disabled,
          readOnly: input.readOnly,
          type: input.type,
          placeholder: input.placeholder,
          value: input.value
        };
      })()
    `);
    console.log('Test 1 - barcodeInput element:', JSON.stringify(inputCheck, null, 2));

    // Test 2: Simulate typing a barcode into the input and pressing Enter
    await evaluate(`
      const input = document.getElementById('barcodeInput');
      if (input) {
        input.focus();
        input.value = '1417012884200013';
      }
    `);
    await sleep(200);
    
    // Check the input value is set
    const inputVal = await evaluate(`document.getElementById('barcodeInput')?.value`);
    console.log('Input value after setting:', inputVal);

    // Test 3: Dispatch Enter keydown on barcodeInput
    const preState = await evaluate(`
      (() => {
        const scanTitle = document.getElementById('scanActionTitle')?.textContent;
        const lastScan = document.getElementById('lastScanDisplay')?.textContent;
        const stat = document.getElementById('largeStatReadout')?.textContent;
        return { scanTitle, lastScan, stat };
      })()
    `);
    console.log('Pre-scan state:', JSON.stringify(preState));

    // Dispatch Enter key on barcodeInput
    await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        if (input) {
          input.focus();
          input.value = '1417012884200013';
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        }
        return true;
      })()
    `);
    await sleep(500);

    const postState1 = await evaluate(`
      (() => {
        const scanTitle = document.getElementById('scanActionTitle')?.textContent;
        const lastScan = document.getElementById('lastScanDisplay')?.textContent;
        const stat = document.getElementById('largeStatReadout')?.textContent;
        const inputVal = document.getElementById('barcodeInput')?.value;
        return { scanTitle, lastScan, stat, inputVal };
      })()
    `);
    console.log('Post Enter dispatch state:', JSON.stringify(postState1));

    // Test 4: Try simulating hardware scanner via global keydown events
    // A hardware scanner sends rapid keydown events followed by Enter
    await evaluate(`
      (() => {
        const barcode = '1417012884200013';
        // Simulate rapid scanner keystrokes
        for (let i = 0; i < barcode.length; i++) {
          const ev = new KeyboardEvent('keydown', { 
            key: barcode[i], 
            code: 'Key' + barcode[i].toUpperCase(), 
            bubbles: true, 
            cancelable: true 
          });
          window.dispatchEvent(ev);
        }
        // Small delay then Enter
        setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { 
            key: 'Enter', 
            code: 'Enter', 
            bubbles: true, 
            cancelable: true 
          }));
        }, 50);
        return true;
      })()
    `);
    await sleep(800);

    const postState2 = await evaluate(`
      (() => {
        const scanTitle = document.getElementById('scanActionTitle')?.textContent;
        const lastScan = document.getElementById('lastScanDisplay')?.textContent;
        const stat = document.getElementById('largeStatReadout')?.textContent;
        const inputVal = document.getElementById('barcodeInput')?.value;
        return { scanTitle, lastScan, stat, inputVal };
      })()
    `);
    console.log('Post hardware-simulated scan state:', JSON.stringify(postState2));

    // Test 5: Check processScannedBarcode exists
    const fnCheck = await evaluate(`typeof processScannedBarcode`);
    console.log('processScannedBarcode type:', fnCheck);

    // Test 6: Direct call processScannedBarcode
    await evaluate(`processScannedBarcode('1417012884200013')`);
    await sleep(500);

    const postState3 = await evaluate(`
      (() => {
        const scanTitle = document.getElementById('scanActionTitle')?.textContent;
        const lastScan = document.getElementById('lastScanDisplay')?.textContent;
        const stat = document.getElementById('largeStatReadout')?.textContent;
        const inputVal = document.getElementById('barcodeInput')?.value;
        return { scanTitle, lastScan, stat, inputVal };
      })()
    `);
    console.log('Post direct processScannedBarcode call state:', JSON.stringify(postState3));

    // Screenshot
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/scan-test-result.png', Buffer.from(shot.result.data, 'base64'));
    console.log('Saved scratch/scan-test-result.png');

    // Test 7: Check if barcodeEnterBtn click works
    await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        if (input) {
          input.value = '1411018402200021';
          input.focus();
        }
      })()
    `);
    await sleep(100);
    await evaluate(`document.getElementById('barcodeEnterBtn')?.click()`);
    await sleep(500);

    const postState4 = await evaluate(`
      (() => {
        const scanTitle = document.getElementById('scanActionTitle')?.textContent;
        const lastScan = document.getElementById('lastScanDisplay')?.textContent;
        const stat = document.getElementById('largeStatReadout')?.textContent;
        const inputVal = document.getElementById('barcodeInput')?.value;
        return { scanTitle, lastScan, stat, inputVal };
      })()
    `);
    console.log('Post barcodeEnterBtn click state:', JSON.stringify(postState4));

    const shot2 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/scan-test-enter-btn.png', Buffer.from(shot2.result.data, 'base64'));
    console.log('Saved scratch/scan-test-enter-btn.png');

    console.log('\n=== SCAN DIAGNOSIS COMPLETE ===');
    ws.close();
  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
