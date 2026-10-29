import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9840;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-flow-'));

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

    const result = await evalCode(`
      (async () => {
        try {
          const log = [];
          const s = window.getState();

          // Step 1: Click "Update Inventory"
          const btnUpdate = document.getElementById('btnUpdateInventoryCard');
          btnUpdate.click();

          const rackDuring = window.getComputedStyle(document.getElementById('dispenserRackContainer')).display;
          const mapDuring = window.getComputedStyle(document.getElementById('cardAllBoxesMap')).display;
          const wsDuring = window.getComputedStyle(document.getElementById('inventoryScanWorkspace')).display;
          log.push({
            step: '1_open_updating_inventory',
            rackDisplay: rackDuring,
            mapDisplay: mapDuring,
            workspaceDisplay: wsDuring,
            isUpdatingInventory: s.isUpdatingInventory
          });

          // Step 2: Cashier scans ticket in Update Inventory mode
          // Game 1465, Pack 0093468, Ticket 000
          const barcodeInput = document.getElementById('barcodeInput');
          barcodeInput.value = '14650093468000';
          // Simulate Enter keydown on barcodeInput
          barcodeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

          const inStockAfterScan = (s.inStockInventory || []).find(p => p.packNumber === '0093468');
          const termCount = document.getElementById('invTermRunningCount')?.textContent?.trim();
          log.push({
            step: '2_scan_in_update_inventory',
            packAddedToStock: Boolean(inStockAfterScan),
            packNumber: inStockAfterScan?.packNumber,
            termCount: termCount,
            scannedListLength: s.scannedInventoryPacks?.length
          });

          // Step 3: Cashier clicks "Finish"
          const btnFinish = document.getElementById('btnFinishInventory');
          btnFinish.click();

          const rackAfterFinish = window.getComputedStyle(document.getElementById('dispenserRackContainer')).display;
          const mapAfterFinish = window.getComputedStyle(document.getElementById('cardAllBoxesMap')).display;
          const wsAfterFinish = window.getComputedStyle(document.getElementById('inventoryScanWorkspace')).display;
          log.push({
            step: '3_finish_update_inventory',
            rackDisplay: rackAfterFinish,
            mapDisplay: mapAfterFinish,
            workspaceDisplay: wsAfterFinish,
            isUpdatingInventory: s.isUpdatingInventory
          });

          // Step 4: Now cashier is at Sell Counter and scans that pack ticket AGAIN: '14650093468000'
          barcodeInput.value = '14650093468000';
          barcodeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

          // Did modal pop up?
          const setTicketDetailsModal = document.getElementById('setTicketDetailsModal');
          const setBoxModal = document.getElementById('setBoxModal');
          const isModalOpen = Boolean(setTicketDetailsModal?.open || setBoxModal?.open);

          // Find which box it was added to
          const slot = s.slots.find(x => x.packNumber === '0093468');
          const activateBtn = slot ? document.querySelector(\`.btn-card-activate[data-box="\${slot.boxNumber}"]\`) : null;

          log.push({
            step: '4_scan_again_at_counter',
            isModalOpen: isModalOpen,
            slotFound: Boolean(slot),
            slotBox: slot?.boxNumber,
            slotStatus: slot?.status,
            slotNeedsActivation: slot?.needsActivation,
            activateBtnFound: Boolean(activateBtn),
            activateBtnText: activateBtn?.textContent?.trim()
          });

          // Step 5: Click "Activate" button on the dispenser card
          if (activateBtn) {
            activateBtn.click();
          }

          const inStockAfterActivate = (s.inStockInventory || []).find(p => p.packNumber === '0093468');
          const activateBtnAfter = slot ? document.querySelector(\`.btn-card-activate[data-box="\${slot.boxNumber}"]\`) : null;

          log.push({
            step: '5_click_activate',
            activateBtnGone: !activateBtnAfter,
            slotNeedsActivationAfter: slot?.needsActivation,
            slotActivatedThisShift: slot?.activatedThisShift,
            removedFromStock: !inStockAfterActivate
          });

          return { success: true, log };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack };
        }
      })()
    `);

    console.log('FLOW TEST LOG:', JSON.stringify(result, null, 2));

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
}, 2500);
