import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9897;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log(' E2E LIVE POS WORKFLOW VERIFICATION: ALL 8 APPROVED ISSUES       ');
  console.log('================================================================\n');

  const tmp = mkdtempSync(join(tmpdir(), 'chrome-e2e-8fixes-'));
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
    assert(Boolean(page), 'Chrome CDP page target connected');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    let seq = 1;
    const cbs = new Map();
    const runtimeErrors = [];
    ws.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text || 'exception');
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
      const ready = await evalJs(`typeof window.processScannedBarcode === 'function' && typeof window.state === 'object'`);
      if (ready) break;
      await sleep(250);
    }

    // ------------------------------------------------------------------
    // SECTION 1: GA vs SC Overlapping Catalog & Ambiguity Rejection
    // ------------------------------------------------------------------
    console.log('--- SECTION 1: GA vs SC CATALOGUE & AMBIGUITY IN LIVE POS ---');
    const sec1 = await evalJs(`(() => {
      window.confirm = () => true;
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; });
      window.state.inStockInventory = [];
      window.state.inventory = [];
      window.state.shiftStatus = 'IN_PROGRESS';

      // GA store scanning overlapping 1691 must get GA ($10 / 30 tickets)
      window.state.lotteryJurisdiction = 'GA';
      window.processScannedBarcode('1691-012345-1-005 (000)');
      const gaName = document.getElementById('setBoxGameNameInput')?.value;
      const gaPrice = document.querySelector('.set-box-price-pill.active')?.getAttribute('data-price') || document.getElementById('setBoxPriceInput')?.value;
      const gaTickets = document.getElementById('setBoxPackTicketsInput')?.value;
      document.getElementById('setTicketDetailsModal')?.close();

      // SC store scanning overlapping 1691 (pack 012345 SC check digit = 7) must get SC ($5 / 60 tickets)
      window.state.lotteryJurisdiction = 'SC';
      window.processScannedBarcode('1691-012345-7-005');
      const scName = document.getElementById('setBoxGameNameInput')?.value;
      const scPrice = document.querySelector('.set-box-price-pill.active')?.getAttribute('data-price') || document.getElementById('setBoxPriceInput')?.value;
      const scTickets = document.getElementById('setBoxPackTicketsInput')?.value;
      document.getElementById('setTicketDetailsModal')?.close();

      // AUTO jurisdiction scanning conflicting 1691 must report explicit ambiguity and not open Set Ticket modal
      window.state.lotteryJurisdiction = 'AUTO';
      window.processScannedBarcode('1691-012345-7-005');
      const autoOpenedModal = Boolean(document.getElementById('setTicketDetailsModal')?.open || document.getElementById('setBoxModal')?.open);
      const autoTitle = document.getElementById('scanActionTitle')?.textContent?.trim() || '';
      window.state.lotteryJurisdiction = 'GA';
      return { gaName, gaPrice, gaTickets, scName, scPrice, scTickets, autoOpenedModal, autoTitle };
    })()`);
    assert(sec1.gaPrice === '10' && sec1.gaTickets === '30', `GA 1691 resolved $10 / 30 tickets (got $${sec1.gaPrice} / ${sec1.gaTickets})`);
    assert(sec1.scPrice === '5' && sec1.scTickets === '60', `SC 1691 resolved $5 / 60 tickets (got $${sec1.scPrice} / ${sec1.scTickets})`);
    assert(sec1.autoOpenedModal === false && sec1.autoTitle.includes('AMBIGUOUS'), `AUTO conflicting 1691 rejected with AMBIGUOUS banner ("${sec1.autoTitle}")`);

    // ------------------------------------------------------------------
    // SECTION 2: Countdown Math in Day Report, Return to Safe, Conflict
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 2: COUNTDOWN MATH IN DAY REPORT, RETURN SAFE, CONFLICT ---');
    const sec2 = await evalJs(`(() => {
      window.state.shiftHistory = [];
      window.state.soldOutThisShift = [];
      window.state.dataCleared = false;
      window.state.cashierName = 'Alex';
      window.state.storeName = 'Test Lottery Store';
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; });

      const s1 = window.state.slots.find(s => s.boxNumber === 1);
      Object.assign(s1, { status: 'ACTIVE', gameId: '1418', barcodePrefix: '1418', gameName: '10X Money', price: 2, packSize: 150, packNumber: '111222', startTicket: 149, currentTicket: 140 });
      const s2 = window.state.slots.find(s => s.boxNumber === 2);
      Object.assign(s2, { status: 'ACTIVE', gameId: '1699', barcodePrefix: '1699', gameName: 'Countdown 150', price: 5, packSize: 150, packNumber: '222333', startTicket: 0, currentTicket: 145, ticketsSold: 5 });

      // Check Inventory view reflects 141 + 145 = 286 rack tickets before returns
      document.getElementById('navInventory')?.click();
      const invTicketsBeforeReturn = document.getElementById('invKpiTicketsRack')?.textContent?.trim();

      // Open Day Report screen via navbar
      document.getElementById('navDayReport')?.click();
      const drTickets = document.getElementById('drSheetTickets')?.textContent?.trim();
      const drSales = document.getElementById('drSheetTotalSales')?.textContent?.trim();
      document.getElementById('navSellCounter')?.click();

      // End Shift scan of fresh 150-pack (startTicket=0) closing at 145 must yield 5 sold without rewriting startTicket to 149
      const s3 = window.state.slots.find(s => s.boxNumber === 3);
      Object.assign(s3, { status: 'ACTIVE', gameId: '1418', barcodePrefix: '1418', gameName: '10X Money', price: 2, packSize: 150, packNumber: '3334441', startTicket: 0, currentTicket: 0, scannedInEndShift: false, needsActivation: false });
      window.state.shiftStatus = 'SCANNING_END_SHIFT';
      window.processScannedBarcode('1418-333444-1-145');
      const s3EndShiftSold = s3.ticketsSold;
      const s3EndShiftStart = s3.startTicket;

      // Full-pack SOLD_OUT from Box #3 -> must count 150 sold ($300)
      window.openEndShiftBoxReviewModal(s3);
      document.getElementById('btnEsrMarkSoldOut')?.click();
      const s3FullSoldOut = window.state.soldOutThisShift.find(so => so.boxNumber === 3);

      // Return to Safe on Box #1 (149 -> 140 => 9 sold, 141 returned)
      window.openEndShiftBoxReviewModal(s1);
      document.getElementById('btnEsrReturnSafe')?.click();
      const ret1 = window.state.soldOutThisShift.find(so => so.boxNumber === 1 && so.isReturned);

      // Box conflict Return on Box #2 (0 -> 145 on 150-pack => 5 sold, 145 returned)
      window.state.shiftStatus = 'IN_PROGRESS';
      window.processScannedBarcode('1417-999001-0-299');
      document.getElementById('btnTicketDetailsNext')?.click();
      const boxInput = document.getElementById('setBoxNumberInput');
      if (boxInput) {
        boxInput.value = '2';
        boxInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.getElementById('optConflictReturned')?.click();
      const conflictSoldText = document.getElementById('returnMetricSold')?.textContent?.trim();
      const conflictUnsoldText = document.getElementById('returnMetricUnsold')?.textContent?.trim();
      document.getElementById('btnReturnConflictConfirm')?.click();
      const ret2 = window.state.soldOutThisShift.find(so => so.boxNumber === 2 && so.isReturned);

      return {
        invTicketsBeforeReturn,
        drTickets,
        drSales,
        s3EndShiftSold,
        s3EndShiftStart,
        s3FullSoldTickets: s3FullSoldOut?.ticketsSold,
        s3FullSalesAmount: s3FullSoldOut?.salesAmount,
        ret1Sold: ret1?.ticketsSold,
        ret1Returned: ret1?.ticketsReturned,
        s1StatusAfter: s1.status,
        conflictSoldText,
        conflictUnsoldText,
        ret2Sold: ret2?.ticketsSold,
        ret2Returned: ret2?.ticketsReturned,
        s2NewPack: s2.packNumber
      };
    })()`);
    assert(sec2.invTicketsBeforeReturn === '286', `Inventory shows 141+145=286 remaining tickets (got ${sec2.invTicketsBeforeReturn})`);
    assert(sec2.drTickets === '14' && sec2.drSales === '$43.00', `Day Report shows 14 sold & $43.00 (got ${sec2.drTickets}, ${sec2.drSales})`);
    assert(sec2.s3EndShiftSold === 5 && sec2.s3EndShiftStart === 0, `End Shift scan 0->145 on 150-pack calculated 5 sold with start=0 preserved (got sold=${sec2.s3EndShiftSold}, start=${sec2.s3EndShiftStart})`);
    assert(sec2.s3FullSoldTickets === 150 && sec2.s3FullSalesAmount === 300, `Full-pack sell-out counted 150 tickets / $300 (got ${sec2.s3FullSoldTickets}, $${sec2.s3FullSalesAmount})`);
    assert(sec2.ret1Sold === 9 && sec2.ret1Returned === 141 && sec2.s1StatusAfter === 'EMPTY', `Return to Safe counted 9 sold & 141 remaining (got ${sec2.ret1Sold}/${sec2.ret1Returned})`);
    assert(sec2.conflictSoldText === '5' && sec2.conflictUnsoldText === '145' && sec2.ret2Sold === 5 && sec2.ret2Returned === 145 && sec2.s2NewPack === '9990010',
      `Box Conflict Return counted 5 sold & 145 remaining (preview=${sec2.conflictSoldText}/${sec2.conflictUnsoldText}, saved=${sec2.ret2Sold}/${sec2.ret2Returned}, pack=${sec2.s2NewPack})`);

    // ------------------------------------------------------------------
    // SECTION 3A - 3F: END SHIFT & BOX WORKFLOWS
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 3A-3F: END SHIFT, ACTIVATE, DECLARE OUT THERE, METADATA ---');
    const sec3 = await evalJs(`(() => {
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; s.declaredOutThere = false; });
      const s5 = window.state.slots.find(s => s.boxNumber === 5);
      Object.assign(s5, { status: 'ACTIVE', gameId: '1417', barcodePrefix: '1417', gameName: '5X MONEY', price: 1, packSize: 300, packNumber: '111111', startTicket: 299, currentTicket: 299, needsActivation: false });

      // 3A: In End Shift with focused Box 5 (game 1417 pack 111111), scan DIFFERENT pack of SAME game 1417-222222-5-290
      window.state.shiftStatus = 'SCANNING_END_SHIFT';
      window.state.lastScannedSlot = 5;
      window.processScannedBarcode('1417-222222-5-290');
      const setBoxOpenedFor3A = Boolean(document.getElementById('setBoxModal')?.open);
      const box5Untouched = s5.packNumber === '111111';

      // Assign Box #12 -> Staged (needsActivation = true)
      document.getElementById('setBoxNumberInput').value = '12';
      window.confirmSetBoxForTicket(false);
      const s12 = window.state.slots.find(s => s.boxNumber === 12);
      const s12Staged = Boolean(s12 && s12.needsActivation === true);

      // 3B: Click Activate button on Box #12 -> MUST open Ticket Details modal (not bypass)
      const actBtn = document.querySelector('.box-card[data-box="12"] .btn-card-activate');
      actBtn?.click();
      const actOpenedDetails = Boolean(document.getElementById('setTicketDetailsModal')?.open);
      document.getElementById('btnTicketDetailsNext')?.click();
      document.getElementById('setBoxNumberInput').value = '12';
      window.confirmSetBoxForTicket(false);
      const s12ActivatedClean = s12.status === 'ACTIVE' && s12.needsActivation === false && s12.scannedInEndShift === true;

      // 3C & 3D: Stage Box #14 -> click card -> Declare Out There -> must stay PENDING_ACTIVATION & excluded from isBoxActive
      window.processScannedBarcode('1658-350877-029');
      document.getElementById('setBoxNumberInput').value = '14';
      window.confirmSetBoxForTicket(false);
      const s14 = window.state.slots.find(s => s.boxNumber === 14);
      window.openEndShiftBoxReviewModal(s14);
      document.getElementById('btnEsrDeclareOutThere')?.click();
      const s14StatusAfterOutThere = s14.status;
      const s14NeedsActAfterOutThere = s14.needsActivation;
      const s14DeclaredAfterOutThere = s14.declaredOutThere;
      window.showStartShiftHandoverView();
      const handoverCountsText = document.getElementById('sshFooterRackCounts')?.textContent?.trim() || '';
      const handoverHasBox14 = Array.from(document.querySelectorAll('#sshOpeningTableBody tr td:first-child')).some(td => td.textContent.trim() === '14');
      document.getElementById('viewStartShiftHandover').style.display = 'none';
      const vSell = document.getElementById('viewSellCounter');
      if (vSell) { vSell.style.display = ''; vSell.classList.remove('hidden-view'); }

      // 3E: Scanning BOX-15 inside Ticket Details modal transitions via Set Box and places pack in Box #15 (NOT saving directly to Safe)
      window.state.shiftStatus = 'IN_PROGRESS';
      const stockLenBefore = (window.state.inStockInventory || []).length;
      window.processScannedBarcode('1418-555666-7-140');
      const detailsOpenFor3E = Boolean(document.getElementById('setTicketDetailsModal')?.open);
      window.processScannedBarcode('BOX-15');
      const s15 = window.state.slots.find(s => s.boxNumber === 15);
      const box15Activated3E = Boolean(s15 && s15.status === 'ACTIVE' && String(s15.packNumber || '').startsWith('555666'));
      const savedDirectlyToSafe = (window.state.inStockInventory || []).length > stockLenBefore;
      if (document.getElementById('setBoxModal')?.open) document.getElementById('closeSetBoxModalBtn')?.click();
      if (document.getElementById('setTicketDetailsModal')?.open) document.getElementById('setTicketDetailsModal')?.close();

      // 3F: Switch Box #12 -> Box #18 preserves ALL pack metadata and clears Box #12 cleanly
      Object.assign(s12, {
        barcodePrefix: '1417', jurisdiction: 'GA', checkDigit: '5', basePackNumber: '222222',
        packCombined: '222222-5', securityCode: '009', startSecurityCode: '009', currentSecurityCode: '005',
        ticketsSold: 4, soldBarcodes: ['t1'], declaredOutThere: false, packStartTicket: 299, packCumulativeSold: 4
      });
      window.state.lastScannedSlot = 12;
      document.querySelector('.box-card[data-box="12"]')?.click();
      document.getElementById('btnBoxSwitch')?.click();
      const swInput = document.getElementById('inputSwitchTargetBox');
      if (swInput) swInput.value = '18';
      document.getElementById('btnConfirmSwitchBox')?.click();
      const s18 = window.state.slots.find(s => s.boxNumber === 18);
      const metaMoved = s18 && s18.packNumber === '2222225' && s18.jurisdiction === 'GA' && s18.checkDigit === '5' &&
        s18.basePackNumber === '222222' && s18.packCombined === '222222-5' && s18.securityCode === '009' &&
        s18.currentSecurityCode === '005' && s18.ticketsSold === 4 && s18.soldBarcodes?.length === 1 &&
        s18.packStartTicket === 299 && s18.packCumulativeSold === 4;
      const sourceCleared = s12.status === 'EMPTY' && s12.packNumber === null && !s12.barcodePrefix &&
        s12.jurisdiction === null && s12.checkDigit === null && s12.securityCode === null &&
        s12.ticketsSold === 0 && (!s12.soldBarcodes || s12.soldBarcodes.length === 0);
      if (document.getElementById('boxAdjustModal')?.open) document.getElementById('boxAdjustModal')?.close();

      return {
        setBoxOpenedFor3A, box5Untouched, s12Staged, actOpenedDetails, s12ActivatedClean,
        s14StatusAfterOutThere, s14NeedsActAfterOutThere, s14DeclaredAfterOutThere, handoverCountsText, handoverHasBox14,
        detailsOpenFor3E, box15Activated3E, s15Status: s15?.status, s15Pack: s15?.packNumber, savedDirectlyToSafe,
        metaMoved, sourceCleared
      };
    })()`);
    assert(sec3.setBoxOpenedFor3A && sec3.box5Untouched, '3A: Different pack of same game did not attach to focused Box #5');
    assert(sec3.s12Staged && sec3.actOpenedDetails && sec3.s12ActivatedClean, '3B: Activate button opened Ticket Details modal and activated Box #12 cleanly');
    assert(sec3.s14StatusAfterOutThere === 'PENDING_ACTIVATION' && sec3.s14NeedsActAfterOutThere === true && sec3.s14DeclaredAfterOutThere === true, '3C: Declare Out There kept PENDING_ACTIVATION');
    assert(sec3.handoverCountsText.startsWith('2 packs selling') && !sec3.handoverHasBox14,
      `3D: Handover/active calculations exclude needsActivation Box #14 (text="${sec3.handoverCountsText}")`);
    assert(sec3.detailsOpenFor3E && sec3.box15Activated3E && !sec3.savedDirectlyToSafe,
      `3E: BOX-15 scan in Ticket Details -> Set Box #15 (detailsOpen=${sec3.detailsOpenFor3E}, status=${sec3.s15Status}, pack=${sec3.s15Pack}, safe=${sec3.savedDirectlyToSafe})`);
    assert(sec3.metaMoved && sec3.sourceCleared, '3F: Switch Box transferred all pack metadata cleanly and left zero stale metadata on source box');

    // ------------------------------------------------------------------
    // SECTION 4 & 5: ZERO FAKE KPI FALLBACKS & EMPTY REPORTS
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 4 & 5: HONEST ZERO STATES & NO SAMPLE FALLBACKS ---');
    const sec45 = await evalJs(`(() => {
      window.state.dataCleared = false;
      window.state.cashierName = '';
      window.state.todaySales = 0;
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; s.gameName = null; s.price = null; });
      window.state.inStockInventory = [];
      window.state.inventory = [];
      window.state.soldOutThisShift = [];
      window.state.shiftHistory = [];

      document.getElementById('navInventory')?.click();
      const invPacks = document.getElementById('invKpiPacksRack')?.textContent?.trim();
      const invTickets = document.getElementById('invKpiTicketsRack')?.textContent?.trim();
      const invRackVal = document.getElementById('invKpiRackValue')?.textContent?.trim();
      const invSafeVal = document.getElementById('invKpiSafeValue')?.textContent?.trim();
      const invSoldToday = document.getElementById('invKpiSoldToday')?.textContent?.trim();

      document.getElementById('navDayReport')?.click();
      const drSales = document.getElementById('drSheetTotalSales')?.textContent?.trim();
      const drTickets = document.getElementById('drSheetTickets')?.textContent?.trim();
      const drSub = document.getElementById('dayReportPageSubtitle')?.textContent || '';

      document.getElementById('btnBackToSellFromDr')?.click();
      return { invPacks, invTickets, invRackVal, invSafeVal, invSoldToday, drSales, drTickets, drSub };
    })()`);
    assert(sec45.invPacks === '0' && sec45.invTickets === '0' && sec45.invRackVal === '$0.00' && sec45.invSafeVal === '$0.00' && sec45.invSoldToday === '$0.00',
      `4: Empty Inventory renders honest $0.00 / 0 KPIs (got packs=${sec45.invPacks}, rack=${sec45.invRackVal}, safe=${sec45.invSafeVal}, sold=${sec45.invSoldToday})`);
    assert(sec45.drSales === '$0.00' && sec45.drTickets === '0' && !sec45.drSub.includes('Carlos'),
      `5: Empty Day Report renders $0.00 / 0 without Carlos/fake data (sub="${sec45.drSub}")`);

    // ------------------------------------------------------------------
    // SECTION 6 & 7: RECEIVE PACKS -> UNIFIED INVENTORY & EDIT/DELETE
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 6 & 7: RECEIVE PACKS CONSISTENCY & INVENTORY EDIT/DELETE ---');
    const sec67 = await evalJs(`(() => {
      // Check Receive Packs opens with empty prefill
      document.getElementById('navReceivePacks')?.click();
      const initName = document.getElementById('rpTicketNameInput')?.value;
      const initGame = document.getElementById('rpGameNumberInput')?.value;
      const initPack = document.getElementById('rpPackNumberInput')?.value;

      // Add a real pack and save movements
      document.getElementById('rpTicketNameInput').value = 'Lucky Dog';
      document.getElementById('rpGameNumberInput').value = '1499';
      document.getElementById('rpPackNumberInput').value = '908070';
      document.getElementById('rpTicketsInPackInput').value = '30';
      document.getElementById('rpAddToDeliveryBtn')?.click();
      document.getElementById('rpConfirmDeliveryBtn')?.click();

      const inStockHas = window.state.inStockInventory.some(p => p.packNumber === '908070' && p.gameName.toUpperCase().includes('LUCKY DOG'));

      // Check Inventory view shows it without duplicates
      document.getElementById('navInventory')?.click();
      const rowCount908070 = document.querySelectorAll('#invTableBody tr[data-pack-num="908070"]').length;

      // Also place on rack and test modalEditInventoryBook save + delete (must not throw renderDispenser ReferenceError)
      const s1 = window.state.slots.find(s => s.boxNumber === 1);
      Object.assign(s1, { status: 'ACTIVE', gameId: '1499', gameName: 'Lucky Dog', price: 10, packSize: 30, packNumber: '908070', startTicket: 0, currentTicket: 0 });
      const formEdit = document.getElementById('formEditInventoryBook');
      document.getElementById('editBookOriginalPack').value = '908070';
      document.getElementById('editBookGameName').value = 'Lucky Dog Edited';
      document.getElementById('editBookGameNumber').value = '1499';
      document.getElementById('editBookPackNumber').value = '908070';
      document.getElementById('editBookPrice').value = '10';
      document.getElementById('editBookPackSize').value = '30';
      document.getElementById('editBookStatus').value = 'ACTIVE';
      document.getElementById('editBookBoxNumber').value = '1';
      formEdit?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      const nameAfterEdit = s1.gameName;

      // Delete via btnDeleteInventoryBook
      document.getElementById('editBookOriginalPack').value = '908070';
      document.getElementById('btnDeleteInventoryBook')?.click();
      const goneFromSafe = !window.state.inStockInventory.some(p => p.packNumber === '908070');
      const goneFromBox1 = s1.status === 'EMPTY' && s1.packNumber === null;

      return { initName, initGame, initPack, inStockHas, rowCount908070, nameAfterEdit, goneFromSafe, goneFromBox1 };
    })()`);
    assert(sec67.initName === '' && sec67.initGame === '' && sec67.initPack === '',
      `6: Receive Packs has zero fake prefill (got name="${sec67.initName}", game="${sec67.initGame}", pack="${sec67.initPack}")`);
    assert(sec67.inStockHas && sec67.rowCount908070 === 1, `6: Confirmed Received Pack renders once in Inventory (rows=${sec67.rowCount908070})`);
    assert(sec67.nameAfterEdit.includes('Lucky Dog Edited') && sec67.goneFromSafe && sec67.goneFromBox1,
      '7: Inventory Edit and Delete update state and re-render rack with zero ReferenceError');

    // ------------------------------------------------------------------
    // SECTION 8: SC UNCATALOGUED REJECTION IN LIVE POS
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 8: SCEL UNCATALOGUED GAME REJECTION ---');
    const sec8 = await evalJs(`(() => {
      document.getElementById('navSellCounter')?.click();
      window.state.shiftStatus = 'IN_PROGRESS';
      window.state.lotteryJurisdiction = 'SC';
      window.processScannedBarcode('1799-002921-5-069');
      const openedModal = Boolean(document.getElementById('setTicketDetailsModal')?.open || document.getElementById('setBoxModal')?.open);
      const bannerTitle = document.getElementById('scanActionTitle')?.textContent?.trim() || '';
      window.state.lotteryJurisdiction = 'GA';
      return { openedModal, bannerTitle };
    })()`);
    assert(!sec8.openedModal && sec8.bannerTitle.includes('UNKNOWN SCEL'), `8: Uncatalogued SCEL game rejected cleanly ("${sec8.bannerTitle}") without inventing price/packSize`);

    // ------------------------------------------------------------------
    // SECTION 9: SHIFT_ENDED REFRESH & START SHIFT WORKFLOWS
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 9: SHIFT_ENDED REFRESH & START SHIFT ---');
    const sec9 = await evalJs(`(() => {
      let printCalls = 0;
      const origPrint = window.print;
      window.print = () => { printCalls++; };
      try {
        window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; s.ticketsSold = 0; s.scannedInEndShift = false; });
        window.state.soldOutThisShift = [];
        window.state.dataCleared = false;
        window.state.shiftStartedAt = new Date().toISOString();
        window.confirmEndShift();

        const btnRefresh = document.getElementById('btnHeaderRefresh');
        const refreshLabel0 = btnRefresh?.textContent?.trim();
        btnRefresh?.click();
        const printCallsAfterZeroRefresh = printCalls;
        const hasPrintClassAfterZeroRefresh = document.body.classList.contains('print-shift-report');

        document.getElementById('mainShiftActionBtn')?.click();
        const afterStartStatus = window.state.shiftStatus;
        const afterStartReportVisible = document.getElementById('shiftClosedReportSection')?.style?.display === 'block';

        // Non-zero active box ended shift: Refresh must still stay Refresh & Start/Done must archive
        const b1 = window.state.slots.find(s => s.boxNumber === 1);
        b1.status = 'ACTIVE';
        b1.packNumber = '5551234';
        b1.gameName = 'TEST';
        b1.price = 10;
        b1.packSize = 30;
        b1.startTicket = 29;
        b1.currentTicket = 25;
        b1.scannedInEndShift = true;
        b1.needsActivation = false;
        window.confirmEndShift();
        const refreshLabelActive = btnRefresh?.textContent?.trim();
        btnRefresh?.click();
        const printCallsAfterActiveRefresh = printCalls;
        document.getElementById('btnShiftRepDone')?.click();
        return {
          refreshLabel0,
          printCallsAfterZeroRefresh,
          hasPrintClassAfterZeroRefresh,
          afterStartStatus,
          afterStartReportVisible,
          refreshLabelActive,
          printCallsAfterActiveRefresh,
          doneStatus: window.state.shiftStatus
        };
      } finally {
        window.print = origPrint;
      }
    })()`);
    assert(sec9.refreshLabel0 === 'Refresh' && sec9.refreshLabelActive === 'Refresh', `9: Header Refresh button stays "Refresh" in SHIFT_ENDED (got "${sec9.refreshLabel0}" / "${sec9.refreshLabelActive}")`);
    assert(sec9.printCallsAfterZeroRefresh === 0 && sec9.printCallsAfterActiveRefresh === 0 && !sec9.hasPrintClassAfterZeroRefresh, `9: Clicking Refresh never opens print report (printCalls=${sec9.printCallsAfterActiveRefresh})`);
    assert(sec9.afterStartStatus === 'IN_PROGRESS' && !sec9.afterStartReportVisible && sec9.doneStatus === 'IN_PROGRESS', `9: Start Shift & Done transition out of SHIFT_ENDED into IN_PROGRESS cleanly`);

    assert(runtimeErrors.length === 0, `Zero browser console/runtime exceptions across all workflows (got ${runtimeErrors.length}: ${runtimeErrors.join('; ')})`);

    console.log(`\n================================================================`);
    console.log(` ALL E2E WORKFLOW VERIFICATIONS PASSED: ${passed}/${passed + failed}`);
    console.log(`================================================================\n`);
  } finally {
    try { ws?.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => {
  console.error('E2E Verification failed:', err);
  process.exit(1);
});
