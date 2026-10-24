import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9796;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-exact-'));

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

    await new Promise(r => setTimeout(r, 2000));

    const testOutput = await evalCode(`
      (() => {
        try {
          // 1. Reset state
          window.state.shiftStatus = 'IN_PROGRESS';
          window.state.slots = [];
          for (let i = 1; i <= 65; i++) {
            window.state.slots.push({
              boxNumber: i, status: 'EMPTY', gameName: '', price: null, packNumber: '', packSize: 100,
              startTicket: 0, currentTicket: 0, ticketsSold: 0, activatedThisShift: false
            });
          }
          
          // 2. Open step 1 with 1418-0996564-081 (067)
          window.processScannedBarcode('1418-0996564-081 (067)');
          
          // 3. Click Next button on Step 1
          const nextBtn = document.getElementById('btnTicketDetailsNext');
          if (nextBtn) nextBtn.click();
          
          // 4. Set Box 2 and click Confirm
          const boxInput = document.getElementById('setBoxNumberInput');
          if (boxInput) boxInput.value = '2';
          const confirmBtn = document.getElementById('btnSetBoxConfirm');
          if (confirmBtn) confirmBtn.click();
          
          const box2AfterActivation = JSON.parse(JSON.stringify(window.state.slots.find(s => s.boxNumber === 2)));
          
          // 5. Now scan the second ticket during shift: 1418-0996564-081 (068)
          window.processScannedBarcode('1418-0996564-081 (068)');
          
          const duringShiftStep1 = document.getElementById('setTicketDetailsModal')?.open;
          const box2DuringShift = JSON.parse(JSON.stringify(window.state.slots.find(s => s.boxNumber === 2)));
          
          // 6. Click End Shift button
          const endShiftBtn = document.getElementById('mainShiftActionBtn');
          if (endShiftBtn) endShiftBtn.click();
          
          const shiftStatusAfterEndClick = window.state.shiftStatus;
          
          // Check visible cards in dispenser rack right after clicking End Shift
          const visibleCardsBeforeScan = Array.from(document.querySelectorAll('#dispensersGrid .box-card')).map(c => c.getAttribute('data-box'));
          
          // 7. Scan closing ticket: 1418-0996564-081 (068)
          window.processScannedBarcode('1418-0996564-081 (068)');
          
          const box2AfterEndShiftScan = JSON.parse(JSON.stringify(window.state.slots.find(s => s.boxNumber === 2)));
          const visibleCardsAfterScan = Array.from(document.querySelectorAll('#dispensersGrid .box-card')).map(c => c.getAttribute('data-box'));
          const card2El = document.querySelector('#dispensersGrid .box-card[data-box="2"]');
          const card2SoldText = card2El ? card2El.querySelector('.ticket-sold-count')?.textContent?.trim() : null;
          
          return {
            duringShiftStep1,
            box2DuringShiftSold: window.calculateSlotSoldTickets(box2DuringShift),
            shiftStatusAfterEndClick,
            visibleCardsBeforeScan,
            visibleCardsAfterScan,
            box2AfterEndShiftSold: window.calculateSlotSoldTickets(box2AfterEndShiftScan),
            card2SoldText,
            box3Status: window.state.slots.find(s => s.boxNumber === 3)?.status,
            activationStartSec: box2AfterActivation.startSecurityCode,
            activationSec: box2AfterActivation.securityCode,
            endShiftCurrentSec: box2AfterEndShiftScan.currentSecurityCode,
            endShiftStartSec: box2AfterEndShiftScan.startSecurityCode,
            endShiftStartTicket: box2AfterEndShiftScan.startTicket,
            endShiftCurrentTicket: box2AfterEndShiftScan.currentTicket
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
