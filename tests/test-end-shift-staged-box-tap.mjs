import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9899;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (cond) {
    passed++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log(' TEST: GET REPORT STAGED BOX CARD TAP (INFO/RETURN) VS ACTIVATE ');
  console.log('================================================================\n');

  const tmp = mkdtempSync(join(tmpdir(), 'chrome-staged-box-tap-'));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmp}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'http://127.0.0.1:5173/app/?bypass_login=1'
  ]);

  let ws = null;
  try {
    let targets = null;
    for (let i = 0; i < 30; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        break;
      } catch {
        await sleep(200);
      }
    }
    const page = targets.find(t => t.type === 'page');
    assert(Boolean(page), 'Chrome CDP page target found');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    let seq = 1;
    const cbs = new Map();
    const errors = [];
    ws.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text || 'exception');
      }
      if (d.id && cbs.has(d.id)) {
        cbs.get(d.id)(d.result);
        cbs.delete(d.id);
      }
    };
    const send = (method, params = {}) => new Promise(res => {
      const id = seq++;
      cbs.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r?.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval error');
      }
      return r?.result?.value;
    };

    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable');

    for (let i = 0; i < 40; i++) {
      const ok = await evalJs('typeof window.state !== "undefined" && typeof window.processScannedBarcode === "function"');
      if (ok) break;
      await sleep(250);
    }
    await sleep(600);

    // Configure clean active boxes 1-3 in SCANNING_END_SHIFT mode
    await evalJs(`(() => {
      const s = window.state;
      s.dataCleared = false;
      s.lotteryJurisdiction = 'GA';
      s.shiftStatus = 'SCANNING_END_SHIFT';
      s.inStockInventory = [];
      s.soldOutThisShift = [];
      s.slots = [];
      for (let i = 1; i <= 65; i++) {
        s.slots.push({
          boxNumber: i,
          status: i <= 3 ? 'ACTIVE' : 'EMPTY',
          gameId: i <= 3 ? 'g140' + i : null,
          gameName: i <= 3 ? 'Game ' + i : null,
          price: i <= 3 ? 2 : null,
          packNumber: i <= 3 ? '200001' + i : null,
          packSize: i <= 3 ? 150 : null,
          startTicket: 0,
          currentTicket: i <= 3 ? 5 : 0,
          ticketsSold: i <= 3 ? 5 : 0,
          scannedInEndShift: i <= 3,
          needsActivation: false,
          scannedBarcodes: []
        });
      }
      window.saveState(s);
      window.renderHeaderAndMetrics();
      window.renderDispenserRack();
      window.renderSlotsRibbon();
    })()`);
    await sleep(250);

    // 1. Scan unassigned ticket -> must open setBoxModal asking which box
    const scan1 = await evalJs(`(() => {
      window.processScannedBarcode('1658-350877-029 (000)');
      const boxModal = document.getElementById('setBoxModal');
      return { setBoxOpen: Boolean(boxModal && boxModal.open) };
    })()`);
    assert(scan1.setBoxOpen, 'Scanning unassigned ticket during Get Report asks which box number via setBoxModal');

    // 2. Choose Box #12 and confirm -> staged with Activate button
    const staged = await evalJs(`(() => {
      const boxInput = document.getElementById('setBoxNumberInput');
      if (boxInput) boxInput.value = '12';
      window.confirmSetBoxForTicket(false);
      const slot12 = window.state.slots.find(s => Number(s.boxNumber) === 12);
      const card12 = document.querySelector('.box-card[data-box="12"]');
      const activateBtn = card12?.querySelector('.btn-card-activate');
      return {
        setBoxClosed: !document.getElementById('setBoxModal')?.open,
        needsActivation: slot12?.needsActivation,
        scannedInEndShift: slot12?.scannedInEndShift,
        hasActivateBtn: Boolean(activateBtn),
        activateBtnText: activateBtn?.textContent?.trim()
      };
    })()`);
    assert(staged.setBoxClosed, 'setBoxModal closes after assigning Box #12');
    assert(staged.needsActivation === true, 'Box #12 is staged with needsActivation: true');
    assert(staged.scannedInEndShift === false, 'Box #12 is not prematurely marked scanned');
    assert(staged.hasActivateBtn && staged.activateBtnText === 'Activate', 'Box #12 displays dedicated .btn-card-activate button');

    // 3. Tap Box #12 card body (NOT Activate button) -> must open End Shift Box Review modal
    const review = await evalJs(`(() => {
      const boxNumEl = document.querySelector('.box-card[data-box="12"] .box-main-number');
      boxNumEl?.click();
      const modal = document.getElementById('endShiftTicketReviewModal');
      const statusText = document.getElementById('esrVerificationStatus')?.textContent?.trim();
      const returnBtn = document.getElementById('btnEsrReturnSafe');
      const soldOutBtn = document.getElementById('btnEsrMarkSoldOut');
      const slot12 = window.state.slots.find(s => Number(s.boxNumber) === 12);
      return {
        reviewOpen: Boolean(modal && modal.open),
        statusText,
        hasReturn: Boolean(returnBtn && window.getComputedStyle(returnBtn).display !== 'none'),
        hasSoldOut: Boolean(soldOutBtn && window.getComputedStyle(soldOutBtn).display !== 'none'),
        packNum: document.getElementById('esrPackNumber')?.textContent?.trim(),
        stillNeedsActivation: slot12?.needsActivation
      };
    })()`);
    assert(review.reviewOpen, 'Tapping the Box #12 card (not Activate) opens endShiftTicketReviewModal');
    assert(review.statusText === 'PENDING ACTIVATION', `Review modal shows PENDING ACTIVATION badge (got "${review.statusText}")`);
    assert(review.hasReturn && review.hasSoldOut, 'Review modal shows Return to Safe and Mark Sold Out buttons');
    assert(review.stillNeedsActivation === true, 'Tapping Box #12 did NOT prematurely activate it');

    // 4. Click Return to Safe inside review modal -> returns to In Stock and clears needsActivation
    const returned = await evalJs(`(() => {
      document.getElementById('btnEsrReturnSafe')?.click();
      const slot12 = window.state.slots.find(s => Number(s.boxNumber) === 12);
      const pending = window.state.slots.filter(s => s.needsActivation);
      const inStock = (window.state.inStockInventory || []).find(p => String(p.packNumber || '').includes('350877'));
      return {
        reviewClosed: !document.getElementById('endShiftTicketReviewModal')?.open,
        slot12Status: slot12?.status,
        slot12NeedsActivation: slot12?.needsActivation,
        pendingCount: pending.length,
        inStockFound: Boolean(inStock),
        card12Gone: !document.querySelector('.box-card[data-box="12"]')
      };
    })()`);
    assert(returned.reviewClosed, 'Review modal closes after Return to Safe');
    assert(returned.slot12Status === 'EMPTY' && returned.slot12NeedsActivation === false, 'Box #12 is EMPTY with needsActivation cleared');
    assert(returned.pendingCount === 0, 'No pending activation blocks Get Report after Return to Safe');
    assert(returned.inStockFound, 'Returned pack is saved into In-Stock Safe Inventory');
    assert(returned.card12Gone, 'Box #12 card is removed from active rack');

    await sleep(500);

    // 5. Re-scan same ticket -> assign Box #12 -> tap Activate button -> must activate cleanly
    const activated = await evalJs(`(() => {
      window.processScannedBarcode('1658-350877-029 (000)');
      const boxInput = document.getElementById('setBoxNumberInput');
      if (boxInput) boxInput.value = '12';
      window.confirmSetBoxForTicket(false);
      const activateBtn = document.querySelector('.box-card[data-box="12"] .btn-card-activate');
      const existedBeforeClick = Boolean(activateBtn);
      activateBtn?.click();
      const slot12 = window.state.slots.find(s => Number(s.boxNumber) === 12);
      const card12 = document.querySelector('.box-card[data-box="12"]');
      return {
        existedBeforeClick,
        reviewStayedClosed: !document.getElementById('endShiftTicketReviewModal')?.open,
        status: slot12?.status,
        needsActivation: slot12?.needsActivation,
        scannedInEndShift: slot12?.scannedInEndShift,
        badgeText: card12?.querySelector('.card-scan-badge')?.textContent?.trim()
      };
    })()`);
    assert(activated.existedBeforeClick, 'Activate button rendered after re-staging returned pack to Box #12');
    assert(activated.reviewStayedClosed, 'Clicking Activate button does NOT open review modal');
    assert(activated.status === 'ACTIVE' && activated.needsActivation === false && activated.scannedInEndShift === true, 'Box #12 activated cleanly on Activate button click');
    assert(activated.badgeText === '✓ SCANNED', `Box #12 card shows ✓ SCANNED after activation (got "${activated.badgeText}")`);
    assert(errors.length === 0, `Zero browser runtime errors (got ${errors.length})`);

    console.log(`\n================================================================`);
    console.log(` ALL STAGED BOX TAP VS ACTIVATE TESTS PASSED: ${passed}/${total}`);
    console.log(`================================================================\n`);
  } finally {
    try { ws?.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
