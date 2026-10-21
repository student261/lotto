import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9244;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Testing End Shift Workflow (Matching Images 1, 2, 3) ===');

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
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Step 0: Ensure on Sell Counter (Dashboard)
    await evaluate(`
      if (typeof window.showSellCounterView === 'function') {
        window.showSellCounterView();
      } else {
        document.getElementById('navSellCounter')?.click();
      }
    `);
    await sleep(400);

    // Initial State Check
    const initialBtnText = await evaluate(`document.getElementById('mainShiftBtnLabel')?.textContent.trim()`);
    console.log('Initial Button Text:', initialBtnText);
    assert(initialBtnText === 'End Shift', 'Initial button should be End Shift');

    // STEP 1: Click "End Shift" -> Transitions to SCANNING_END_SHIFT (Image 1)
    console.log('--- Step 1: Clicking End Shift ---');
    await evaluate(`document.getElementById('mainShiftActionBtn')?.click()`);
    await sleep(500);

    const step1State = await evaluate(`(() => {
      const btn = document.getElementById('mainShiftActionBtn');
      const cancelBtn = document.getElementById('btnHeaderCancel');
      const toast = document.getElementById('endShiftScanningToast');
      const microLabel = document.querySelector('.last-scan-micro-label');
      const actionTitle = document.getElementById('scanActionTitle');
      const statReadout = document.getElementById('largeStatReadout');
      return {
        btnText: btn?.textContent.trim(),
        btnClass: btn?.className,
        cancelClass: cancelBtn?.className,
        toastDisplay: window.getComputedStyle(toast).display,
        microLabel: microLabel?.textContent.trim(),
        actionTitle: actionTitle?.textContent.trim(),
        statReadout: statReadout?.textContent.trim()
      };
    })()`);

    console.log('Step 1 State (Image 1):', step1State);
    assert(step1State.btnClass.includes('btn-ctrl-get-report'), 'Button has btn-ctrl-get-report class');
    assert(step1State.btnText.includes('Get Report'), 'Button has Get Report text');
    assert(step1State.cancelClass.includes('cancel-red'), 'Cancel button is red');
    assert(step1State.toastDisplay === 'flex', 'End shift scanning toast is visible');

    // Capture Screenshot 1 (Matching Image 1)
    const snap1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/end-shift-step1-scanning.png', Buffer.from(snap1.result.data, 'base64'));
    console.log('Saved scratch/end-shift-step1-scanning.png');

    // STEP 2: Click "Get Report" -> Opens Modal (Image 2)
    console.log('--- Step 2: Clicking Get Report to open modal ---');
    await evaluate(`document.getElementById('mainShiftActionBtn')?.click()`);
    await sleep(500);

    const step2State = await evaluate(`(() => {
      const modal = document.getElementById('endShiftConfirmModal');
      const title = document.getElementById('endShiftModalTitleText')?.textContent.trim();
      const activations = document.getElementById('confActivationCount')?.textContent.trim();
      const emptySlots = document.getElementById('confEmptySlotsCount')?.textContent.trim();
      const totalSlots = document.getElementById('confTotalSlots')?.textContent.trim();
      const soldOutCount = document.getElementById('confSoldOutCount')?.textContent.trim();
      return {
        isOpen: modal?.open,
        title,
        activations,
        emptySlots,
        totalSlots,
        soldOutCount
      };
    })()`);

    console.log('Step 2 State (Image 2 Modal):', step2State);
    assert(step2State.isOpen, 'Modal is open');
    assert(step2State.title === 'Check before closing the shift', 'Modal title matches Image 2');
    assert(Number(step2State.totalSlots) > 0, 'Total slots is populated');

    // Capture Screenshot 2 (Matching Image 2)
    const snap2 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/end-shift-step2-modal.png', Buffer.from(snap2.result.data, 'base64'));
    console.log('Saved scratch/end-shift-step2-modal.png');

    // STEP 3: Click "Confirm" in modal -> Closes shift & renders Image 3
    console.log('--- Step 3: Clicking Confirm in modal ---');
    await evaluate(`document.getElementById('confConfirmBtn')?.click()`);
    await sleep(600);

    const step3State = await evaluate(`(() => {
      const btn = document.getElementById('mainShiftActionBtn');
      const printBtn = document.getElementById('btnHeaderRefresh');
      const cancelBtn = document.getElementById('btnHeaderCancel');
      const repSec = document.getElementById('shiftClosedReportSection');
      const title = document.getElementById('scanActionTitle')?.textContent.trim();
      const micro = document.querySelector('.last-scan-micro-label')?.textContent.trim();
      const stat = document.getElementById('largeStatReadout')?.textContent.trim();
      const repTableRows = document.querySelectorAll('#repDocTableBody tr').length;
      return {
        btnText: btn?.textContent.trim(),
        btnClass: btn?.className,
        printText: printBtn?.textContent.trim(),
        cancelDisabled: cancelBtn?.disabled,
        repSecDisplay: window.getComputedStyle(repSec).display,
        title,
        micro,
        stat,
        repTableRows
      };
    })()`);

    console.log('Step 3 State (Image 3):', step3State);
    assert(step3State.btnText.includes('Start New Shift'), 'Button says Start New Shift');
    assert(step3State.printText.includes('Print'), 'Header button 1 says Print');
    assert(step3State.repSecDisplay === 'block', 'Shift closed report section is displayed');
    assert(step3State.title === 'Total sale', 'Top card title says Total sale');
    assert(step3State.micro === 'SHIFT REPORT', 'Micro label says SHIFT REPORT');
    assert(step3State.repTableRows === 65, 'Report table has all 65 rows rendered');

    // Capture Screenshot 3 (Matching Image 3)
    const snap3 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/end-shift-step3-closed.png', Buffer.from(snap3.result.data, 'base64'));
    console.log('Saved scratch/end-shift-step3-closed.png');

    // STEP 4: Click "Start New Shift" or "Done" -> advances to next shift
    console.log('--- Step 4: Clicking Done to Start New Shift ---');
    await evaluate(`document.getElementById('btnShiftRepDone')?.click()`);
    await sleep(600);

    const nextShiftState = await evaluate(`(() => {
      const btn = document.getElementById('mainShiftBtnLabel')?.textContent.trim();
      const toast = document.getElementById('endShiftScanningToast');
      const repSec = document.getElementById('shiftClosedReportSection');
      return {
        btnText: btn,
        toastDisplay: window.getComputedStyle(toast).display,
        repSecDisplay: window.getComputedStyle(repSec).display
      };
    })()`);

    console.log('Next Shift State:', nextShiftState);
    assert(nextShiftState.btnText === 'End Shift', 'Next shift button is End Shift');
    assert(nextShiftState.repSecDisplay === 'none', 'Report section is hidden');

    console.log('🎉 ALL END SHIFT STEPS VERIFIED 100% SUCCESSFULLY!');

    ws.close();
  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  } finally {
    p.kill();
  }
}

run();
