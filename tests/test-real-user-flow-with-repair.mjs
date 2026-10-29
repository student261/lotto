import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9797;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-repair-'));

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
    await new Promise(r => setTimeout(r, 2500));

    const testOutput = await evalCode(`
      (() => {
        try {
          // 1. Inject the corrupted state matching user's real browser LevelDB
          const corruptedState = {
            shiftStatus: 'SCANNING_END_SHIFT',
            totalSlots: 60,
            customGames: [
              { id: 'cg_1', name: '10X Money', price: 2, packSize: 150, barcodePrefix: '1418' },
              { id: 'cg_2', name: '5X Money', price: 1, packSize: 300, barcodePrefix: '1417' }
            ],
            slots: [
              {
                boxNumber: 1,
                status: 'ACTIVE',
                gameId: 'cg_1',
                gameName: '10X Money',
                price: 2,
                packNumber: '081068', // corrupted trailer digits
                packSize: 150,
                startTicket: 0,
                currentTicket: 0,
                scannedBarcodes: [
                  { barcode: '14180996564081', ticketNumber: 81, securityCode: '068' },
                  { barcode: '[1418-0996564-081 (068)] Box #1: $2.00 · 10X Money (#81(068))', ticketNumber: 0 }
                ],
                securityCode: '068',
                startSecurityCode: '068',
                currentSecurityCode: '068',
                barcodePrefix: '1418',
                ticketsSold: 0
              },
              {
                boxNumber: 2,
                status: 'ACTIVE',
                gameId: 'cg_2',
                gameName: '5X Money',
                price: 1,
                packNumber: '515284', // corrupted trailer digits
                packSize: 300,
                startTicket: 0,
                currentTicket: 0,
                scannedBarcodes: [
                  { barcode: '14170670170015', ticketNumber: 15, securityCode: '284' },
                  { barcode: '[1417-0670170-015 (284)] Box #2: $1.00 · 5X Money (#15(284))', ticketNumber: 0 }
                ],
                securityCode: '284',
                startSecurityCode: '284',
                currentSecurityCode: '284',
                barcodePrefix: '1417',
                ticketsSold: 0
              },
              {
                boxNumber: 3,
                status: 'ACTIVE',
                gameId: 'cg_2',
                gameName: '5X Money',
                price: 1,
                packNumber: '517282', // corrupted trailer digits
                packSize: 300,
                startTicket: 0,
                currentTicket: 0,
                scannedBarcodes: [
                  { barcode: '14170670170017', ticketNumber: 17, securityCode: '282' },
                  { barcode: '[1417-0670170-017 (282)] Box #3: $1.00 · 5X Money (#17(282))', ticketNumber: 0 }
                ],
                securityCode: '282',
                startSecurityCode: '282',
                currentSecurityCode: '282',
                barcodePrefix: '1417',
                ticketsSold: 0
              }
            ]
          };

          for (let i = 4; i <= 60; i++) {
            corruptedState.slots.push({
              boxNumber: i, status: 'EMPTY', gameName: null, price: null, packNumber: null,
              packSize: null, startTicket: 0, currentTicket: 0, ticketsInBox: 0, scannedBarcodes: []
            });
          }

          localStorage.setItem('lotto_track_pos_data_v3', JSON.stringify(corruptedState));

          // 2. Call loadState and refresh app
          const restored = window.loadState('store_amigo');
          window.state = restored;
          window.renderDispenserRack();
          window.renderHeaderAndMetrics();

          const b1RepairedPack = window.state.slots.find(s => s.boxNumber === 1)?.packNumber;
          const b2RepairedPack = window.state.slots.find(s => s.boxNumber === 2)?.packNumber;
          const b2RepairedStart = window.state.slots.find(s => s.boxNumber === 2)?.startTicket;

          // 3. Now scan the exact ticket the user scanned in their screenshot:
          const scannedCode = '141706701700162916939465';
          window.processScannedBarcode(scannedCode);

          const lastToast = document.querySelector('.toast, #toastContainer .toast-item, .scan-toast')?.textContent;
          const isAlertYellow = document.getElementById('lastScanReadoutContainer')?.classList.contains('alert-yellow');
          const lastActionTitle = document.getElementById('scanActionTitle')?.textContent;
          const box2 = window.state.slots.find(s => s.boxNumber === 2);
          const box2Sold = window.calculateSlotSoldTickets(box2);
          const card2El = document.querySelector('#dispensersGrid .box-card[data-box="2"]');
          const card2SoldText = card2El ? card2El.querySelector('.ticket-sold-count')?.textContent?.trim() : null;

          return {
            b1RepairedPack,
            b2RepairedPack,
            b2RepairedStart,
            lastToast,
            isAlertYellow,
            lastActionTitle,
            box2Verified: box2?.scannedInEndShift,
            box2CurrentTicket: box2?.currentTicket,
            box2Sold,
            card2SoldText
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `);

    console.log('TEST RESULT:', JSON.stringify(testOutput, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
    p.kill();
    process.exit(0);
  }
}, 2000);
