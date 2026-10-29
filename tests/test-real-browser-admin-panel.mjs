// ============================================================================
// Real-Browser End-to-End Test: Jackpotlo Admin Panel (All 7 Features)
// ============================================================================

import { spawn, execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9796;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('\n====================================================');
  console.log('   REAL-BROWSER VERIFICATION: ADMIN PANEL (7 SECTIONS)  ');
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

  // Ensure admin credentials are known
  execSync('node scripts/manage-admin.cjs reset admin BrowserTestPass123!');

  const tmpProfile = mkdtempSync(join(tmpdir(), 'chrome-admin-real-'));

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'http://127.0.0.1:5173/#admin?bypass_login=1'
  ]);

  try {
    let targets = null;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json`);
        targets = await res.json();
        break;
      } catch (e) {
        await sleep(250);
      }
    }

    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((resolve) => (ws.onopen = resolve));
    await send('Runtime.enable');
    await send('Page.enable');

    async function evalCode(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.result.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.exception.description);
      }
      return res.result.result.value;
    }

    // Wait for DOM to load
    await sleep(2000);

    // ------------------------------------------------------------------------
    // Step 0: Set active admin session in browser
    // ------------------------------------------------------------------------
    console.log('--- Step 0: Authenticating & Loading Admin View ---');
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'BrowserTestPass123!' })
    });
    const loginData = await loginRes.json();
    const adminToken = loginData.token;

    await evalCode(`
      sessionStorage.setItem('lotto_admin_token', ${JSON.stringify(adminToken)});
      localStorage.setItem('lotto_admin_token', ${JSON.stringify(adminToken)});
      sessionStorage.setItem('lotto_session_user', JSON.stringify({
        name: 'Platform Administrator',
        signInName: 'admin',
        isAdmin: true,
        role: 'SUPER_ADMIN',
        adminToken: ${JSON.stringify(adminToken)}
      }));
      window.location.hash = '#admin';
      if (typeof showAdminDashboardView === 'function') {
        showAdminDashboardView();
      }
    `);

    await sleep(1500);

    // ------------------------------------------------------------------------
    // Section 1: Dashboard Overview
    // ------------------------------------------------------------------------
    console.log('\n--- Section 1: Dashboard KPIs ---');
    const isDashboardVisible = await evalCode(`document.getElementById('viewAdminDashboard')?.style.display !== 'none'`);
    assert(isDashboardVisible, 'viewAdminDashboard is visible in real browser');

    const totalStoresKpi = await evalCode(`document.getElementById('adminKpiTotalStores')?.textContent`);
    const pendingAppsKpi = await evalCode(`document.getElementById('adminKpiPendingApps')?.textContent`);
    const approvedStoresKpi = await evalCode(`document.getElementById('adminKpiApprovedStores')?.textContent`);
    const suspendedStoresKpi = await evalCode(`document.getElementById('adminKpiSuspendedStores')?.textContent`);

    assert(Number(totalStoresKpi) >= 2, `Total Stores KPI shows database stores (got ${totalStoresKpi})`);
    assert(Number(pendingAppsKpi) >= 0, `Pending Apps KPI shows count (got ${pendingAppsKpi})`);
    assert(Number(approvedStoresKpi) >= 1, `Approved Stores KPI shows count (got ${approvedStoresKpi})`);
    assert(Number(suspendedStoresKpi) >= 0, `Suspended Stores KPI shows count (got ${suspendedStoresKpi})`);

    // ------------------------------------------------------------------------
    // Section 2: Store Applications
    // ------------------------------------------------------------------------
    console.log('\n--- Section 2: Store Applications ---');
    await evalCode(`document.querySelector('[data-admin-tab="applications"]')?.click()`);
    await sleep(800);

    const appsRowCount = await evalCode(`document.getElementById('adminApplicationsTableBody')?.children.length`);
    assert(appsRowCount >= 1, `Store applications table rendered database records (rows: ${appsRowCount})`);

    const hasReviewBtn = await evalCode(`document.querySelector('.btn-review-app') !== null`);
    assert(hasReviewBtn, 'Review button exists on application row');

    // ------------------------------------------------------------------------
    // Section 3: Store Management
    // ------------------------------------------------------------------------
    console.log('\n--- Section 3: Store Management ---');
    await evalCode(`document.querySelector('[data-admin-tab="stores"]')?.click()`);
    await sleep(800);

    const storesRowCount = await evalCode(`document.getElementById('adminStoresTableBody')?.children.length`);
    assert(storesRowCount >= 2, `Store management table rendered stores (rows: ${storesRowCount})`);

    const hasSuspendOrReactivate = await evalCode(`
      document.querySelector('.btn-suspend-store, .btn-reactivate-store') !== null
    `);
    assert(hasSuspendOrReactivate, 'Suspend/Reactivate action buttons exist in store management');

    // ------------------------------------------------------------------------
    // Section 4: Central Lottery Ticket Catalog (Add, Edit, Deactivate)
    // ------------------------------------------------------------------------
    console.log('\n--- Section 4: Lottery Ticket Catalog ---');
    await evalCode(`document.querySelector('[data-admin-tab="catalog"]')?.click()`);
    await sleep(800);

    const catalogRowCount = await evalCode(`document.getElementById('adminCatalogTableBody')?.children.length`);
    assert(catalogRowCount >= 5, `Ticket catalog table rendered catalog games (rows: ${catalogRowCount})`);

    const hasEditBtn = await evalCode(`document.querySelector('.btn-edit-game') !== null`);
    assert(hasEditBtn, 'Edit button exists on catalog rows');

    const hasToggleBtn = await evalCode(`document.querySelector('.btn-toggle-game') !== null`);
    assert(hasToggleBtn, 'Deactivate/Activate button exists on catalog rows');

    // Test clicking Edit Game
    await evalCode(`document.querySelector('.btn-edit-game')?.click()`);
    await sleep(500);
    const modalTitle = await evalCode(`document.getElementById('adminCatalogModalTitle')?.textContent`);
    const isEditVal = await evalCode(`document.getElementById('adminGameIsEdit')?.value`);
    assert(modalTitle.includes('Edit Game'), `Edit modal opened with correct title: "${modalTitle}"`);
    assert(isEditVal === '1', 'adminGameIsEdit input correctly set to 1');
    await evalCode(`document.getElementById('closeAdminAddGameModalBtn')?.click()`);

    // ------------------------------------------------------------------------
    // Section 5: Store Ticket Requests
    // ------------------------------------------------------------------------
    console.log('\n--- Section 5: Store Ticket Requests ---');
    await evalCode(`document.querySelector('[data-admin-tab="requests"]')?.click()`);
    await sleep(800);

    const requestsBodyContent = await evalCode(`document.getElementById('adminRequestsTableBody')?.innerHTML`);
    assert(requestsBodyContent.length > 20, 'Store ticket requests pane loaded properly');

    // ------------------------------------------------------------------------
    // Section 6: Stock Allocations
    // ------------------------------------------------------------------------
    console.log('\n--- Section 6: Ticket Stock Allocation ---');
    await evalCode(`document.querySelector('[data-admin-tab="allocations"]')?.click()`);
    await sleep(800);

    const hasAllocModalBtn = await evalCode(`document.getElementById('btnAdminOpenNewAllocationModal') !== null`);
    assert(hasAllocModalBtn, '+ Allocate Stock to Store button exists');

    const allocsRowCount = await evalCode(`document.getElementById('adminAllocationsTableBody')?.children.length`);
    assert(allocsRowCount >= 1, `Allocations table rendered allocation records (rows: ${allocsRowCount})`);

    // ------------------------------------------------------------------------
    // Section 7: Multi-Store Reports
    // ------------------------------------------------------------------------
    console.log('\n--- Section 7: Multi-Store Reports ---');
    await evalCode(`document.querySelector('[data-admin-tab="reports"]')?.click()`);
    await sleep(800);

    const salesRowCount = await evalCode(`document.getElementById('adminReportSalesTableBody')?.children.length`);
    assert(salesRowCount >= 1, `Store sales report rendered database-backed data (rows: ${salesRowCount})`);

    // Click inventory tab
    await evalCode(`document.querySelector('[data-report-tab="inventory"]')?.click()`);
    await sleep(400);
    const invDisplay = await evalCode(`document.getElementById('adminReportSectionInventory')?.style.display !== 'none'`);
    assert(invDisplay, 'Ticket inventory sub-report section toggled visible');

    // Click shifts tab
    await evalCode(`document.querySelector('[data-report-tab="shifts"]')?.click()`);
    await sleep(400);
    const shiftsDisplay = await evalCode(`document.getElementById('adminReportSectionShifts')?.style.display !== 'none'`);
    assert(shiftsDisplay, 'Shift reports sub-report section toggled visible');

    // Click discrepancies tab
    await evalCode(`document.querySelector('[data-report-tab="discrepancies"]')?.click()`);
    await sleep(400);
    const discDisplay = await evalCode(`document.getElementById('adminReportSectionDiscrepancies')?.style.display !== 'none'`);
    assert(discDisplay, 'Stock discrepancies sub-report section toggled visible');

    // ------------------------------------------------------------------------
    // Section 8: Store Interface & Sidebar Isolation
    // ------------------------------------------------------------------------
    console.log('\n--- Section 8: POS Interface & Normal Sidebar Isolation ---');
    await evalCode(`document.getElementById('btnAdminSwitchToStore')?.click()`);
    await sleep(800);

    const isCounterVisible = await evalCode(`document.getElementById('viewSellCounter')?.style.display !== 'none'`);
    assert(isCounterVisible, 'Successfully switched to Store POS counter view');

    // Verify normal sidebar nav items
    const sidebarHtml = await evalCode(`document.querySelector('.sidebar-nav')?.innerHTML`);
    assert(!sidebarHtml.includes('Admin'), 'Normal store user sidebar has zero admin text/links');
    assert(!sidebarHtml.includes('navAdminPortal'), 'Normal store user sidebar does not contain navAdminPortal');
    assert(sidebarHtml.includes('Dashboard'), 'Sidebar retains Dashboard link');
    assert(sidebarHtml.includes('Inventory'), 'Sidebar retains Inventory link');
    assert(sidebarHtml.includes('Reports'), 'Sidebar retains Reports link');
    assert(sidebarHtml.includes('Settings'), 'Sidebar retains Settings link');

    console.log('\n====================================================');
    console.log(`   REAL-BROWSER RESULTS: Passed: ${passed}, Failed: ${failed}`);
    console.log('====================================================\n');

  } finally {
    try { p.kill(); } catch (_) {}
    try { rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
  }

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal browser test error:', err);
  process.exit(1);
});

