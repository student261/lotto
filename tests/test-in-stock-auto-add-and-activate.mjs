import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9815;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-instock-'));

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

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await new Promise(r => setTimeout(r, 2000));

    const testResult = await evalCode(`
      (async () => {
        try {
          const s = window.getState();

          // 1. Configure state with empty rack and pack in stock
          s.slots = [
            { boxNumber: 1, status: 'EMPTY', packNumber: null },
            { boxNumber: 2, status: 'EMPTY', packNumber: null },
            { boxNumber: 3, status: 'EMPTY', packNumber: null }
          ];
          s.totalSlots = 3;
          s.visibleBoxNumbers = [1, 2, 3];
          s.inStockInventory = [
            {
              id: 'stock_1',
              gameId: '1418',
              gameNumber: '1418',
              gameName: '10X Money',
              price: 2,
              packNumber: '0996564',
              packSize: '150 tickets',
              packSizeNum: 150,
              position: '082',
              status: 'IN_STOCK',
              statusLabel: 'In stock',
              statusBadgeClass: 'badge-in-stock',
              receivedDate: 'Oct 19'
            }
          ];
          s.inventory = [...s.inStockInventory];
          window.saveState(s);

          // Force render of dispenser rack
          window.renderDispenserRack && window.renderDispenserRack();

          // 2. Scan ticket barcode 1418-0996564-082 (067)
          window.handleTicketBarcodeScan('14180996564082');

          // 3. Verify modals are closed and slot 1 is added to dispenser
          const setTicketDetailsModal = document.getElementById('setTicketDetailsModal');
          const setBoxModal = document.getElementById('setBoxModal');
          const isModalOpen = (setTicketDetailsModal?.open || setBoxModal?.open);

          const slot1 = s.slots.find(x => Number(x.boxNumber) === 1);
          const activateBtn = document.querySelector('.btn-card-activate[data-box="1"]');

          const step3Ok = {
            modalStayedClosed: !isModalOpen,
            slotStatus: slot1?.status,
            slotPack: slot1?.packNumber,
            slotNeedsActivation: slot1?.needsActivation,
            activateBtnFound: Boolean(activateBtn),
            activateBtnText: activateBtn?.textContent?.trim()
          };

          return {
            success: true,
            step3Ok
          };
        } catch (err) {
          return {
            success: false,
            error: err.message,
            stack: err.stack
          };
        }
      })()
    `);

    console.log('STEP 3 RESULT:', JSON.stringify(testResult, null, 2));

    await new Promise(r => setTimeout(r, 600));

    // Capture screenshot showing the Activate button on the dispenser card!
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(shot.data, 'base64');
    const outPath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\.tempmediaStorage\\test_card_activate_result.png';
    writeFileSync(outPath, buffer);
    console.log('Saved card activate screenshot to:', outPath);

    // Now click Activate button
    const clickResult = await evalCode(`
      (() => {
        const s = window.getState();
        const slot1 = s.slots.find(x => Number(x.boxNumber) === 1);
        const activateBtn = document.querySelector('.btn-card-activate[data-box="1"]');
        activateBtn?.click();

        const activateBtnAfter = document.querySelector('.btn-card-activate[data-box="1"]');
        const inStockAfter = s.inStockInventory.filter(p => p.packNumber === '0996564');
        return {
          activateBtnGone: !activateBtnAfter,
          slotNeedsActivationAfter: slot1?.needsActivation,
          slotActivatedThisShift: slot1?.activatedThisShift,
          inStockRemainingCount: inStockAfter.length
        };
      })()
    `);
    console.log('STEP 5 (AFTER CLICK) RESULT:', JSON.stringify(clickResult, null, 2));

    ws.close();
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
  } catch (err) {
    console.error('Test execution error:', err);
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
}, 1500);
