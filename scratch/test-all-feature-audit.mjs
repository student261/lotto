import { spawn } from 'child_process';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9251;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== VERIFYING ALL SCREENS & FULL FUNCTIONALITY ===\n');
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
    const errors = [];

    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push(d.params.exceptionDetails);
        console.error('Browser Exception:', JSON.stringify(d.params.exceptionDetails));
      }
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

    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);

    // 1. Screen Switching & Views Visibility
    console.log('--- 1. Screen Navigation ---');
    const navResults = await evaluate(`
      (() => {
        const tests = [
          { name: 'Sell Counter', show: () => window.showSellCounterView(), id: 'viewSellCounter' },
          { name: 'Receive Packs', show: () => window.showReceivePacksView(), id: 'viewReceivePacks' },
          { name: 'Close Shift', show: () => window.showCloseShiftView(), id: 'viewCloseShift' },
          { name: 'Shift Closed', show: () => window.showShiftClosedView(), id: 'viewShiftClosed' },
          { name: 'Start Handover', show: () => window.showStartShiftHandoverView(), id: 'viewStartShiftHandover' },
          { name: 'Day Report', show: () => window.showDayReportView(), id: 'viewDayReport' },
          { name: 'Inventory', show: () => window.showInventoryView(), id: 'viewInventory' },
          { name: 'History', show: () => window.showHistoryView(), id: 'viewHistory' },
          { name: 'Settings', show: () => window.showSettingsView(), id: 'viewSettings' }
        ];
        return tests.map(t => {
          t.show();
          const el = document.getElementById(t.id);
          const isVisible = el && el.style.display !== 'none' && !el.classList.contains('hidden-view');
          return { screen: t.name, visible: isVisible };
        });
      })()
    `);
    console.log('Navigation results:', navResults);
    navResults.forEach(r => assert.equal(r.visible, true, `${r.screen} should be visible`));

    // Return to Sell Counter
    await evaluate(`window.showSellCounterView();`);
    await sleep(300);

    // 2. Sell Counter Operations
    console.log('\n--- 2. Sell Counter Operations ---');
    const sellCounterOps = await evaluate(`
      (() => {
        // Test filter chip
        const chip1 = document.querySelector('.filter-chip[data-filter="1"]');
        chip1?.click();
        const cardsFilter1 = Array.from(document.querySelectorAll('.box-card')).filter(c => c.style.display !== 'none').length;
        document.querySelector('.filter-chip[data-filter="all"]')?.click();
        const cardsFilterAll = Array.from(document.querySelectorAll('.box-card')).filter(c => c.style.display !== 'none').length;

        // Test quick sell (+1)
        const b1Card = document.querySelector('.box-card[data-box="1"]');
        const preTix = b1Card?.querySelector('.ticket-number-display')?.textContent;
        const btnPlus = b1Card?.querySelector('.quick-sell-btn');
        if (btnPlus) btnPlus.click();
        const postCard = document.querySelector('.box-card[data-box="1"]');
        const postTix = postCard?.querySelector('.ticket-number-display')?.textContent;

        return {
          cardsFilter1,
          cardsFilterAll,
          preTix,
          postTix
        };
      })()
    `);
    console.log('Sell Counter Ops:', sellCounterOps);
    assert.equal(sellCounterOps.cardsFilter1, 2);
    assert.equal(sellCounterOps.cardsFilterAll, 19);

    // 3. Close Shift Operations
    console.log('\n--- 3. Close Shift Operations ---');
    await evaluate(`window.showCloseShiftView();`);
    await sleep(300);
    const csOps = await evaluate(`
      (() => {
        const btnSaveDraft = document.getElementById('csSaveDraftBtn');
        const btnOverride = document.getElementById('csManagerOverrideBtn');
        const btnPrimary = document.getElementById('csPrimaryActionBtn');
        const rows = document.querySelectorAll('#csTableBody tr');
        return {
          hasSaveDraft: !!btnSaveDraft,
          hasOverride: !!btnOverride,
          hasPrimary: !!btnPrimary,
          rowCount: rows.length
        };
      })()
    `);
    console.log('Close Shift Ops:', csOps);
    assert.equal(csOps.hasSaveDraft, true);
    assert.equal(csOps.hasPrimary, true);
    assert.equal(csOps.rowCount, 19);

    // 4. Day Report View & Printable Sheet
    console.log('\n--- 4. Day Report Operations ---');
    await evaluate(`window.showDayReportView();`);
    await sleep(300);
    const drOps = await evaluate(`
      (() => {
        const printBtn = document.getElementById('drBtnPrintTopHeader');
        const correctBtn = document.getElementById('drBtnCorrectReport');
        const storeName = document.getElementById('drSheetStoreName')?.textContent;
        const totalSales = document.getElementById('drSheetTotalSales')?.textContent;
        return {
          hasPrintBtn: !!printBtn,
          hasCorrectBtn: !!correctBtn,
          storeName,
          totalSales
        };
      })()
    `);
    console.log('Day Report Ops:', drOps);
    assert.equal(drOps.hasPrintBtn, true);
    assert.equal(drOps.storeName, 'AMIGO FOOD MART');

    // 5. Inventory View & Update Inventory Banner
    console.log('\n--- 5. Inventory View Operations ---');
    await evaluate(`window.showInventoryView();`);
    await sleep(300);
    const invOps = await evaluate(`
      (() => {
        const btnUpdate = document.getElementById('invBtnToggleUpdateInventory');
        const banner = document.getElementById('invUpdateBanner');
        const preDisplay = banner?.style.display;
        btnUpdate?.click();
        const postDisplay = banner?.style.display;
        const scanInp = document.getElementById('invScanBarcodeInput');
        return {
          hasBtnUpdate: !!btnUpdate,
          preDisplay,
          postDisplay,
          hasScanInput: !!scanInp
        };
      })()
    `);
    console.log('Inventory Ops:', invOps);
    assert.equal(invOps.hasBtnUpdate, true);
    assert.equal(invOps.postDisplay, 'block');
    assert.equal(invOps.hasScanInput, true);

    // 6. History View Operations
    console.log('\n--- 6. History View Operations ---');
    await evaluate(`window.showHistoryView();`);
    await sleep(300);
    const histOps = await evaluate(`
      (() => {
        const btnExport = document.getElementById('exportHistoryCsvBtn');
        const tabShift = document.getElementById('btnSwitchShiftReports');
        const tabDaily = document.getElementById('btnSwitchDailyReport');
        return {
          hasExportBtn: !!btnExport,
          hasTabShift: !!tabShift,
          hasTabDaily: !!tabDaily
        };
      })()
    `);
    console.log('History Ops:', histOps);
    assert.equal(histOps.hasExportBtn, true);

    // 7. Settings View Tabs
    console.log('\n--- 7. Settings View Operations ---');
    await evaluate(`window.showSettingsView();`);
    await sleep(300);
    const setOps = await evaluate(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('.btn-settings-top-tab'));
        const activeTab = document.querySelector('.btn-settings-top-tab.active')?.getAttribute('data-tab');
        const storeName = document.getElementById('setStoreName')?.value;
        const totalBoxes = document.getElementById('settingsTotalBoxesDisplay')?.textContent;
        return {
          tabCount: tabs.length,
          activeTab,
          storeName,
          totalBoxes
        };
      })()
    `);
    console.log('Settings Ops:', setOps);
    assert.equal(setOps.tabCount, 4);
    assert.equal(setOps.totalBoxes, '65');

    // 8. Dark Mode Toggle
    console.log('\n--- 8. Theme Toggle ---');
    const themeOps = await evaluate(`
      (() => {
        const btn = document.getElementById('themeToggleBtn');
        const preTheme = document.documentElement.getAttribute('data-theme');
        btn?.click();
        const midTheme = document.documentElement.getAttribute('data-theme');
        btn?.click();
        const postTheme = document.documentElement.getAttribute('data-theme');
        return { preTheme, midTheme, postTheme };
      })()
    `);
    console.log('Theme Toggle Ops:', themeOps);

    console.log('\nTotal exceptions detected across entire audit:', errors.length);
    assert.equal(errors.length, 0, 'Zero browser exceptions allowed');
    console.log('✓ ALL FUNCTIONALITY AUDIT CHECKS PASSED PERFECTLY!');
  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error('TEST AUDIT FAILED:', err);
  process.exit(1);
});
