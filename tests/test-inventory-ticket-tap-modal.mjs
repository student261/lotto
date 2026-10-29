import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import assert from 'assert';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9799;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-inv-modal-'));

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

    // Wait until window.state is fully initialized
    for (let i = 0; i < 25; i++) {
      const ready = await evalCode('typeof window.state !== "undefined" && Array.isArray(window.state.slots)');
      if (ready?.result?.value) break;
      await new Promise(r => setTimeout(r, 300));
    }

    console.log('================================================================');
    console.log('   INVENTORY ROW TAP MODAL VERIFICATION (IMAGE 1 -> IMAGE 2)   ');
    console.log('================================================================\n');

    const result = await evalCode(`
      (() => {
        try {
          const results = {};

          // 1. Setup State: Active Box 61 and In-Stock Pack 1911417
          const slot61 = window.state.slots.find(s => s.boxNumber === 61);
          if (slot61) {
            slot61.status = 'ACTIVE';
            slot61.gameName = '10X Money';
            slot61.packNumber = '610455';
            slot61.price = 10;
            slot61.packSize = 150;
            slot61.startTicket = 0;
            slot61.currentTicket = 0;
            slot61.gameId = 'g107';
            slot61.daysActive = 2;
          }

          window.state.inStockInventory = [
            {
              id: 'stock_test_1',
              gameName: 'Scratch Game 8415',
              gameNumber: 'Game 8415',
              packNumber: '1911417',
              price: 10,
              packSize: '30 tickets',
              packSizeNum: 30,
              status: 'IN_STOCK',
              boxNumber: null,
              position: '004',
              receivedDate: 'Oct 28'
            }
          ];

          // Switch to Inventory View
          const navBtn = document.querySelector('.nav-item[data-view="inventory"]') ||
                         Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.includes('Inventory'));
          if (navBtn) navBtn.click();
          if (typeof window.renderInventoryTable === 'function') window.renderInventoryTable();

          const boxAdjustModal = document.getElementById('boxAdjustModal');
          const modalEditInventoryBook = document.getElementById('modalEditInventoryBook');

          // Test 1: Tap Active Box 61 in Inventory Table
          // Switch to Active or All tab to ensure row is visible
          const activeTabBtn = document.querySelector('#invSegmentedTabs .inv-seg-tab[data-tab="active"]') ||
                               document.querySelector('#invFilterTabs .inv-tab-pill[data-tab="active"]');
          if (activeTabBtn) activeTabBtn.click();
          if (typeof window.renderInventoryTable === 'function') window.renderInventoryTable();

          const tr61 = document.querySelector('tr[data-pack-num="610455"]');
          results.tr61Found = Boolean(tr61);
          if (tr61) tr61.click();

          results.modalEditInventoryBookOpenAfterTr61 = Boolean(modalEditInventoryBook && modalEditInventoryBook.open);
          results.boxAdjustModalOpenAfterTr61 = Boolean(boxAdjustModal && boxAdjustModal.open);
          results.boxBadgeText = document.getElementById('boxDetailNumBadge')?.textContent?.trim();
          results.boxTitleText = document.getElementById('box-h')?.textContent?.trim();
          results.boxSubtitleText = document.getElementById('boxDetailSubtitle')?.textContent?.trim();
          results.openPosText = document.getElementById('boxDetailOpenPos')?.textContent?.trim();
          results.packSizeText = document.getElementById('boxDetailPackSize')?.textContent?.trim();

          // Check tabs exist
          const tabMove = document.getElementById('tabBoxMove');
          const tabEdit = document.getElementById('tabBoxEdit');
          const tabRemove = document.getElementById('tabBoxRemove');
          results.hasMoveTab = Boolean(tabMove);
          results.hasEditTab = Boolean(tabEdit);
          results.hasRemoveTab = Boolean(tabRemove);

          // Switch to Edit Details Tab
          if (tabEdit) tabEdit.click();
          const boxEditTabContent = document.getElementById('boxEditTabContent');
          const btnSaveEdit = document.getElementById('btnExecuteSaveBoxEdit');
          results.editTabContentVisible = boxEditTabContent?.style.display === 'block';
          results.btnSaveEditVisible = btnSaveEdit?.style.display !== 'none';
          results.editPosVal = document.getElementById('boxEditPosInput')?.value;
          results.editPriceVal = document.getElementById('boxEditPriceInput')?.value;

          // Edit Current Position to 005 and Save
          const editPosInput = document.getElementById('boxEditPosInput');
          if (editPosInput) editPosInput.value = '005';
          if (btnSaveEdit) btnSaveEdit.click();

          results.modalClosedAfterSave = !boxAdjustModal?.open;
          results.slot61UpdatedTicket = slot61?.currentTicket;

          // Test 2: Tap In-Stock Pack 1911417 in Inventory Table
          // Switch to In Stock tab
          const inStockSegBtn = document.querySelector('#invSegmentedTabs .inv-seg-tab[data-tab="in_stock"]') ||
                                document.querySelector('#invFilterTabs .inv-tab-pill[data-tab="in_stock"]');
          if (inStockSegBtn) inStockSegBtn.click();
          if (typeof window.renderInventoryTable === 'function') window.renderInventoryTable();

          const trStock = document.querySelector('tr[data-pack-num="1911417"]');
          results.trStockFound = Boolean(trStock);
          if (trStock) trStock.click();

          results.boxAdjustModalOpenAfterStock = Boolean(boxAdjustModal && boxAdjustModal.open);
          results.stockBadgeText = document.getElementById('boxDetailNumBadge')?.textContent?.trim();
          results.stockTitleText = document.getElementById('box-h')?.textContent?.trim();
          results.stockSubtitleText = document.getElementById('boxDetailSubtitle')?.textContent?.trim();
          results.stockPosText = document.getElementById('boxDetailOpenPos')?.textContent?.trim();

          // Switch to Edit Details Tab on In-Stock item
          if (tabEdit) tabEdit.click();
          results.stockEditPosVal = document.getElementById('boxEditPosInput')?.value;
          if (editPosInput) editPosInput.value = '008';
          if (btnSaveEdit) btnSaveEdit.click();

          const updatedStockItem = window.state.inStockInventory.find(p => p.packNumber === '1911417');
          results.stockItemUpdatedPos = updatedStockItem?.position;
          results.modalClosedAfterStockSave = !boxAdjustModal?.open;

          return { success: true, results };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack };
        }
      })()
    `);

    console.log('Raw CDP Result:', JSON.stringify(result, null, 2));
    const testData = result?.result?.value || result?.value;
    console.log('Test Execution Result:', JSON.stringify(testData, null, 2));

    if (!testData?.success) {
      throw new Error(`In-browser evaluation failed: ${testData?.error}\n${testData?.stack}`);
    }

    const r = testData.results;

    console.log('\n--- Group 1: Tapping Active Box in Inventory Table ---');
    assert(r.tr61Found, 'Box 61 row found in inventory table');
    assert(!r.modalEditInventoryBookOpenAfterTr61, 'Image 1 (modalEditInventoryBook) is NOT opened');
    assert(r.boxAdjustModalOpenAfterTr61, 'Image 2 (boxAdjustModal) IS opened');
    assert.strictEqual(r.boxBadgeText, '61', 'Box badge displays 61');
    assert(r.boxTitleText.includes('Box 61') && r.boxTitleText.includes('10X Money'), 'Box title displays Box 61 · 10X Money');
    assert(r.boxSubtitleText.includes('Pack 610455'), 'Box subtitle displays Pack 610455');
    assert.strictEqual(r.openPosText, '000', 'Opening position displays 000');
    assert.strictEqual(r.packSizeText, '150', 'Pack size displays 150');
    console.log('  ✓ PASS: Active inventory row opens sleek Box Details modal (Image 2) instead of big dialog');

    console.log('\n--- Group 2: Edit Details Tab on Active Box ---');
    assert(r.hasMoveTab && r.hasEditTab && r.hasRemoveTab, 'Tabs: Change box, Edit details, Remove book exist');
    assert(r.editTabContentVisible, 'Edit Details tab content visible after clicking tab');
    assert(r.btnSaveEditVisible, 'Save changes button visible in footer');
    assert.strictEqual(r.editPosVal, '000', 'Current position input prefilled with 000');
    assert.strictEqual(r.editPriceVal, '10', 'Price input prefilled with 10');
    assert(r.modalClosedAfterSave, 'Modal closed after saving changes');
    assert.strictEqual(r.slot61UpdatedTicket, 5, 'Slot 61 currentTicket successfully updated to 5');
    console.log('  ✓ PASS: Edit Details tab functions correctly and saves changes to active box');

    console.log('\n--- Group 3: Tapping In-Stock Pack in Inventory Table ---');
    assert(r.trStockFound, 'In-stock pack 1911417 row found in inventory table');
    assert(r.boxAdjustModalOpenAfterStock, 'Image 2 (boxAdjustModal) opens for in-stock pack');
    assert.strictEqual(r.stockBadgeText, 'STK', 'Badge displays STK');
    assert(r.stockTitleText.includes('In Stock') && r.stockTitleText.includes('Scratch Game 8415'), 'Title displays In Stock · Scratch Game 8415');
    assert(r.stockSubtitleText.includes('Pack 1911417') && r.stockSubtitleText.includes('$10'), 'Subtitle displays Pack 1911417 and $10');
    assert.strictEqual(r.stockPosText, '004', 'Position displays 004');
    assert.strictEqual(r.stockEditPosVal, '004', 'Edit position input prefilled with 004');
    assert.strictEqual(r.stockItemUpdatedPos, '008', 'In-stock inventory item updated to 008');
    assert(r.modalClosedAfterStockSave, 'Modal closed after saving changes to in-stock item');
    console.log('  ✓ PASS: In-stock pack uses unified sleek modal and supports editing details');

    console.log('\n================================================================');
    console.log('   ALL INVENTORY ROW TAP MODAL TESTS PASSED PERFECTLY!          ');
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    try { p.kill(); } catch (_) {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    process.exit(process.exitCode || 0);
  }
}, 1000);
