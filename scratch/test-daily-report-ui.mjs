import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9255;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Testing Daily Report Screen UI & Shift Report Modal ===');

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
        const i = id++;
        cbs.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
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

    async function evaluate(expr) {
      const res = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
      return res.result?.result?.value;
    }

    async function capture(filename) {
      const res = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(filename, Buffer.from(res.result.data, 'base64'));
      console.log(`Saved screenshot ${filename}`);
    }

    // 1. Navigate to Reports screen
    console.log('--- Step 1: Navigating to Reports Screen ---');
    await evaluate(`document.getElementById('navHistory').click();`);
    await sleep(400);

    const histDisp = await evaluate(`document.getElementById('viewHistory').style.display;`);
    assert.strictEqual(histDisp, 'block', '#viewHistory should be displayed');
    console.log('✓ Navigated to #viewHistory');

    // 2. Click "Daily report" tab switcher
    console.log('--- Step 2: Clicking Daily report tab ---');
    await evaluate(`document.getElementById('btnSwitchDailyReport').click();`);
    await sleep(400);

    const subviewDailyDisplay = await evaluate(`document.getElementById('subviewDailyReport').style.display;`);
    assert.strictEqual(subviewDailyDisplay, 'block', '#subviewDailyReport should be block');

    const subviewShiftDisplay = await evaluate(`document.getElementById('subviewShiftReports').style.display;`);
    assert.strictEqual(subviewShiftDisplay, 'none', '#subviewShiftReports should be none');

    // 3. Verify Oct 17 State (Matching User Reference Image 2)
    console.log('--- Step 3: Verifying Oct 17 UI (Exact Match to User Image 2) ---');
    const oct17State = await evaluate(`(() => {
      const activePill = document.querySelector('#dailyDatePillsRow .btn-daily-pill.active')?.textContent.trim();
      const card1Label = document.getElementById('kpiDailySalesLabel')?.textContent.trim();
      const card1Val = document.getElementById('kpiDailySalesVal')?.textContent.trim();
      const card1Sub = document.getElementById('kpiDailySalesSub')?.textContent.trim();
      const card2Val = document.getElementById('kpiDailyTicketsVal')?.textContent.trim();
      const card3Val = document.getElementById('kpiDailyShiftsVal')?.textContent.trim();
      const tableTitle = document.getElementById('dailyShiftsCardTitle')?.textContent.trim();
      const rows = Array.from(document.querySelectorAll('#dailyShiftsTableBody tr')).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );
      const footTickets = document.getElementById('dailyFootTickets')?.textContent.trim();
      const footSales = document.getElementById('dailyFootSales')?.textContent.trim();
      return { activePill, card1Label, card1Val, card1Sub, card2Val, card3Val, tableTitle, rows, footTickets, footSales };
    })()`);

    console.log('Oct 17 UI State:', oct17State);
    assert.strictEqual(oct17State.activePill, 'Oct 17');
    assert.strictEqual(oct17State.card1Label, 'Ticket sales · Oct 17');
    assert.strictEqual(oct17State.card1Val, '$2,685.00');
    assert.strictEqual(oct17State.card1Sub, 'sum of closed shifts');
    assert.strictEqual(oct17State.card2Val, '449');
    assert.strictEqual(oct17State.card3Val, '2');
    assert.strictEqual(oct17State.tableTitle, 'Shifts on Oct 17');
    assert.strictEqual(oct17State.rows.length, 2);
    assert.strictEqual(oct17State.rows[0][0], '#12');
    assert.strictEqual(oct17State.rows[0][1], 'Daniel');
    assert.strictEqual(oct17State.rows[0][3], '251');
    assert.strictEqual(oct17State.rows[0][4], '$1,512.00');
    assert.strictEqual(oct17State.rows[1][0], '#11');
    assert.strictEqual(oct17State.rows[1][1], 'Rosa');
    assert.strictEqual(oct17State.rows[1][3], '198');
    assert.strictEqual(oct17State.rows[1][4], '$1,173.00');
    assert.strictEqual(oct17State.footTickets, '449');
    assert.strictEqual(oct17State.footSales, '$2,685.00');

    await capture('scratch/daily-report-screen.png');

    // 4. Test clicking another date pill (Oct 16)
    console.log('--- Step 4: Testing Date Pill Switching (Oct 16) ---');
    await evaluate(`document.querySelector('#dailyDatePillsRow button[data-date="Oct 16"]').click();`);
    await sleep(300);

    const oct16Card1 = await evaluate(`document.getElementById('kpiDailySalesVal').textContent.trim();`);
    const oct16Card2 = await evaluate(`document.getElementById('kpiDailyTicketsVal').textContent.trim();`);
    console.log('Oct 16 Totals:', { oct16Card1, oct16Card2 });
    assert.strictEqual(oct16Card1, '$2,441.00');
    assert.strictEqual(oct16Card2, '409');

    // Switch back to Oct 17
    await evaluate(`document.querySelector('#dailyDatePillsRow button[data-date="Oct 17"]').click();`);
    await sleep(300);

    // 5. Test clicking "View" on Shift #12 to open Shift Report Modal
    console.log('--- Step 5: Testing View Shift Report Modal ---');
    await evaluate(`document.querySelector('#dailyShiftsTableBody tr:first-child .btn-daily-shift-view').click();`);
    await sleep(400);

    const modalState = await evaluate(`(() => {
      const modal = document.getElementById('modalShiftReportViewer');
      const title = document.getElementById('modalShiftRepToolbarTitle')?.textContent.trim();
      const total = document.getElementById('modalRepDocTotalAmount')?.textContent.trim();
      const meta = document.getElementById('modalRepDocMetaLine')?.textContent.trim();
      const rows = document.querySelectorAll('#modalRepDocTableBody tr').length;
      return { open: modal.open || modal.style.display !== 'none', title, total, meta, rows };
    })()`);

    console.log('Modal State:', modalState);
    assert.strictEqual(modalState.open, true);
    assert(modalState.title.includes('#12'));
    assert.strictEqual(modalState.total, 'Total $1,512.00');
    assert(modalState.meta.toLowerCase().includes('daniel'));
    assert.strictEqual(modalState.rows, 65, 'Modal includes all 65 boxes');

    await capture('scratch/shift-report-modal.png');

    // Close modal
    await evaluate(`document.getElementById('btnModalShiftRepClose').click();`);
    await sleep(300);

    // 6. Test Dashboard Closed Shift Report Scrollability (Image 1 fix)
    console.log('--- Step 6: Testing Dashboard Embedded Report Scrollability ---');
    await evaluate(`document.getElementById('navSellCounter').click();`);
    await sleep(400);

    // Step 1: Click End Shift -> SCANNING_END_SHIFT
    await evaluate(`document.getElementById('mainShiftActionBtn')?.click();`);
    await sleep(400);
    // Step 2: Click Get Report -> Open Modal
    await evaluate(`document.getElementById('mainShiftActionBtn')?.click();`);
    await sleep(400);
    // Step 3: Confirm in Modal -> SHIFT_ENDED
    await evaluate(`document.getElementById('confConfirmBtn')?.click();`);
    await sleep(600);

    const viewportMetrics = await evaluate(`(() => {
      const vp = document.querySelector('#shiftClosedReportSection .shift-rep-doc-viewport');
      if (!vp) return null;
      return {
        scrollHeight: vp.scrollHeight,
        clientHeight: vp.clientHeight,
        isScrollable: vp.scrollHeight > vp.clientHeight,
        overflowY: window.getComputedStyle(vp).overflowY
      };
    })()`);

    console.log('Viewport metrics on Dashboard:', viewportMetrics);
    assert(viewportMetrics !== null, 'Embedded viewport should exist');
    assert.strictEqual(viewportMetrics.overflowY, 'auto');
    assert(viewportMetrics.isScrollable, 'Embedded report viewport is scrollable');

    await capture('scratch/dashboard-closed-report.png');

    console.log('🎉 ALL DAILY REPORT & SHIFT REPORT MODAL TESTS PASSED 100%!');
  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
