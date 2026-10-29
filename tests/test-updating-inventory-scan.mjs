import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9825;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-updinv-'));

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
      (async () => {
        try {
          const s = window.getState();
          // Step 1: Open Updating Inventory Mode
          const updateCard = document.getElementById('btnUpdateInventoryCard');
          updateCard.click();

          const banner = document.getElementById('inventoryUpdatingBanner');
          const ws = document.getElementById('inventoryScanWorkspace');
          const rackContainer = document.getElementById('dispenserRackContainer');
          const allBoxesMap = document.getElementById('cardAllBoxesMap');

          const isBannerActive = banner?.classList.contains('active-banner');
          const isWsActive = ws?.classList.contains('active-workspace');
          const rackDisplay = window.getComputedStyle(rackContainer).display;
          const mapDisplay = window.getComputedStyle(allBoxesMap).display;

          // Step 2: Scan ticket 1465-0093468-000
          window.handleUpdatingInventoryScan('1465-0093468-000');

          const termScreen = document.getElementById('invTerminalScreen');
          const latestCode = document.getElementById('invTermLatestCode')?.textContent?.trim();
          const latestTitle = document.getElementById('invTermLatestTitle')?.textContent?.trim();
          const count = document.getElementById('invTermRunningCount')?.textContent?.trim();
          const logHtml = document.getElementById('invTerminalLog')?.innerHTML;
          const inStock = s.inStockInventory || [];
          const pack1 = inStock.find(p => p.packNumber === '0093468');
          const metricInactive = document.getElementById('metricInactive')?.textContent?.trim();

          // Step 3: Scan second ticket 1466-0109049-000
          window.handleUpdatingInventoryScan('1466-0109049-000');
          const count2 = document.getElementById('invTermRunningCount')?.textContent?.trim();
          const latestCode2 = document.getElementById('invTermLatestCode')?.textContent?.trim();
          const pack2 = inStock.find(p => p.packNumber === '0109049');

          // Step 4: Click Finish to close Updating Inventory mode
          const btnFinish = document.getElementById('btnFinishInventory');
          btnFinish.click();

          const rackDisplayAfter = window.getComputedStyle(rackContainer).display;
          const mapDisplayAfter = window.getComputedStyle(allBoxesMap).display;
          const wsDisplayAfter = window.getComputedStyle(ws).display;

          return {
            success: true,
            step1: {
              isBannerActive,
              isWsActive,
              rackHiddenDuringUpdate: rackDisplay === 'none',
              mapHiddenDuringUpdate: mapDisplay === 'none'
            },
            step2: {
              latestCode,
              latestTitle,
              count,
              pack1AddedToStock: Boolean(pack1),
              metricInactive
            },
            step3: {
              count2,
              latestCode2,
              pack2AddedToStock: Boolean(pack2)
            },
            step4: {
              rackRestoredAfterFinish: rackDisplayAfter !== 'none',
              mapRestoredAfterFinish: mapDisplayAfter !== 'none',
              wsHiddenAfterFinish: wsDisplayAfter === 'none'
            }
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

    console.log('TEST RESULT:', JSON.stringify(testOutput, null, 2));

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
