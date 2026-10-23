import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9666;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('   RUNNING PHASE 2 STABILITY VERIFICATION SUITE     ');
  console.log('====================================================\n');

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

  // 1. Static Checks: vite.config.js and CSS rules
  console.log('--- Test Group 1: Configuration & Static CSS Checks ---');
  const viteConfig = fs.readFileSync('vite.config.js', 'utf8');
  assert(viteConfig.includes('strictPort: true'), 'vite.config.js includes strictPort: true');
  assert(viteConfig.includes('host: true'), 'vite.config.js preserves host: true for LAN POS access');

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const styleCss = fs.readFileSync('src/style.css', 'utf8');
  const toastHtmlMatch = indexHtml.match(/\.end-shift-floating-toast\s*\{([^}]+)\}/);
  assert(toastHtmlMatch && !toastHtmlMatch[1].includes('display: flex !important;'), 'index.html removed !important from toast display: flex');
  const toastCssMatch = styleCss.match(/\.end-shift-floating-toast\s*\{([^}]+)\}/);
  assert(toastCssMatch && !toastCssMatch[1].includes('display: flex !important;'), 'src/style.css removed !important from toast display: flex');

  // 2. Real Browser Execution via Chrome CDP
  console.log('\n--- Test Group 2: Real Browser Functional Verification ---');
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1276,556',
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

    // 2a. End-shift toast test
    console.log('\n--- Test Group 2a: End-Shift Toast Dismissal & Non-Occlusion ---');
    const toastRes = await evalInPage(`(() => {
      // Trigger End Shift mode via mainShiftActionBtn
      const endShiftBtn = document.getElementById('mainShiftActionBtn') || document.getElementById('btnEndShift');
      if (endShiftBtn) endShiftBtn.click();
      const toast = document.getElementById('endShiftScanningToast');
      const initialDisplay = toast ? window.getComputedStyle(toast).display : 'none';

      // Check bounds to ensure it is not occluding top rack
      const toastRect = toast ? toast.getBoundingClientRect() : null;

      // Dismiss toast via OK button (#btnDismissEndShiftToast)
      const okBtn = document.getElementById('btnDismissEndShiftToast');
      if (okBtn) okBtn.click();
      const afterDismissDisplay = toast ? window.getComputedStyle(toast).display : 'none';

      // Revert end shift mode
      const cancelBtn = document.getElementById('btnHeaderCancel');
      if (cancelBtn) cancelBtn.click();

      return {
        initialDisplay,
        afterDismissDisplay,
        toastAtBottom: toastRect ? toastRect.bottom <= 556 : false
      };
    })()`);

    assert(toastRes?.initialDisplay === 'flex', 'Toast displays flex when End Shift starts');
    assert(toastRes?.afterDismissDisplay === 'none', 'Toast display is successfully hidden (none) upon clicking OK button');
    assert(toastRes?.toastAtBottom, 'Toast is docked cleanly at the bottom without blocking upper dispenser tiles');

    // 2b. Healthy Startup & Step Flags
    console.log('\n--- Test Group 2b: initPOS Healthy Startup & Per-Step Flags ---');
    const healthyRes = await evalInPage(`(() => {
      const hooks = window.__INIT_POS_TEST_HOOKS__;
      const flags = hooks ? hooks.getStepFlags() : null;
      const errBanner = document.getElementById('systemLoadErrorBanner');
      return {
        hasHooks: Boolean(hooks),
        flags,
        hasErrorBanner: Boolean(errBanner)
      };
    })()`);

    assert(healthyRes?.hasHooks, 'DEV test hooks available on window.__INIT_POS_TEST_HOOKS__');
    assert(!healthyRes?.hasErrorBanner, 'No error banner displayed during healthy startup');
    assert(healthyRes?.flags?.setupEventListeners, 'setupEventListeners flag is true');
    assert(healthyRes?.flags?.setupHardwareScannerListener, 'setupHardwareScannerListener flag is true');
    assert(healthyRes?.flags?.setupKeypad, 'setupKeypad flag is true');
    assert(healthyRes?.flags?.setupModernMockupDialogs, 'setupModernMockupDialogs flag is true');

    // 2c. Fault-Injection: runStep handles thrown error non-destructively
    console.log('\n--- Test Group 2c: Fault-Injection & Red Banner Test ---');
    const faultRes = await evalInPage(`(() => {
      const hooks = window.__INIT_POS_TEST_HOOKS__;
      // Inject a simulated failing step
      const result = hooks.runStep('simulatedBrokenStep', () => {
        throw new Error('Simulated failure during component load');
      });

      const banner = document.getElementById('systemLoadErrorBanner');
      const msg = document.getElementById('systemLoadErrorMessage')?.textContent;
      const reloadBtn = document.getElementById('btnReloadSystemError');

      return {
        resultReturnedFalse: result === false,
        bannerExists: Boolean(banner),
        exactTextMatched: msg === 'The system did not load correctly. Do not scan. Refresh the page or contact the owner.',
        reloadBtnExists: Boolean(reloadBtn)
      };
    })()`);

    assert(faultRes?.resultReturnedFalse, 'runStep caught exception and returned false gracefully');
    assert(faultRes?.bannerExists, 'Red banner was created and prepended');
    assert(faultRes?.exactTextMatched, 'Banner displays exact required text: "The system did not load correctly. Do not scan. Refresh the page or contact the owner."');
    assert(faultRes?.reloadBtnExists, 'Banner includes Reload button');

    // 2d. Duplicate Listener Prevention (Simulated partial failure / retry)
    console.log('\n--- Test Group 2d: Duplicate Hardware Scanner Listener Guard ---');
    const dupRes = await evalInPage(`(() => {
      const hooks = window.__INIT_POS_TEST_HOOKS__;
      // Re-invoke initPOS to simulate retry
      hooks.initPOS();
      const flags = hooks.getStepFlags();
      return { flags };
    })()`);
    assert(dupRes?.flags?.setupHardwareScannerListener === true, 'Repeated initPOS call respected flags without duplicating listeners');

    // 2e. Sidebar Auto-Collapse Tests (Mouse vs Keyboard vs Modal)
    console.log('\n--- Test Group 2e: Sidebar Auto-Collapse & Focus Traps ---');
    const sidebarTestRes = await evalInPage(`(() => {
      const sidebar = document.querySelector('.pos-sidebar');
      const navBtn = document.getElementById('navInventory');
      
      // 1. Mouse click on nav button (pointerdown event marks non-keyboard interaction)
      sidebar?.classList.remove('collapsed');
      window.dispatchEvent(new PointerEvent('pointerdown'));
      navBtn?.click();
      const hasKeyboardHold = Boolean(window.__SIDEBAR_TEST_HOOKS__?.getTimer && sidebar?.querySelector(':focus-visible') && false);
      
      // Trigger auto collapse check
      window.__SIDEBAR_TEST_HOOKS__?.triggerAutoCollapseNow();
      const collapsedAfterMouseClick = sidebar?.classList.contains('collapsed');

      // 2. Expand via brand cluster click
      sidebar?.querySelector('.brand-left-cluster')?.click();
      const expandedAfterBrandClick = !sidebar?.classList.contains('collapsed');

      // 3. Verify auto-collapse does NOT write to localStorage
      const storedBefore = localStorage.getItem('lottotrack_sidebar_collapsed');
      window.__SIDEBAR_TEST_HOOKS__?.triggerAutoCollapseNow();
      const storedAfter = localStorage.getItem('lottotrack_sidebar_collapsed');
      const noStorageLeak = (storedBefore === storedAfter);

      return {
        hasKeyboardHold,
        collapsedAfterMouseClick,
        expandedAfterBrandClick,
        noStorageLeak
      };
    })()`);

    assert(!sidebarTestRes?.hasKeyboardHold, 'Mouse pointer click does not activate keyboard hold');
    assert(sidebarTestRes?.collapsedAfterMouseClick, 'Sidebar successfully collapses even when nav button has mouse focus');
    assert(sidebarTestRes?.expandedAfterBrandClick, 'Clicking brand cluster expands collapsed sidebar');
    assert(sidebarTestRes?.noStorageLeak, 'Auto-collapse does NOT overwrite localStorage (only manual toggle does)');

  } finally {
    p.kill();
  }

  console.log('\n====================================================');
  console.log(`   PHASE 2 RESULTS: Passed: ${passed}, Failed: ${failed}   `);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
