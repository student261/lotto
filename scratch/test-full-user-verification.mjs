import { spawn } from 'child_process';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9249;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== FULL USER VERIFICATION AUDIT ===');
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
    const errors = [];

    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push(d.params.exceptionDetails);
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

    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);

    // --- Scenario A: Accurate ticket selling & Already-sold check ---
    console.log('\n--- Scenario A: Accurate ticket selling & Already-sold check ---');
    // Check Box 1 current position:
    const b1Info = await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        const s = JSON.parse(localStorage.getItem('lottery_pos_state') || '{}');
        const b1 = (s.slots || []).find(x => x.boxNumber === 1) || {};
        return {
          currentTicket: b1.currentTicket || 13,
          packNumber: b1.packNumber || '128842'
        };
      })()
    `);
    console.log('Box 1 initial info:', b1Info);
    const curTix = b1Info.currentTicket;
    const nextBarcode1 = '1417128842' + String(curTix).padStart(4, '0'); // e.g. 14171288420013
    const nextBarcode2 = '1417128842' + String(curTix + 1).padStart(4, '0'); // e.g. 14171288420014

    // 1. Scan the next ticket in sequence
    console.log(`1. Scanning ticket #${curTix} (${nextBarcode1})...`);
    const scan0 = await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        const btn = document.getElementById('barcodeEnterBtn');
        input.value = ${JSON.stringify(nextBarcode1)};
        btn.click();
        return {
          lastScanDisplay: document.getElementById('lastScanDisplay')?.textContent,
          readout: document.getElementById('largeStatReadout')?.textContent,
          isAlert: document.getElementById('lastScanReadoutContainer')?.classList.contains('alert-yellow')
        };
      })()
    `);
    console.log(`After ticket #${curTix}:`, scan0);
    assert.equal(scan0.lastScanDisplay, `Box 1 · ticket ${String(curTix).padStart(3, '0')}`);
    assert.equal(scan0.readout, '1');
    assert.equal(scan0.isAlert, false);

    // 2. Scan the next ticket in sequence
    console.log(`2. Scanning ticket #${curTix + 1} (${nextBarcode2})...`);
    const scan1 = await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        const btn = document.getElementById('barcodeEnterBtn');
        input.value = ${JSON.stringify(nextBarcode2)};
        btn.click();
        return {
          lastScanDisplay: document.getElementById('lastScanDisplay')?.textContent,
          readout: document.getElementById('largeStatReadout')?.textContent,
          isAlert: document.getElementById('lastScanReadoutContainer')?.classList.contains('alert-yellow')
        };
      })()
    `);
    console.log(`After ticket #${curTix + 1}:`, scan1);
    assert.equal(scan1.lastScanDisplay, `Box 1 · ticket ${String(curTix + 1).padStart(3, '0')}`);
    assert.equal(scan1.readout, '1');
    assert.equal(scan1.isAlert, false);

    // 3. Scan ticket #${curTix} again -> should trigger ALREADY SOLD alert!
    console.log(`3. Scanning ticket #${curTix} again (already sold)...`);
    const scanDup = await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        const btn = document.getElementById('barcodeEnterBtn');
        input.value = ${JSON.stringify(nextBarcode1)};
        btn.click();
        return {
          title: document.getElementById('scanActionTitle')?.textContent,
          isAlert: document.getElementById('lastScanReadoutContainer')?.classList.contains('alert-yellow'),
          toast: document.querySelector('.toast-container')?.textContent?.trim() || ''
        };
      })()
    `);
    console.log('After duplicate ticket scan:', scanDup);
    assert.equal(scanDup.isAlert, true, 'Should display alert yellow');
    assert.ok(scanDup.title.includes('ALREADY SOLD'), 'Title should show ALREADY SOLD');

    // --- Scenario B: Step 1 -> Step 2 -> Box Assignment ---
    console.log('\n--- Scenario B: Scan-to-Appear: Step 1 -> Step 2 -> Assign to Box 5 ---');
    // Scan unassigned ticket: 16480183788000 (Epic Riches #000)
    await evaluate(`
      (() => {
        const input = document.getElementById('barcodeInput');
        const btn = document.getElementById('barcodeEnterBtn');
        input.value = '16480183788000';
        btn.click();
      })()
    `);
    await sleep(400);

    const step1Check = await evaluate(`
      (() => {
        const modal1 = document.getElementById('setTicketDetailsModal');
        const display = document.getElementById('setTicketBarcodeDisplay')?.textContent;
        const name = document.getElementById('setBoxGameNameInput')?.value;
        const btnNext = document.getElementById('btnTicketDetailsNext');
        return {
          open: modal1?.open,
          display,
          name,
          hasNextBtn: !!btnNext
        };
      })()
    `);
    console.log('Step 1 modal state:', step1Check);
    assert.equal(step1Check.open, true, 'Step 1 modal should be open');
    assert.ok(step1Check.display.includes('1648'), 'Should show formatted barcode');

    // Advance to Step 2 (press Enter or click Next)
    console.log('Clicking Next on Step 1...');
    await evaluate(`document.getElementById('btnTicketDetailsNext').click();`);
    await sleep(400);

    const step2Check = await evaluate(`
      (() => {
        const modal1 = document.getElementById('setTicketDetailsModal');
        const modal2 = document.getElementById('setBoxModal');
        const boxInput = document.getElementById('setBoxNumberInput');
        return {
          modal1Open: modal1?.open,
          modal2Open: modal2?.open,
          suggestedBox: boxInput?.value
        };
      })()
    `);
    console.log('Step 2 modal state:', step2Check);
    assert.equal(step2Check.modal2Open, true, 'Step 2 modal should be open');

    // Confirm Box 5
    console.log('Assigning to Box 5...');
    await evaluate(`
      (() => {
        const boxInput = document.getElementById('setBoxNumberInput');
        if (boxInput) boxInput.value = '5';
        document.getElementById('btnSetBoxConfirm')?.click();
      })()
    `);
    await sleep(500);

    const rackCheck = await evaluate(`
      (() => {
        const card5 = Array.from(document.querySelectorAll('.box-card')).find(c => {
          const numEl = c.querySelector('.box-main-number');
          return numEl && numEl.textContent.trim() === '5';
        });
        const nameEl = card5?.querySelector('.game-title-strip')?.textContent;
        return {
          box5Found: !!card5,
          gameName: nameEl,
          modal2Open: document.getElementById('setBoxModal')?.open || false
        };
      })()
    `);
    console.log('Post-assignment rack state:', rackCheck);
    assert.equal(rackCheck.box5Found, true, 'Box 5 should now exist on the rack');
    assert.ok(rackCheck.gameName.includes('Epic Riches'), 'Box 5 should have Epic Riches');
    assert.equal(rackCheck.modal2Open, false, 'Modal should be closed');

    // --- Scenario C: Scanning in Close Shift view ---
    console.log('\n--- Scenario C: Scanning in Close Shift view ---');
    await evaluate(`window.showCloseShiftView();`);
    await sleep(400);

    const closeShiftPre = await evaluate(`
      (() => {
        const pack60 = window.closeShiftState.packs.find(p => p.box === 60);
        return {
          pack60Status: pack60?.status,
          pack60Closing: pack60?.closing
        };
      })()
    `);
    console.log('Pre-scan Close Shift Box 60:', closeShiftPre);

    // Scan BOX-60 in Close Shift
    await evaluate(`
      (() => {
        const input = document.getElementById('csBarcodeInput');
        input.value = 'BOX-60';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);

    const closeShiftPost = await evaluate(`
      (() => {
        const pack60 = window.closeShiftState.packs.find(p => p.box === 60);
        return {
          pack60Status: pack60?.status,
          pack60Closing: pack60?.closing,
          pack60Sold: pack60?.sold
        };
      })()
    `);
    console.log('Post-scan Close Shift Box 60:', closeShiftPost);
    assert.equal(closeShiftPost.pack60Status, 'scanned');

    console.log('\nTotal exceptions detected:', errors.length);
    assert.equal(errors.length, 0, 'Zero browser exceptions allowed');
    console.log('✓ ALL TEST ASSERTIONS PASSED!');
  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
