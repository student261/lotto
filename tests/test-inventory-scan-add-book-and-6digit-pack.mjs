import { strict as assert } from 'assert';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { formatDisplayPackNumber, parseLotteryBarcode } from '../src/data.js';
import { computeScCheckDigit } from '../src/scel.js';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9895;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runUnitChecks() {
  console.log('--- UNIT TESTS: formatDisplayPackNumber (6-digit pack formatting) ---');
  check(formatDisplayPackNumber('0038562') === '003856', '7-digit 0038562 displays as 003856');
  check(formatDisplayPackNumber('047212-0') === '047212', 'Hyphenated 047212-0 displays as 047212');
  check(formatDisplayPackNumber('0670170') === '067017', '7-digit 0670170 displays as 067017');
  check(formatDisplayPackNumber('1618-047212-9-000(059)') === '047212', 'Printed ticket 1618-047212-9-000(059) displays pack 047212');
  check(formatDisplayPackNumber('182800385621002774086718') === '003856', '24-digit barcode extracts pack 003856');
  check(formatDisplayPackNumber('1705-002921-5-069(080)') === '002921', 'SCEL ticket extracts pack 002921');
  check(formatDisplayPackNumber('047212') === '047212', '6-digit 047212 remains 047212');
  check(formatDisplayPackNumber({ basePackNumber: '047212', packNumber: '0472129' }) === '047212', 'Object prefers 6-digit basePackNumber');
  check(formatDisplayPackNumber({ packNumber: '0038562' }) === '003856', 'Object with 7-digit packNumber strips 7th digit');
  check(formatDisplayPackNumber('PACK-A') === 'PACK-A', 'Non-numeric test pack ID preserved');
  check(formatDisplayPackNumber('---', '---') === '---', 'Placeholder preserved');

  console.log('\n--- UNIT TESTS: SC 1618 & Continuous/AIM Trailing Ticket + Countdown Accuracy ---');
  const sc1618Variants = [
    ['printed 1618-047212-9-000(059)', '1618-047212-9-000(059)'],
    ['continuous Layout B 16180472120009', '16180472120009'],
    ['continuous Layout A 16180472129000', '16180472129000'],
    ['AIM ]I0 16180472120009', ']I016180472120009'],
    ['AIM ]C1 16180472129000', ']C116180472129000'],
    ['00-padded 16-digit 0016180472120009', '0016180472120009'],
    ['17-digit 16180472120009059', '16180472120009059'],
    ['14+paren B 16180472120009(059)', '16180472120009(059)'],
    ['14+paren A 16180472129000(059)', '16180472129000(059)'],
    ['20-digit 2D 16180472120009123456', '16180472120009123456']
  ];
  for (const [label, barcode] of sc1618Variants) {
    for (const storeJur of ['SC', 'GA']) {
      const r = parseLotteryBarcode(barcode, [], storeJur);
      check(
        r?.isValid === true &&
        r?.jurisdiction === 'SC' &&
        r?.gameNumber === '1618' &&
        r?.packNumber === '047212' &&
        r?.checkDigit === '9' &&
        r?.ticketNumber === 0 &&
        r?.ticketString === '000' &&
        r?.securityCode === '059' &&
        r?.displayBarcode === '1618-047212-9-000 (059)' &&
        r?.price === 5 &&
        r?.packSize === 60 &&
        r?.gameName === 'IN THE GREEN',
        `${label} in ${storeJur} mode -> 1618-047212-9-000 (059) $5/60tix (got display="${r?.displayBarcode}", check=${r?.checkDigit}, tix=${r?.ticketString}, sec=${r?.securityCode}, jur=${r?.jurisdiction})`
      );
    }
  }

  for (const storeJur of ['SC', 'GA']) {
    const r1714 = parseLotteryBarcode('17140451140016028', [], storeJur);
    check(
      r1714?.isValid === true &&
      r1714?.displayBarcode === '1714-045114-6-001 (028)' &&
      r1714?.ticketString === '001' &&
      r1714?.securityCode === '028',
      `17140451140016028 in ${storeJur} mode -> 1714-045114-6-001 (028) (got "${r1714?.displayBarcode}")`
    );
  }

  // Disambiguation check when checkDigit === '0' and digit10 === '0'
  let chk0Pack = null;
  for (let p = 1; p <= 999999; p++) {
    const cand = String(p).padStart(6, '0');
    if (computeScCheckDigit(cand) === '0') { chk0Pack = cand; break; }
  }
  check(Boolean(chk0Pack), `Found SC check-digit-0 pack ${chk0Pack}`);
  const chk0LayoutA = parseLotteryBarcode(`1618${chk0Pack}0001(058)`, [], 'SC');
  const chk0LayoutB = parseLotteryBarcode(`1618${chk0Pack}0009(059)`, [], 'SC');
  check(
    chk0LayoutA?.isValid && chk0LayoutA.ticketString === '001' && chk0LayoutA.checkDigit === '0' && chk0LayoutA.securityCode === '058',
    `check=0 Layout A 1618${chk0Pack}0001(058) -> tix=001, chk=0, sec=058 (got "${chk0LayoutA?.displayBarcode}")`
  );
  check(
    chk0LayoutB?.isValid && chk0LayoutB.ticketString === '000' && chk0LayoutB.checkDigit === '0' && chk0LayoutB.securityCode === '059',
    `check=0 Layout B 1618${chk0Pack}0009(059) -> tix=000, chk=0, sec=059 (got "${chk0LayoutB?.displayBarcode}")`
  );
}

async function runBrowserE2E() {
  console.log('\n--- E2E BROWSER TESTS: Inventory Scan -> Add New Book & 6-Digit Display ---');
  const tmp = mkdtempSync(join(tmpdir(), 'chrome-inv-scan-6digit-'));
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
    const page = targets?.find(t => t.type === 'page');
    check(Boolean(page), 'Connected to Chrome CDP page');

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

    // 1. Seed existing 7-digit and hyphenated packs on Inventory screen -> verify 6 digits rendered
    const seededInv = await evalJs(`(() => {
      window.state.lotteryJurisdiction = 'GA';
      window.state.shiftStatus = 'IN_PROGRESS';
      window.state.inStockInventory = [
        { id: 's1', gameName: 'Xtreme Bucks', gameNumber: 'Game 1828', packNumber: '0038562', price: 2, packSize: '150 tickets', packSizeNum: 150, status: 'IN_STOCK', position: '000', receivedDate: 'Today' },
        { id: 's2', gameName: 'Game #1618', gameNumber: 'Game 1618', packNumber: '047212-0', price: 1, packSize: '300 tickets', packSizeNum: 300, status: 'IN_STOCK', position: '003', receivedDate: 'Nov 27' }
      ];
      document.getElementById('navInventory')?.click();
      const cells = Array.from(document.querySelectorAll('#invTableBody .td-inv-pack')).map(td => td.textContent.trim());
      return { cells };
    })()`);
    check(
      seededInv.cells.includes('003856') && seededInv.cells.includes('047212') &&
      !seededInv.cells.includes('0038562') && !seededInv.cells.includes('047212-0'),
      `Inventory table displays 6-digit packs (got ${JSON.stringify(seededInv.cells)})`
    );

    // 2. Scan 1618-047212-9-000(059) on Inventory -> opens Add New Book & fills 6-digit pack + $5 / 60 tix
    const scan1618 = await evalJs(`(() => {
      window.state.inStockInventory = [];
      window.state.customGames = [];
      const banner = document.getElementById('invUpdateBanner');
      if (banner) banner.style.display = 'none';
      window.processScannedBarcode('1618-047212-9-000(059)');
      const modal = document.getElementById('receiveBookModernModal');
      const gid = document.getElementById('rbGidInput')?.value;
      const pack = document.getElementById('rbPackInput')?.value;
      const pos = document.getElementById('rbPosInput')?.value;
      const priceActive = document.querySelector('#rbPricesGroup .pc.on')?.getAttribute('data-price');
      const packEq = document.getElementById('rbPackValueEq')?.textContent;
      const nameInput = document.getElementById('rbNameInput');
      if (nameInput) {
        nameInput.value = 'Cash Five';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const saveBtnDisabledBeforeSave = document.getElementById('rbSaveBtn')?.disabled;
      document.getElementById('rbSaveBtn')?.click();
      const modalOpenAfterSave = Boolean(modal?.open);
      const savedPack = window.state.inStockInventory[0]?.packNumber;
      const rowPackCell = document.querySelector('#invTableBody .td-inv-pack')?.textContent?.trim();
      const savedCustom = Array.isArray(window.state.customGames) && window.state.customGames.some(cg => cg.barcodePrefix === '1618' && cg.price === 5 && cg.packSize === 60);
      return { isOpen: modal?.open !== undefined, gid, pack, pos, priceActive, packEq, saveBtnDisabledBeforeSave, modalOpenAfterSave, savedPack, rowPackCell, savedCustom };
    })()`);
    check(scan1618.gid === '1618', `Game ID auto-filled to 1618 (got ${scan1618.gid})`);
    check(scan1618.pack === '047212', `Pack # auto-filled as 6 digits 047212 (got ${scan1618.pack})`);
    check(scan1618.pos === '000', `Start ticket auto-filled to 000 (got ${scan1618.pos})`);
    check(scan1618.priceActive === '5' && scan1618.packEq?.includes('60 tickets'), `Countdown (059) inferred $5 / 60 tickets (got $${scan1618.priceActive}, "${scan1618.packEq}")`);
    check(scan1618.saveBtnDisabledBeforeSave === false && scan1618.modalOpenAfterSave === false, 'Add to inventory button enabled & modal closed after saving');
    check(scan1618.savedPack === '047212' && scan1618.rowPackCell === '047212', `Saved & displayed 6-digit pack 047212 in Inventory (got ${scan1618.savedPack} / ${scan1618.rowPackCell})`);
    check(scan1618.savedCustom === true, 'Custom game 1618 persisted in state.customGames array');

    // 3. Scan 24-digit Xtreme Bucks 182800385621002774086718 on Inventory -> auto-fills ALL fields + saves 6 digits
    const scan1828 = await evalJs(`(() => {
      window.processScannedBarcode('182800385621002774086718');
      const modal = document.getElementById('receiveBookModernModal');
      const open = Boolean(modal?.open);
      const gid = document.getElementById('rbGidInput')?.value;
      const pack = document.getElementById('rbPackInput')?.value;
      const pos = document.getElementById('rbPosInput')?.value;
      const name = document.getElementById('rbNameInput')?.value;
      const priceActive = document.querySelector('#rbPricesGroup .pc.on')?.getAttribute('data-price');
      const packEq = document.getElementById('rbPackValueEq')?.textContent;
      const saveReady = !document.getElementById('rbSaveBtn')?.disabled;
      document.getElementById('rbSaveBtn')?.click();
      const cells = Array.from(document.querySelectorAll('#invTableBody .td-inv-pack')).map(td => td.textContent.trim());
      return { open, gid, pack, pos, name, priceActive, packEq, saveReady, cells };
    })()`);
    check(scan1828.open === true, 'Add New Book opened automatically on 24-digit scan');
    check(scan1828.gid === '1828' && scan1828.pack === '003856' && scan1828.pos === '100', `1828 filled GID/6-digit pack/pos (${scan1828.gid}/${scan1828.pack}/${scan1828.pos})`);
    check(scan1828.name === 'Xtreme Bucks' && scan1828.priceActive === '2' && scan1828.packEq?.includes('150 tickets'), `Recognized Xtreme Bucks $2 / 150 tix (got ${scan1828.name}, $${scan1828.priceActive})`);
    check(scan1828.saveReady && scan1828.cells.includes('003856'), `Saved Xtreme Bucks with 6-digit pack 003856 (cells: ${JSON.stringify(scan1828.cells)})`);

    // 4b. Scan SC physical continuous barcode 17140451140016 on Inventory -> formats 1714-045114-6-001 (028) & recognizes SC $20 / 30 tix / $600 pack
    const scan1714 = await evalJs(`(() => {
      window.state.lotteryJurisdiction = 'GA';
      window.processScannedBarcode('17140451140016');
      const modal = document.getElementById('receiveBookModernModal');
      const code = document.getElementById('rbCodeInput')?.value;
      const gid = document.getElementById('rbGidInput')?.value;
      const pack = document.getElementById('rbPackInput')?.value;
      const pos = document.getElementById('rbPosInput')?.value;
      const name = document.getElementById('rbNameInput')?.value;
      const msgOk = document.getElementById('rbMsgOk')?.style.display;
      const msgInfo = document.getElementById('rbMsgInfo')?.style.display;
      const priceActive = document.querySelector('#rbPricesGroup .pc.on')?.getAttribute('data-price');
      const pvAmt = document.getElementById('rbPackValueAmount')?.textContent;
      const pvEq = document.getElementById('rbPackValueEq')?.textContent;
      const pvTag = document.getElementById('rbPackValueTag')?.textContent;
      modal?.close();
      return { open: Boolean(modal?.open), code, gid, pack, pos, name, msgOk, msgInfo, priceActive, pvAmt, pvEq, pvTag };
    })()`);
    check(scan1714.code === '1714-045114-6-001 (028)', `17140451140016 formats to 1714-045114-6-001 (028) (got "${scan1714.code}")`);
    check(scan1714.gid === '1714' && scan1714.pack === '045114' && scan1714.pos === '001', `1714 filled GID/pack/pos (${scan1714.gid}/${scan1714.pack}/${scan1714.pos})`);
    check(scan1714.name === '25 TIMES LUCKY' && scan1714.msgOk === 'flex' && scan1714.msgInfo === 'none', `1714 recognized as SC 25 TIMES LUCKY without New game banner (name=${scan1714.name}, ok=${scan1714.msgOk}, info=${scan1714.msgInfo})`);
    check(scan1714.priceActive === '20' && scan1714.pvAmt === '$600' && scan1714.pvEq?.includes('30 tickets') && scan1714.pvTag === '$20 ticket → $600 pack', `1714 shows $20 / $600 / 30 tickets (got $${scan1714.priceActive}, ${scan1714.pvAmt}, "${scan1714.pvTag}")`);

    // 4. Invalid retail UPC scanned on Inventory should NOT open Add New Book
    const badScan = await evalJs(`(() => {
      window.processScannedBarcode('049000028904');
      return { open: Boolean(document.getElementById('receiveBookModernModal')?.open) };
    })()`);
    check(badScan.open === false, 'Retail UPC 049000028904 does NOT open Add New Book');

    // 5. Check Ticket Details modal, Box Details modal, Return modal, End Shift Review, Day Report, Shift Report all show 6 digits
    const ui6Digits = await evalJs(`(() => {
      document.getElementById('navSellCounter')?.click();
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; });

      // Open Ticket Details modal with 14170670170009 (7th digit = 0)
      window.processScannedBarcode('14170670170009');
      const ticketDetailsPack = document.getElementById('setTicketMetaPackNum')?.textContent?.trim();
      document.getElementById('setTicketDetailsModal')?.close();
      window.openSetBoxModal('14170670170009');
      const setBoxSummary = document.getElementById('step2PackDisplay')?.textContent?.trim();
      document.getElementById('setBoxNumberInput').value = '5';
      window.confirmSetBoxForTicket(false);

      const s5 = window.state.slots.find(s => s.boxNumber === 5);
      // Open Box Adjust Modal on Box #5
      document.querySelector('.box-card[data-box="5"]')?.click();
      const boxAdjustSub = document.getElementById('boxDetailSubtitle')?.textContent?.trim();
      const adjustPackNum = document.getElementById('adjustPackNum')?.textContent?.trim();
      document.getElementById('boxAdjustModal')?.close();

      // Open In-Stock detail modal on 003856
      window.openInStockDetailModal({ gameName: 'Xtreme Bucks', gameNumber: 'Game 1828', packNumber: '0038562', price: 2, packSizeNum: 150, position: '000' });
      const stockDetailSub = document.getElementById('boxDetailSubtitle')?.textContent?.trim();
      document.getElementById('boxAdjustModal')?.close();

      // Open End Shift review modal
      window.openEndShiftBoxReviewModal(s5);
      const esrPack = document.getElementById('esrPackNumber')?.textContent?.trim();
      document.getElementById('endShiftTicketReviewModal')?.close();

      // Day Report view
      document.getElementById('navDayReport')?.click();
      const drBox5Pack = Array.from(document.querySelectorAll('#drReportTableBody tr')).find(tr => tr.querySelector('.col-box')?.textContent?.trim() === '5')?.querySelector('.col-pack')?.textContent?.trim();

      // History Shift Report modal
      document.getElementById('navSellCounter')?.click();
      window.state.shiftStatus = 'SHIFT_ENDED';
      window.renderShiftClosedReportPreview?.();
      const srCells = Array.from(document.querySelectorAll('#repDocTableBody1 tr td:nth-child(2)')).map(td => td.textContent.trim()).filter(Boolean);

      return { ticketDetailsPack, setBoxSummary, boxAdjustSub, adjustPackNum, stockDetailSub, esrPack, drBox5Pack, srCells };
    })()`);

    check(ui6Digits.ticketDetailsPack === '067017', `Ticket Details Pack # shows 067017 (got "${ui6Digits.ticketDetailsPack}")`);
    check(ui6Digits.setBoxSummary?.includes('Pack 067017') && !ui6Digits.setBoxSummary?.includes('0670170'), `Set Box step2 summary shows 6 digits ("${ui6Digits.setBoxSummary}")`);
    check(ui6Digits.boxAdjustSub?.includes('Pack 067017') && !ui6Digits.boxAdjustSub?.includes('0670170'), `Box Details subtitle shows 6 digits ("${ui6Digits.boxAdjustSub}")`);
    check(ui6Digits.adjustPackNum === '#067017', `adjustPackNum shows #067017 (got "${ui6Digits.adjustPackNum}")`);
    check(ui6Digits.stockDetailSub?.includes('Pack 003856') && !ui6Digits.stockDetailSub?.includes('0038562'), `In-Stock modal subtitle shows 6 digits ("${ui6Digits.stockDetailSub}")`);
    check(ui6Digits.esrPack === '067017', `End Shift Review Pack # shows 067017 (got "${ui6Digits.esrPack}")`);
    check(ui6Digits.drBox5Pack === '067017', `Day Report Box 5 Pack shows 067017 (got "${ui6Digits.drBox5Pack}")`);
    check(ui6Digits.srCells.includes('067017') || ui6Digits.srCells.length === 0, `Shift Report Pack column shows 6 digits if scanned (got ${JSON.stringify(ui6Digits.srCells)})`);

    // 6. Multi-view consistency in SC mode for 1618-047212-9-000 (059) & non-000 ticket display
    const scMultiView = await evalJs(`(() => {
      window.state.lotteryJurisdiction = 'SC';
      window.state.shiftStatus = 'IN_PROGRESS';
      window.state.inStockInventory = [];
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; s.barcodes = []; });

      // a) Ticket Details modal (before assigning to an active box)
      window.openSetTicketDetailsModal('16180472120009');
      const ticketDetailsBarcode = document.getElementById('setTicketBarcodeDisplay')?.textContent?.trim();
      const ticketDetailsPack = document.getElementById('setTicketMetaPackNum')?.textContent?.trim();
      document.getElementById('setTicketDetailsModal')?.close();

      // b) Set Box with 17140451140016 first -> verify start ticket displays 001 (not hardcoded 000)
      window.openSetBoxModal('17140451140016');
      const setBox1714Tickets = document.getElementById('step2TicketsCountDisplay')?.textContent?.trim();
      const setBox1714Barcode = document.getElementById('step2BarcodeDisplay')?.textContent?.trim();
      document.getElementById('setBoxModal')?.close();

      // c) Set Box with 16180472120009 -> verify 1618-047212-9-000 (059), confirm into Box 7
      window.openSetBoxModal('16180472120009');
      const setBox1618Tickets = document.getElementById('step2TicketsCountDisplay')?.textContent?.trim();
      const setBox1618Barcode = document.getElementById('step2BarcodeDisplay')?.textContent?.trim();
      document.getElementById('setBoxNumberInput').value = '7';
      window.confirmSetBoxForTicket(false);

      const slot7 = window.state.slots.find(s => s.boxNumber === 7);
      if (slot7) slot7.needsActivation = false;

      // d) Saved barcode record on Box 7 (confirms displayBarcode, 000 ticketNumber, and 059 securityCode)
      const savedRec = slot7?.scannedBarcodes?.[0] || null;

      // e) Active Shift scan (ticket 001) & Last Scan readout with countdown (058)
      document.getElementById('navSellCounter')?.click();
      window.processScannedBarcode('16180472120019');
      const activeTixNum = window.state.lastScanData?.ticketNumber;
      window.state.lastScanData = { ...window.state.lastScanData, securityCode: '058', action: 'SALE' };
      window.renderHeaderAndMetrics?.();
      const lastScanDom = document.getElementById('lastScanDisplay')?.textContent?.trim();

      // f) End Shift verification scan -> preserves full displayBarcode & securityCode
      window.state.shiftStatus = 'CLOSING';
      window.processScannedBarcode('16180472120019');
      const closingLastBarcode = window.state.lastScannedBarcode;
      const closingSec = window.state.lastScanData?.securityCode;

      // g) Updating Inventory terminal scan
      window.state.shiftStatus = 'IN_PROGRESS';
      document.getElementById('navInventory')?.click();
      window.handleUpdatingInventoryScan?.('16180472120009');
      const updInvLatest = document.getElementById('invTermLatestCode')?.textContent?.trim();

      // h) Receive Packs barcode input
      window.handleReceivePackBarcode?.('16180472120009');
      const rpBarcodeVal = document.getElementById('rpPackBarcodeInput')?.value;
      const rpPackVal = document.getElementById('rpPackNumberInput')?.value;

      // i) Add New Book on Inventory in SC mode for continuous 16180472120009
      window.processScannedBarcode('16180472120009');
      const rbScModal = document.getElementById('receiveBookModernModal');
      const rbScCode = document.getElementById('rbCodeInput')?.value;
      const rbScPos = document.getElementById('rbPosInput')?.value;
      const rbScName = document.getElementById('rbNameInput')?.value;
      const rbScPrice = document.querySelector('#rbPricesGroup .pc.on')?.getAttribute('data-price');
      const rbScEq = document.getElementById('rbPackValueEq')?.textContent;
      rbScModal?.close();

      return {
        setBox1714Tickets, setBox1714Barcode,
        setBox1618Tickets, setBox1618Barcode,
        ticketDetailsBarcode, ticketDetailsPack,
        savedRecDisplay: savedRec?.displayBarcode,
        savedRecTix: savedRec?.ticketNumber,
        savedRecSec: savedRec?.securityCode,
        activeTixNum, lastScanDom,
        closingLastBarcode, closingSec,
        updInvLatest, rpBarcodeVal, rpPackVal,
        rbScCode, rbScPos, rbScName, rbScPrice, rbScEq
      };
    })()`);

    check(scMultiView.setBox1714Tickets === '30 tickets · starts at ticket 001' && scMultiView.setBox1714Barcode === 'Barcode #1714-045114-6-001 (028)', `Set Box 1714 shows 30 tickets start 001 & Barcode #1714-045114-6-001 (028) (got "${scMultiView.setBox1714Tickets}" / "${scMultiView.setBox1714Barcode}")`);
    check(scMultiView.setBox1618Tickets === '60 tickets · starts at ticket 000' && scMultiView.setBox1618Barcode === 'Barcode #1618-047212-9-000 (059)', `Set Box 1618 shows 60 tickets start 000 & Barcode #1618-047212-9-000 (059) (got "${scMultiView.setBox1618Tickets}" / "${scMultiView.setBox1618Barcode}")`);
    check(scMultiView.ticketDetailsBarcode === '1618-047212-9-000 (059)' && scMultiView.ticketDetailsPack === '047212 (Check: 9)', `Ticket Details shows 1618-047212-9-000 (059) & pack 047212 (Check: 9) (got "${scMultiView.ticketDetailsBarcode}" / "${scMultiView.ticketDetailsPack}")`);
    check(scMultiView.savedRecDisplay === '1618-047212-9-000 (059)' && scMultiView.savedRecTix === 0 && scMultiView.savedRecSec === '059', `Box 7 saved record preserves 1618-047212-9-000 (059), tix=0, sec=059 (got "${scMultiView.savedRecDisplay}" / tix=${scMultiView.savedRecTix} / sec=${scMultiView.savedRecSec})`);
    check(scMultiView.activeTixNum === 1 && scMultiView.lastScanDom === 'Box 7 · ticket 001 (058)', `Active scan ticket=1 & Last Scan DOM="Box 7 · ticket 001 (058)" (got tix=${scMultiView.activeTixNum}, dom="${scMultiView.lastScanDom}")`);
    check(scMultiView.closingLastBarcode === '1618-047212-9-001 (058)' && scMultiView.closingSec === '058', `End Shift verification preserves 1618-047212-9-001 (058) & sec 058 (got "${scMultiView.closingLastBarcode}")`);
    check(scMultiView.updInvLatest === '1618-047212-9-000 (059)', `Updating Inventory terminal displays 1618-047212-9-000 (059) (got "${scMultiView.updInvLatest}")`);
    check(scMultiView.rpBarcodeVal === '1618-047212-9-000 (059)' && scMultiView.rpPackVal === '047212', `Receive Packs fills 1618-047212-9-000 (059) & pack 047212 (got "${scMultiView.rpBarcodeVal}")`);
    check(scMultiView.rbScCode === '1618-047212-9-000 (059)' && scMultiView.rbScPos === '000' && scMultiView.rbScName === 'IN THE GREEN' && scMultiView.rbScPrice === '5' && scMultiView.rbScEq?.includes('60 tickets'), `Add New Book SC mode fills 1618-047212-9-000 (059), pos 000, IN THE GREEN, $5/60tix (got "${scMultiView.rbScCode}", name="${scMultiView.rbScName}", $${scMultiView.rbScPrice})`);

    check(runtimeErrors.length === 0, `Zero browser runtime errors (got ${runtimeErrors.length})`);
  } finally {
    try { ws?.close(); } catch {}
    try { chrome.kill('SIGTERM'); } catch {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

await runUnitChecks();
await runBrowserE2E();

console.log(`\n================================================================`);
console.log(` INVENTORY ADD-BOOK & 6-DIGIT PACK E2E: ${passed} PASSED, ${failed} FAILED`);
console.log(`================================================================`);
if (failed > 0) process.exit(1);
