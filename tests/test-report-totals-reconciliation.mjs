import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9831;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-totals-'));

const p = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tmp}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  'http://localhost:5173'
]);

setTimeout(async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await res.json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const send = (method, params = {}) => new Promise(resolve => {
      const curId = id++;
      const handler = e => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    const evalCode = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });

    await send('Page.reload');
    await new Promise(r => setTimeout(r, 2000));

    const testOutput = await evalCode(`
      (() => {
        try {
          // 1. Setup state with $242.00 in scratch sales (matching user's Image 3)
          const testState = {
            shiftStatus: 'SCANNING_END_SHIFT',
            shiftNumber: 14,
            totalSlots: 60,
            slots: [
              {
                boxNumber: 1,
                status: 'ACTIVE',
                packNumber: '067017',
                gameName: '$10 Cash Blast',
                price: 10,
                startTicket: 0,
                currentTicket: 24, // 24 * $10 = $240
                scannedInEndShift: true,
                ticketsSold: 24
              },
              {
                boxNumber: 2,
                status: 'ACTIVE',
                packNumber: '099656',
                gameName: '$2 Double Match',
                price: 2,
                startTicket: 0,
                currentTicket: 1, // 1 * $2 = $2
                scannedInEndShift: true,
                ticketsSold: 1
              }
            ],
            cashes: 0,
            onlineSales: 0,
            onlineCashes: 0
          };
          for (let i = 3; i <= 60; i++) {
            testState.slots.push({
              boxNumber: i, status: 'EMPTY', gameName: null, price: null, packNumber: null,
              packSize: null, startTicket: 0, currentTicket: 0, ticketsInBox: 0
            });
          }
          localStorage.setItem('lotto_track_pos_data_v3', JSON.stringify(testState));
          const restored = window.loadState('store_amigo');
          window.state = restored;
          window.renderDispenserRack();
          window.renderHeaderAndMetrics();
          return { ready: true };
        } catch (e) {
          return { error: e.message };
        }
      })()
    `);

    // Now test entering terminal values: Cashes 40, Online 60, Online Cashes 100 (Image 1)
    const verification = await evalCode(`
      (() => {
        try {
          // Open the confirm modal
          const modal = document.getElementById('endShiftConfirmModal');
          const cashesInput = document.getElementById('confTerminalCashes');
          const onlineInput = document.getElementById('confTerminalOnline');
          const onlineCashesInput = document.getElementById('confTerminalOnlineCashes');

          cashesInput.value = '40';
          onlineInput.value = '60';
          onlineCashesInput.value = '100';

          // Trigger confirm
          const confirmBtn = document.getElementById('confConfirmBtn');
          confirmBtn.click();

          // Read the generated standalone report fields
          const totalVal = document.getElementById('repDocSubtotal')?.textContent.trim();
          const cashesVal = document.getElementById('repDocCashes')?.textContent.trim();
          const cashesIsRed = document.getElementById('repDocCashes')?.classList.contains('rep-confirm-red');
          const onlineVal = document.getElementById('repDocOnline')?.textContent.trim();
          const onlineCashesVal = document.getElementById('repDocOnlineCashes')?.textContent.trim();
          const onlineCashesIsRed = document.getElementById('repDocOnlineCashes')?.classList.contains('rep-confirm-red');
          const totalSalesVal = document.getElementById('repDocGrandSales')?.textContent.trim();
          const totalCashesVal = document.getElementById('repDocTotalCashes')?.textContent.trim();
          const totalCashesIsRed = document.getElementById('repDocTotalCashes')?.classList.contains('rep-confirm-red');
          const totalDropVal = document.getElementById('repDocTotalDrop')?.textContent.trim();
          const scratchProfitVal = document.getElementById('repDocScratchProfit')?.textContent.trim();

          // Also test zero inputs matching Image 3 directly
          window.populateShiftReportBreakdown('', 242, 25, { cashes: 0, onlineSales: 0, onlineCashes: 0 });

          const zTotal = document.getElementById('repDocSubtotal')?.textContent.trim();
          const zCashes = document.getElementById('repDocCashes')?.textContent.trim();
          const zOnline = document.getElementById('repDocOnline')?.textContent.trim();
          const zOnlineCashes = document.getElementById('repDocOnlineCashes')?.textContent.trim();
          const zTotalSales = document.getElementById('repDocGrandSales')?.textContent.trim();
          const zTotalCashes = document.getElementById('repDocTotalCashes')?.textContent.trim();
          const zTotalDrop = document.getElementById('repDocTotalDrop')?.textContent.trim();
          const zScratchProfit = document.getElementById('repDocScratchProfit')?.textContent.trim();

          return {
            withInputs: {
              totalVal,
              cashesVal,
              cashesIsRed,
              onlineVal,
              onlineCashesVal,
              onlineCashesIsRed,
              totalSalesVal,
              totalCashesVal,
              totalCashesIsRed,
              totalDropVal,
              scratchProfitVal
            },
            matchingImage3: {
              zTotal,
              zCashes,
              zOnline,
              zOnlineCashes,
              zTotalSales,
              zTotalCashes,
              zTotalDrop,
              zScratchProfit
            }
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `);

    console.log('TEST RESULT:', JSON.stringify(verification, null, 2));

    ws.close();
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
}, 2000);
