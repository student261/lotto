import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9780;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('========================================================');
  console.log('   RUNNING PHASE 5 REMAINING SCREENS TEST SUITE         ');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1920,1080',
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

    async function evalInPage(expression) {
      const res = await call('Runtime.evaluate', {
        returnByValue: true,
        expression
      });
      return res.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await sleep(1500);

    // 1. Inventory View verification
    console.log('--- Test Group 1: Inventory View Modern Styling ---');
    const invRes = await evalInPage(`(() => {
      document.querySelector('#navInventory')?.click();
      const view = document.getElementById('viewInventory');
      const font = window.getComputedStyle(view).fontFamily;
      const isVisible = window.getComputedStyle(view).display !== 'none';
      return { isVisible, font };
    })()`);
    assert(invRes?.isVisible, 'Inventory view navigates and is visible');
    assert(invRes?.font?.includes('Figtree'), 'Inventory view uses Figtree font');

    // 2. Reports / History View verification
    console.log('\n--- Test Group 2: History & Reports Modern Styling ---');
    const repRes = await evalInPage(`(() => {
      document.querySelector('#navHistory')?.click();
      const view = document.getElementById('viewHistory');
      const font = window.getComputedStyle(view).fontFamily;
      const isVisible = window.getComputedStyle(view).display !== 'none';
      return { isVisible, font };
    })()`);
    assert(repRes?.isVisible, 'History view navigates and is visible');
    assert(repRes?.font?.includes('Figtree'), 'History view uses Figtree font');

    // 3. Close Shift Page verification
    console.log('\n--- Test Group 3: Close Shift Page Modern Styling ---');
    const csRes = await evalInPage(`(() => {
      if (typeof window.showCloseShiftView === 'function') window.showCloseShiftView();
      const view = document.getElementById('viewCloseShift');
      const font = window.getComputedStyle(view).fontFamily;
      const isVisible = window.getComputedStyle(view).display !== 'none';
      return { isVisible, font };
    })()`);
    assert(csRes?.isVisible, 'Close Shift page displays and is visible');
    assert(csRes?.font?.includes('Figtree'), 'Close Shift page uses Figtree font');

    // 4. Return to Sell Counter
    await evalInPage(`(() => {
      if (typeof window.showSellCounterView === 'function') window.showSellCounterView();
      else document.querySelector('#navSellCounter')?.click();
    })()`);
    await sleep(200);

  } finally {
    p.kill();
  }

  console.log('\n========================================================');
  console.log(`   PHASE 5 RESULTS: Passed: ${passed}, Failed: ${failed}   `);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
