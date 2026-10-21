import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9299;

async function runTest() {
  console.log('--- Starting Settlement & Day Report Verification Test ---');

  // Spawn Headless Chrome
  const chromeProcess = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    'http://localhost:5173'
  ]);

  await new Promise(r => setTimeout(r, 2200));

  let targets;
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch (err) {
    console.error('Failed to connect to Chrome on port ' + PORT, err);
    chromeProcess.kill();
    process.exit(1);
  }

  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
  };
  await new Promise(r => ws.onopen = r);

  function call(method, params = {}) {
    return new Promise(res => {
      const reqId = id++;
      cbs.set(reqId, res);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await call('Page.enable');
  await new Promise(r => setTimeout(r, 1500));

  const getVal = res => (res?.result?.result?.value !== undefined ? res.result.result.value : res?.result?.value);

  // TEST 1: Initial state
  console.log('\n[1] Checking initial Dashboard state...');
  const initRes = await call('Runtime.evaluate', {
    expression: `(() => {
      const viewSell = document.getElementById('viewSellCounter');
      const viewReport = document.getElementById('viewDayReport');
      return {
        viewSellDisplay: viewSell ? getComputedStyle(viewSell).display : null,
        viewReportDisplay: viewReport ? getComputedStyle(viewReport).display : null,
        hash: window.location.hash
      };
    })()`,
    returnByValue: true
  });
  console.log('Initial State:', JSON.stringify(getVal(initRes), null, 2));

  // TEST 2: Click Settlement (#tabSettlement)
  console.log('\n[2] Clicking #tabSettlement (Settlement KPI Card)...');
  const settleClickRes = await call('Runtime.evaluate', {
    expression: `(() => {
      const tab = document.getElementById('tabSettlement');
      if (!tab) return { error: '#tabSettlement not found' };
      tab.click();

      const modal = document.getElementById('shiftReportModal');
      const viewReport = document.getElementById('viewDayReport');
      const viewSell = document.getElementById('viewSellCounter');

      return {
        modalOpen: modal ? modal.open : false,
        modalTitle: document.getElementById('shiftReportModalTitle')?.textContent,
        viewReportDisplay: viewReport ? getComputedStyle(viewReport).display : null,
        viewSellDisplay: viewSell ? getComputedStyle(viewSell).display : null,
        hash: window.location.hash
      };
    })()`,
    returnByValue: true
  });
  const v = getVal(settleClickRes);
  console.log('After Clicking #tabSettlement:', JSON.stringify(v, null, 2));

  // Capture screenshot of Settlement modal
  const shotSettle = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/settlement-modal-open.png', Buffer.from(shotSettle.result.data, 'base64'));
  console.log('Saved scratch/settlement-modal-open.png');

  // Verify settlement assertions
  if (!v || !v.modalOpen) {
    throw new Error('FAILURE: Shift/Day settlement modal did not open when clicking #tabSettlement!');
  }
  if (v.viewReportDisplay !== 'none') {
    throw new Error(`FAILURE: Day Report view appeared unexpectedly when clicking Settlement! Display is ${v.viewReportDisplay}`);
  }
  if (v.hash === '#day-report') {
    throw new Error('FAILURE: URL hash was erroneously set to #day-report when clicking Settlement!');
  }
  console.log('✓ PASS: Clicking Settlement opened Settlement Modal without showing Day Report!');

  // Close settlement modal
  await call('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('closeReportBtn');
      if (btn) btn.click();
      else document.getElementById('shiftReportModal')?.close();
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  // TEST 3: Navigate directly to Day Report (e.g. from Sidebar #navDayReport)
  console.log('\n[3] Navigating to Day Report via #navDayReport...');
  const dayReportNavRes = await call('Runtime.evaluate', {
    expression: `(() => {
      const nav = document.getElementById('navDayReport');
      if (nav) nav.click();

      const viewSell = document.getElementById('viewSellCounter');
      const viewReport = document.getElementById('viewDayReport');
      const mainCont = document.querySelector('.pos-main-container');

      return {
        viewSellDisplay: viewSell ? getComputedStyle(viewSell).display : null,
        viewSellOffsetHeight: viewSell ? viewSell.offsetHeight : null,
        viewSellHasHiddenClass: viewSell ? viewSell.classList.contains('hidden-view') : false,
        viewReportDisplay: viewReport ? getComputedStyle(viewReport).display : null,
        mainContScrollTop: mainCont ? mainCont.scrollTop : null,
        hash: window.location.hash
      };
    })()`,
    returnByValue: true
  });
  const drV = getVal(dayReportNavRes);
  console.log('Day Report View State:', JSON.stringify(drV, null, 2));

  await new Promise(r => setTimeout(r, 600));

  // Capture screenshot of Day Report
  const shotDayReport = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/day-report-clean-header.png', Buffer.from(shotDayReport.result.data, 'base64'));
  console.log('Saved scratch/day-report-clean-header.png');

  if (!drV || drV.viewSellDisplay !== 'none') {
    throw new Error(`FAILURE: viewSellCounter is NOT hidden when Day Report is open! Display is ${drV?.viewSellDisplay}`);
  }
  if (drV.viewSellOffsetHeight !== 0) {
    throw new Error(`FAILURE: viewSellCounter still takes vertical space (${drV.viewSellOffsetHeight}px) when Day Report is open!`);
  }
  if (drV.viewReportDisplay !== 'block') {
    throw new Error(`FAILURE: Day Report is NOT displayed block! Display is ${drV?.viewReportDisplay}`);
  }
  console.log('✓ PASS: Day Report is clean at the top and Dashboard is 100% hidden (0px height)!');

  // TEST 4: Click Back Button from Day Report
  console.log('\n[4] Clicking back button on Day Report (#btnBackToSellFromDr)...');
  const backRes = await call('Runtime.evaluate', {
    expression: `(() => {
      const btnBack = document.getElementById('btnBackToSellFromDr');
      if (btnBack) btnBack.click();

      const viewSell = document.getElementById('viewSellCounter');
      const viewReport = document.getElementById('viewDayReport');

      return {
        viewSellDisplay: viewSell ? getComputedStyle(viewSell).display : null,
        viewReportDisplay: viewReport ? getComputedStyle(viewReport).display : null
      };
    })()`,
    returnByValue: true
  });
  const backV = getVal(backRes);
  console.log('After Clicking Back:', JSON.stringify(backV, null, 2));

  if (!backV || backV.viewSellDisplay !== 'flex') {
    throw new Error(`FAILURE: viewSellCounter is not restored to flex! Display is ${backV?.viewSellDisplay}`);
  }
  if (backV.viewReportDisplay !== 'none') {
    throw new Error(`FAILURE: Day Report is not hidden after clicking back! Display is ${backV?.viewReportDisplay}`);
  }
  console.log('✓ PASS: Back button returns smoothly to Sell Counter!');

  console.log('\n======================================================');
  console.log('ALL VERIFICATION CHECKS PASSED PERFECTLY!');
  console.log('======================================================');

  try { chromeProcess.kill(); } catch (e) {}
}

runTest().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
