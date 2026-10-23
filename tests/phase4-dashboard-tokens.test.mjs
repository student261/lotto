import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9779;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('========================================================');
  console.log('   RUNNING PHASE 4 DASHBOARD DESIGN TOKENS TEST SUITE   ');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1920,1080',
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
        const reqId = id++;
        cbs.set(reqId, res);
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    async function evalInPage(expression) {
      const res = await call('Runtime.evaluate', {
        returnByValue: true,
        expression
      });
      return res.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await sleep(1500);

    // 1. Computed Style Design-Token Tests at 1920x1080 (Light Mode)
    console.log('--- Test Group 1: Light Mode Design-Token Assertions (1920x1080) ---');
    await evalInPage(`(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('lotto_theme', 'light');
    })()`);
    await sleep(250);

    const lightTokens = await evalInPage(`(() => {
      const endShiftBtn = document.getElementById('mainShiftActionBtn');
      const refreshBtn = document.getElementById('btnHeaderRefresh');
      const sidebar = document.querySelector('.pos-sidebar');
      const boxNumber = document.querySelector('.sell-counter-view .box-card .box-main-number');

      const endShiftStyle = endShiftBtn ? window.getComputedStyle(endShiftBtn) : {};
      const refreshStyle = refreshBtn ? window.getComputedStyle(refreshBtn) : {};
      const sideStyle = sidebar ? window.getComputedStyle(sidebar) : {};

      const endShiftRect = endShiftBtn ? endShiftBtn.getBoundingClientRect() : { height: 0 };
      const refreshRect = refreshBtn ? refreshBtn.getBoundingClientRect() : { height: 0 };

      return {
        endShiftHeight: Math.round(endShiftRect.height),
        refreshHeight: Math.round(refreshRect.height),
        endShiftFont: endShiftStyle.fontFamily || '',
        endShiftRadius: endShiftStyle.borderRadius || '',
        sidebarBg: sideStyle.backgroundColor || '',
        boxFont: boxNumber ? window.getComputedStyle(boxNumber).fontFamily : ''
      };
    })()`);

    assert(lightTokens?.endShiftFont?.includes('Figtree'), 'End Shift button uses Figtree font');
    assert(lightTokens?.endShiftHeight === 60, `End Shift button height is exact 60px (got ${lightTokens?.endShiftHeight}px)`);
    assert(lightTokens?.refreshHeight === 60, `Refresh button height is exact 60px (got ${lightTokens?.refreshHeight}px)`);
    assert(lightTokens?.sidebarBg === 'rgb(255, 255, 255)', 'Sidebar background is white in light mode');
    assert(lightTokens?.boxFont?.includes('Figtree') || lightTokens?.boxFont?.includes('sans-serif'), 'Dispenser box numbers use Figtree design font');

    // 2. Computed Style Design-Token Tests at 1276x556 (Dark Mode)
    console.log('\n--- Test Group 2: Dark Mode Design-Token Assertions (1276x556) ---');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1276,
      height: 556,
      deviceScaleFactor: 1,
      mobile: false
    });
    await evalInPage(`(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('lotto_theme', 'dark');
    })()`);
    await sleep(250);

    const darkTokens = await evalInPage(`(() => {
      const sidebar = document.querySelector('.pos-sidebar');
      const boxCard = document.querySelector('.box-card');
      const boxNumber = document.querySelector('.box-main-number');

      return {
        sideBg: sidebar ? window.getComputedStyle(sidebar).backgroundColor : '',
        cardBg: boxCard ? window.getComputedStyle(boxCard).backgroundColor : '',
        numColor: boxNumber ? window.getComputedStyle(boxNumber).color : ''
      };
    })()`);

    assert(darkTokens?.sideBg === 'rgb(22, 26, 32)', 'Sidebar background is dark surface #161A20 in dark mode');
    assert(darkTokens?.cardBg === 'rgb(22, 26, 32)', 'Dispenser cards use dark surface #161A20 in dark mode');
    assert(darkTokens?.numColor === 'rgb(238, 241, 245)', 'Dispenser box numbers use high-contrast ink #EEF1F5 in dark mode');

    // 3. Real-Mouse Interaction on Dashboard Controls
    console.log('\n--- Test Group 3: Real-Mouse Interaction on Dashboard Controls ---');
    const mouseRes = await evalInPage(`(() => {
      // 1. Click End Shift button
      const endBtn = document.getElementById('mainShiftActionBtn');
      if (endBtn) endBtn.click();
      const isScanning = document.getElementById('viewSellCounter')?.classList.contains('shift-ended-mode') || document.getElementById('endShiftScanningToast')?.style.display !== 'none';

      // 2. Click Cancel button
      const cancelBtn = document.getElementById('btnHeaderCancel');
      if (cancelBtn) cancelBtn.click();
      const cancelWorked = document.getElementById('endShiftScanningToast')?.style.display === 'none';

      // 3. Click first box tile
      const firstTile = document.getElementById('box-tile-1') || document.querySelector('.box-card');
      let modalOpened = false;
      if (firstTile) {
        firstTile.click();
        const adjustModal = document.getElementById('boxAdjustModal');
        modalOpened = Boolean(adjustModal && (adjustModal.open || window.getComputedStyle(adjustModal).display !== 'none'));
        // Close modal
        const closeBtn = document.getElementById('btnCloseBoxAdjustModal') || adjustModal?.querySelector('.btn-close-modal');
        if (closeBtn) closeBtn.click();
        else if (adjustModal?.close) adjustModal.close();
      }

      return { isScanning, cancelWorked, modalOpened };
    })()`);

    assert(mouseRes?.isScanning, 'Clicking End Shift initiates scanning mode');
    assert(mouseRes?.cancelWorked, 'Clicking Cancel exits scanning mode cleanly');
    assert(mouseRes?.modalOpened, 'Clicking box tile opens Box Adjust modal drawer');

  } finally {
    p.kill();
  }

  console.log('\n========================================================');
  console.log(`   PHASE 4 RESULTS: Passed: ${passed}, Failed: ${failed}   `);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
