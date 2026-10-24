import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9245;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Testing Shift Report Breakdown & Totals (CDP) ===');

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
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Initial check: active shift status pill
    const initialPill = await evaluate(`document.getElementById('shiftPillTitle')?.textContent.trim()`);
    console.log('Initial Shift Pill:', initialPill);

    // Click End Shift (Step 1: scanning)
    await evaluate(`document.getElementById('mainShiftActionBtn')?.click()`);
    await sleep(500);

    // Click Get Report (Step 2: open modal)
    await evaluate(`document.getElementById('mainShiftActionBtn')?.click()`);
    await sleep(500);

    // In modal, click Confirm (Step 3: shift ended)
    await evaluate(`document.getElementById('confConfirmBtn')?.click()`);
    await sleep(800);

    // Check Dashboard Ended Shift State
    const dashboardState = await evaluate(`
      (() => {
        const pillTitle = document.getElementById('shiftPillTitle')?.textContent.trim();
        const pillTime = document.getElementById('shiftPillTime')?.textContent.trim();
        const pillClass = document.getElementById('shiftStatusPill')?.className;
        const scannerWrap = document.querySelector('.dashboard-scanner-input-wrap');
        const scannerHidden = scannerWrap ? window.getComputedStyle(scannerWrap).display === 'none' : false;
        const undoBtn = document.getElementById('undoActionBtn');
        const undoHidden = undoBtn ? window.getComputedStyle(undoBtn).display === 'none' : false;
        const repSec = document.getElementById('shiftClosedReportSection');
        const repSecVisible = repSec ? window.getComputedStyle(repSec).display === 'block' : false;

        // Totals block (Image 3 structure)
        const subtotal = document.getElementById('repDocSubtotal')?.textContent.trim();
        const cashes = (document.getElementById('repDocCashes') || document.getElementById('repDocConfirm'))?.textContent.trim();
        const online = document.getElementById('repDocOnline')?.textContent.trim();
        const onlineCashes = (document.getElementById('repDocOnlineCashes') || document.getElementById('repDocOnlineConfirm'))?.textContent.trim();
        const grandSales = document.getElementById('repDocGrandSales')?.textContent.trim();
        const totalCashes = (document.getElementById('repDocTotalCashes') || document.getElementById('repDocGrandConfirm'))?.textContent.trim();
        const totalDrop = document.getElementById('repDocTotalDrop')?.textContent.trim();
        const scratchProfit = document.getElementById('repDocScratchProfit')?.textContent.trim();

        // Inventory Stats
        const opCount = document.getElementById('repStatOpeningCount')?.textContent.trim();
        const clCount = document.getElementById('repStatClosingCount')?.textContent.trim();
        const actCount = document.getElementById('repStatActivations')?.textContent.trim();
        const safeInv = document.getElementById('repStatSafeInv')?.textContent.trim();
        const totInv = document.getElementById('repStatTotalInv')?.textContent.trim();
        const activeVal = document.getElementById('repStatActiveVal')?.textContent.trim();

        // Tables
        const actRows = document.querySelectorAll('#repDocActivationsBody tr').length;
        const soldRows = document.querySelectorAll('#repDocSoldBody tr').length;

        // Viewport styling
        const vp = document.querySelector('#shiftClosedReportSection .shift-rep-doc-viewport');
        const vpMaxHeight = vp ? window.getComputedStyle(vp).maxHeight : '';

        return {
          pillTitle,
          pillTime,
          pillClass,
          scannerHidden,
          undoHidden,
          repSecVisible,
          subtotal,
          cashes,
          online,
          onlineCashes,
          grandSales,
          totalCashes,
          totalDrop,
          scratchProfit,
          opCount,
          clCount,
          actCount,
          safeInv,
          totInv,
          activeVal,
          actRows,
          soldRows,
          vpMaxHeight
        };
      })()
    `);

    console.log('--- Dashboard Closed Shift State ---');
    console.log(JSON.stringify(dashboardState, null, 2));

    const shot1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/dashboard-closed-shift-verified.png', Buffer.from(shot1.result.data, 'base64'));
    console.log('Saved scratch/dashboard-closed-shift-verified.png');

    // Scroll dashboard down to bottom of shift report
    await evaluate(`
      const c = document.querySelector('.pos-main-container') || document.getElementById('viewSellCounter') || document.documentElement;
      if (c) c.scrollTop = c.scrollHeight;
      const v = document.getElementById('viewSellCounter');
      if (v) v.scrollTop = v.scrollHeight;
    `);
    await sleep(500);
    const shot1b = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/dashboard-closed-shift-bottom.png', Buffer.from(shot1b.result.data, 'base64'));
    console.log('Saved scratch/dashboard-closed-shift-bottom.png');

    // Test History Shift Report Modal Viewer
    await evaluate(`window.openModalShiftReportViewer?.('12')`);
    await sleep(600);

    // Scroll modal down to bottom
    await evaluate(`
      const modalBody = document.querySelector('.modal-shift-rep-body');
      if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
    `);
    await sleep(400);

    const modalState = await evaluate(`
      (() => {
        const modal = document.getElementById('modalShiftReportViewer');
        const isOpen = modal ? (modal.open || window.getComputedStyle(modal).display !== 'none') : false;
        const subtotal = document.getElementById('modalRepDocSubtotal')?.textContent.trim();
        const confirm = document.getElementById('modalRepDocConfirm')?.textContent.trim();
        const online = document.getElementById('modalRepDocOnline')?.textContent.trim();
        const onlineConfirm = document.getElementById('modalRepDocOnlineConfirm')?.textContent.trim();
        const grandSales = document.getElementById('modalRepDocGrandSales')?.textContent.trim();
        const grandConfirm = document.getElementById('modalRepDocGrandConfirm')?.textContent.trim();
        const opCount = document.getElementById('modalRepStatOpeningCount')?.textContent.trim();
        const activeVal = document.getElementById('modalRepStatActiveVal')?.textContent.trim();
        const actRows = document.querySelectorAll('#modalRepDocActivationsBody tr').length;
        const soldRows = document.querySelectorAll('#modalRepDocSoldBody tr').length;

        return {
          isOpen,
          subtotal,
          confirm,
          online,
          onlineConfirm,
          grandSales,
          grandConfirm,
          opCount,
          activeVal,
          actRows,
          soldRows
        };
      })()
    `);

    console.log('--- Modal Shift Report Viewer State ---');
    console.log(JSON.stringify(modalState, null, 2));

    const shot2 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/modal-shift-report-verified.png', Buffer.from(shot2.result.data, 'base64'));
    console.log('Saved scratch/modal-shift-report-verified.png');

    // Assertions
    assert.ok(dashboardState.pillTitle.includes('closed'), 'Dashboard pill title indicates closed shift');
    assert.strictEqual(dashboardState.scannerHidden, true, 'Scanner input is hidden when shift is ended');
    assert.strictEqual(dashboardState.undoHidden, true, 'Undo button is hidden when shift is ended');
    assert.strictEqual(dashboardState.repSecVisible, true, 'Shift closed report section is visible');
    assert.ok(dashboardState.subtotal.length > 0, 'Subtotal is populated');
    assert.ok(dashboardState.confirm.length > 0, 'Confirm is populated');
    assert.ok(dashboardState.online.length > 0, 'Online is populated');
    assert.ok(dashboardState.grandSales.length > 0, 'Grand Sales is populated');
    assert.strictEqual(dashboardState.actRows > 0, true, 'Activations rows exist');
    assert.strictEqual(dashboardState.soldRows > 0, true, 'Sold rows exist');
    assert.strictEqual(dashboardState.vpMaxHeight, 'none', 'Viewport maxHeight is none for smooth layout');

    assert.strictEqual(modalState.isOpen, true, 'Modal viewer opened');
    assert.ok(modalState.subtotal.length > 0, 'Modal subtotal populated');
    assert.ok(modalState.grandSales.length > 0, 'Modal grand sales populated');
    assert.strictEqual(modalState.actRows > 0, true, 'Modal activations rows exist');
    assert.strictEqual(modalState.soldRows > 0, true, 'Modal sold rows exist');

    console.log('🎉 ALL SHIFT REPORT VERIFICATION CHECKS PASSED 100%!');

    ws.close();
  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
