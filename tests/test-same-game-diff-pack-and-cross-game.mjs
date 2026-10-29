import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9845;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-same-game-'));

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

    await new Promise(r => setTimeout(r, 2500));

    const result = await evalCode(`
      (async () => {
        const results = [];
        try {
          const state = window.getState();
          
          // Step 0: Ensure starting with fresh clean state
          const cleanState = window.getState();
          cleanState.slots.forEach(s => {
            s.status = 'EMPTY';
            s.gameName = '';
            s.gameId = null;
            s.packNumber = null;
            s.currentTicket = '000';
            s.endTicket = '000';
            s.scannedBarcodes = [];
            s.ticketsSold = 0;
            s.amountSold = 0;
          });
          cleanState.shiftStatus = 'ACTIVE';
          cleanState.cashierName = 'Test Cashier';

          // -------------------------------------------------------------
          // TEST 1: Same Game, Different Packs in Box 1 and Box 2
          // Game 1465, Pack A = 0093468 in Box 1
          // Game 1465, Pack B = 0093469 in Box 2
          // -------------------------------------------------------------
          const slot1 = cleanState.slots.find(s => s.boxNumber === 1);
          slot1.status = 'ACTIVE';
          slot1.gameName = '$1 Jumbo Bucks Classic';
          slot1.ticketPrice = 1;
          slot1.gameId = '1465';
          slot1.packNumber = '0093468';
          slot1.currentTicket = '000';
          slot1.endTicket = '299';
          slot1.ticketsSold = 0;
          slot1.scannedBarcodes = ['1465-0093468-000'];

          const slot2 = cleanState.slots.find(s => s.boxNumber === 2);
          slot2.status = 'ACTIVE';
          slot2.gameName = '$1 Jumbo Bucks Classic';
          slot2.ticketPrice = 1;
          slot2.gameId = '1465';
          slot2.packNumber = '0093469';
          slot2.currentTicket = '000';
          slot2.endTicket = '299';
          slot2.ticketsSold = 0;
          slot2.scannedBarcodes = ['1465-0093469-000'];

          window.saveState(cleanState);

          // Both boxes must start ACTIVE
          const preCheck1 = window.getState().slots.find(s => s.boxNumber === 1);
          const preCheck2 = window.getState().slots.find(s => s.boxNumber === 2);
          results.push({
            test: 'precheck_both_active',
            box1Status: preCheck1.status,
            box1Pack: preCheck1.packNumber,
            box2Status: preCheck2.status,
            box2Pack: preCheck2.packNumber,
            pass: preCheck1.status === 'ACTIVE' && preCheck2.status === 'ACTIVE'
          });

          // Scan ticket for Box 1: 1465-0093468-005 (Continuous: 14650093468005)
          await window.handleTicketBarcodeScan('14650093468005');
          const postScan1_box1 = window.getState().slots.find(s => s.boxNumber === 1);
          const postScan1_box2 = window.getState().slots.find(s => s.boxNumber === 2);

          results.push({
            test: 'scan_box1_ticket_preserves_box2',
            box1Status: postScan1_box1.status,
            box1Pack: postScan1_box1.packNumber,
            box1CurrentTicket: postScan1_box1.currentTicket,
            box2Status: postScan1_box2.status,
            box2Pack: postScan1_box2.packNumber,
            pass: postScan1_box1.status === 'ACTIVE' && 
                  postScan1_box2.status === 'ACTIVE' && 
                  postScan1_box2.packNumber === '0093469'
          });

          // Scan ticket for Box 2: 1465-0093469-007 (Continuous: 14650093469007)
          await window.handleTicketBarcodeScan('14650093469007');
          const postScan2_box1 = window.getState().slots.find(s => s.boxNumber === 1);
          const postScan2_box2 = window.getState().slots.find(s => s.boxNumber === 2);

          results.push({
            test: 'scan_box2_ticket_preserves_box1',
            box1Status: postScan2_box1.status,
            box1Pack: postScan2_box1.packNumber,
            box2Status: postScan2_box2.status,
            box2Pack: postScan2_box2.packNumber,
            box2CurrentTicket: postScan2_box2.currentTicket,
            pass: postScan2_box1.status === 'ACTIVE' && 
                  postScan2_box1.packNumber === '0093468' &&
                  postScan2_box2.status === 'ACTIVE'
          });

          // -------------------------------------------------------------
          // TEST 2: Cross-Game False Rejection Elimination
          // Box 3 has Game 1322, Pack 0933093
          // Now scan a ticket with DIFFERENT game (Game 1891, Pack 0123456)
          // -------------------------------------------------------------
          const curr = window.getState();
          const slot3 = curr.slots.find(s => s.boxNumber === 3);
          slot3.status = 'ACTIVE';
          slot3.gameName = '$2 5X The Cash';
          slot3.ticketPrice = 2;
          slot3.gameId = '1322';
          slot3.packNumber = '0933093';
          slot3.currentTicket = '000';
          slot3.endTicket = '149';
          slot3.scannedBarcodes = ['1322-0933093-000'];
          window.saveState(curr);

          // Capture toast messages
          let toastMessage = '';
          const originalToast = window.showToast;
          window.showToast = (msg, type) => {
            toastMessage = msg;
            if (originalToast) originalToast(msg, type);
          };

          // Scan ticket for Game 1891 (Hit 100), Pack 0123456: 18910123456000
          await window.handleTicketBarcodeScan('18910123456000');

          const modal = document.getElementById('setTicketDetailsModal');
          const isModalOpen = modal && modal.open;
          const falseAlreadyInBox3 = toastMessage.includes('Box #3') || toastMessage.includes('Already Scanned');

          results.push({
            test: 'scan_diff_game_no_false_rejection_for_box3',
            toastMessage,
            falseAlreadyInBox3,
            isModalOpen,
            pass: !falseAlreadyInBox3
          });

          if (isModalOpen) {
            modal.close();
          }
          window.showToast = originalToast;

          // -------------------------------------------------------------
          // TEST 3: Update Inventory workspace hides dispenser rack and mini-map
          // -------------------------------------------------------------
          const btnUpdate = document.getElementById('btnUpdateInventoryCard');
          btnUpdate?.click();

          const rackDuring = window.getComputedStyle(document.getElementById('dispenserRackContainer')).display;
          const mapDuring = window.getComputedStyle(document.getElementById('cardAllBoxesMap')).display;
          const wsDuring = window.getComputedStyle(document.getElementById('inventoryScanWorkspace')).display;

          results.push({
            test: 'updating_inventory_boxes_hidden',
            rackDisplay: rackDuring,
            mapDisplay: mapDuring,
            workspaceDisplay: wsDuring,
            pass: rackDuring === 'none' && mapDuring === 'none' && wsDuring !== 'none'
          });

          // Finish/Close updating inventory
          document.getElementById('btnFinishInventory')?.click();
          const rackAfter = window.getComputedStyle(document.getElementById('dispenserRackContainer')).display;
          results.push({
            test: 'rack_restored_after_close',
            rackDisplay: rackAfter,
            pass: rackAfter !== 'none'
          });

          return { success: true, results };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack, results };
        }
      })()
    `);

    console.log('Raw CDP Result:', JSON.stringify(result, null, 2));
    const testData = result?.result?.value || result?.value;
    console.log('Test Execution Result:', JSON.stringify(testData, null, 2));

    const tests = testData?.results || [];
    const allPassed = tests.length > 0 && tests.every(t => t.pass);

    if (allPassed) {
      console.log('\n✅ ALL VERIFICATION TESTS PASSED PERFECTLY!');
    } else {
      console.error('\n❌ SOME VERIFICATION TESTS FAILED!');
      process.exitCode = 1;
    }

  } catch (e) {
    console.error('Test runner failure:', e);
    process.exitCode = 1;
  } finally {
    try { p.kill(); } catch (_) {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    process.exit(process.exitCode || 0);
  }
}, 1000);
