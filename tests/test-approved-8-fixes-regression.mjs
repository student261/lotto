import { strict as assert } from 'assert';
import {
  SAMPLE_GAMES,
  parseLotteryBarcode,
  calculateSlotSoldTickets,
  calculateSlotRemainingTickets,
  calculateSoldOutRecordTickets,
  getSavedPackJurisdiction
} from '../src/data.js';
import {
  parseScelPrintedTicketNumber,
  adaptScelToLotteryBarcode,
  SCEL_GAMES,
  computeScCheckDigit
} from '../src/scel.js';
import {
  getScreenDayReportData,
  getTodayVsYesterdayComparison
} from '../src/dayReportData.js';
import { getInventoryScreenData } from '../src/inventoryData.js';
import { openDaySettlementModal, openPastDaysModal } from '../src/settlementHistoryModals.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}\n    -> ${err.message}`);
  }
}

// Provide minimal global window mock for data helpers that inspect window.state / localStorage
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k)
};
globalThis.window = { state: null };

console.log('=== SECTION 1: GA vs SC CATALOGUE CONFLICT & AMBIGUITY ===');

test('1.1: getSavedPackJurisdiction returns null (never true/GA) when pack exists under DIFFERENT game', () => {
  globalThis.window.state = {
    slots: [{ boxNumber: 1, status: 'ACTIVE', gameId: '1904', gameNumber: '1904', barcodePrefix: '1904', packNumber: '1234567', jurisdiction: 'GA' }],
    inStockInventory: [],
    inventory: []
  };
  const jur = getSavedPackJurisdiction('1234567', '1691');
  assert.strictEqual(jur, null, `Expected null for non-matching game 1691, got ${jur}`);
});

test('1.2: getSavedPackJurisdiction does NOT misclassify GA pack with hyphenated packCombined as SC', () => {
  globalThis.window.state = {
    slots: [{ boxNumber: 1, status: 'ACTIVE', barcodePrefix: '1691', packNumber: '012345', packCombined: '012345-3' }],
    inStockInventory: [],
    inventory: []
  };
  const jur = getSavedPackJurisdiction('012345', '1691');
  assert.strictEqual(jur, null, `Expected null without explicit jurisdiction, got ${jur}`);
});

test('1.3: Game 1691 in GA store preserves GA price $10 / packSize 30 even though 1691 is in SCEL_GAMES', () => {
  globalThis.window.state = { slots: [], inStockInventory: [], inventory: [], lotteryJurisdiction: 'GA' };
  const scCheck = computeScCheckDigit('012345');
  // Even if check digit collides numerically, GA store scanning 1691 must resolve GA ($10 / 30)
  const res = parseLotteryBarcode(`1691-012345-${scCheck}-010`, [], 'GA');
  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.jurisdiction, 'GA', `Expected GA, got ${res.jurisdiction}`);
  assert.strictEqual(res.price, 10, `Expected GA price 10, got ${res.price}`);
  assert.strictEqual(res.packSize, 30, `Expected GA packSize 30, got ${res.packSize}`);
});

test('1.4: Games 1665 & 1683 in GA store preserve GA $20 / 15 tickets (not SC $10 / 30)', () => {
  const res1665 = parseLotteryBarcode('1665-012345-1-005', [], 'GA');
  assert.strictEqual(res1665.jurisdiction, 'GA');
  assert.strictEqual(res1665.price, 20);
  assert.strictEqual(res1665.packSize, 15);

  const res1683 = parseLotteryBarcode('1683-012345-1-005', [], 'GA');
  assert.strictEqual(res1683.jurisdiction, 'GA');
  assert.strictEqual(res1683.price, 20);
  assert.strictEqual(res1683.packSize, 15);
});

test('1.5: Game 1691, 1665, 1683 in SC store resolve SC catalog values', () => {
  const c = computeScCheckDigit('012345');
  const sc1691 = parseLotteryBarcode(`1691-012345-${c}-010`, [], 'SC');
  assert.strictEqual(sc1691.jurisdiction, 'SC');
  assert.strictEqual(sc1691.price, 5);
  assert.strictEqual(sc1691.packSize, 60);

  const sc1665 = parseLotteryBarcode(`1665-012345-${c}-005`, [], 'SC');
  assert.strictEqual(sc1665.jurisdiction, 'SC');
  assert.strictEqual(sc1665.price, 10);
  assert.strictEqual(sc1665.packSize, 30);

  const sc1683 = parseLotteryBarcode(`1683-012345-${c}-005`, [], 'SC');
  assert.strictEqual(sc1683.jurisdiction, 'SC');
  assert.strictEqual(sc1683.price, 10);
  assert.strictEqual(sc1683.packSize, 30);
});

test('1.6: 14-digit/15-digit overlap barcode does NOT throw ReferenceError on undeclared isGA', () => {
  const res15 = parseLotteryBarcode('164801837880005', [], 'GA');
  assert.strictEqual(res15.isValid, true);
  assert.strictEqual(res15.gameNumber, '1648');
  const res14 = parseLotteryBarcode('16910123451000', [], 'GA');
  assert.strictEqual(res14.isValid, true);
  assert.strictEqual(res14.gameNumber, '1691');
});

test('1.7: Game 1688 in GA store uses GA Lucky 7s ($5/60) and in SC uses SC The Price Is Right ($10/30)', () => {
  const resGa = parseLotteryBarcode('16887770010010', [], 'GA');
  assert.strictEqual(resGa.jurisdiction, 'GA');
  assert.strictEqual(resGa.price, 5);
  assert.strictEqual(resGa.packSize, 60);

  const c = computeScCheckDigit('777001');
  const resSc = parseLotteryBarcode(`1688-777001-${c}-010`, [], 'SC');
  assert.strictEqual(resSc.jurisdiction, 'SC');
  assert.strictEqual(resSc.price, 10);
  assert.strictEqual(resSc.packSize, 30);
});

test('1.8: Genuine ambiguity when jurisdiction is null/AUTO and conflicting catalog entries match check digit', () => {
  globalThis.window.state = { slots: [], inStockInventory: [], inventory: [] };
  const c = computeScCheckDigit('012345');
  const res = parseLotteryBarcode(`1691-012345-${c}-010`, [], 'AUTO');
  assert.strictEqual(res.isAmbiguous, true, 'Expected explicit ambiguity report for conflicting 1691 without store jurisdiction');
  assert.ok(Array.isArray(res.candidateJurisdictions) && res.candidateJurisdictions.includes('GA') && res.candidateJurisdictions.includes('SC'));
});

test('1.9: 18-26 digit 2D barcode respects GA/SC jurisdiction and ambiguity instead of startsWith(16)', () => {
  globalThis.window.state = { slots: [], inStockInventory: [], inventory: [] };
  const ga2d = parseLotteryBarcode('16910123451005123456', [], 'GA');
  assert.strictEqual(ga2d.isValid, true);
  assert.strictEqual(ga2d.jurisdiction, 'GA');

  const c = computeScCheckDigit('012345');
  const auto2d = parseLotteryBarcode(`1691012345${c}005123456`, [], 'AUTO');
  assert.strictEqual(auto2d.isAmbiguous, true, '2D 20-digit conflicting barcode in AUTO must report ambiguity');
});

console.log('\n=== SECTION 2: COUNTDOWN TICKETS & DAY REPORT / COMPARISON ===');

test('2.1: Example A (149 -> 140) counts 9 sold in Day Report live and historical', () => {
  const nowIso = new Date().toISOString();
  const stateLive = {
    cashierName: 'Tester',
    slots: [
      { boxNumber: 1, status: 'ACTIVE', gameName: 'Test Countdown', price: 2, packSize: 150, packNumber: '111111', startTicket: 149, currentTicket: 140, packStartTicket: 0 }
    ],
    soldOutThisShift: [],
    shiftHistory: []
  };
  const rep = getScreenDayReportData(stateLive);
  const b1Live = rep.boxes.find(b => b.box === 1);
  assert.strictEqual(b1Live.sold, 9, `Live Day Report Example A must be 9, got ${b1Live?.sold}`);
  assert.strictEqual(rep.totalTickets, 9);
  assert.strictEqual(rep.totalInstantSales, 18);

  const histIso = '2026-10-14T15:00:00';
  const stateHist = {
    cashierName: 'Tester',
    slots: [],
    soldOutThisShift: [],
    shiftHistory: [{
      shiftNumber: 1,
      cashier: 'Tester',
      startedAt: histIso,
      endedAt: histIso,
      slotsSnapshot: [
        { boxNumber: 1, status: 'ACTIVE', gameName: 'Test Countdown', price: 2, packSize: 150, packNumber: '111111', startTicket: 149, currentTicket: 140 }
      ],
      soldOutSnapshot: []
    }]
  };
  const histRep = getScreenDayReportData(stateHist, { targetDate: '10/14/2026' });
  const b1Hist = histRep.boxes.find(b => b.box === 1);
  assert.strictEqual(b1Hist.sold, 9, `Historical Day Report Example A must be 9, got ${b1Hist?.sold}`);
});

test('2.2: Opening position 0 (new 150 pack), closing 145 counts 5 sold across live Day Report & Today vs Yesterday', () => {
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const state = {
    cashierName: 'Tester',
    slots: [
      { boxNumber: 2, status: 'ACTIVE', gameName: 'Test 150', price: 2, packSize: 150, packNumber: '222222', startTicket: 0, currentTicket: 145, ticketsSold: 5 }
    ],
    soldOutThisShift: [],
    shiftHistory: [{
      shiftNumber: 1,
      cashier: 'Tester',
      startedAt: yest.toISOString(),
      endedAt: yest.toISOString(),
      totalTicketsSold: 9,
      totalSalesRevenue: 18,
      slotsSnapshot: [
        { boxNumber: 2, status: 'ACTIVE', gameName: 'Test 150', price: 2, packSize: 150, packNumber: '222222', startTicket: 149, currentTicket: 140 }
      ],
      soldOutSnapshot: []
    }]
  };
  const rep = getScreenDayReportData(state);
  const b2 = rep.boxes.find(b => b.box === 2);
  assert.strictEqual(b2.sold, 5, `Day Report Example B (0 -> 145 on 150-pack) must be 5, got ${b2?.sold}`);
  assert.strictEqual(rep.totalInstantSales, 10);

  const cmp = getTodayVsYesterdayComparison(state);
  assert.strictEqual(cmp.yesterday.totalTickets, 9, `Yesterday countdown 149->140 must be 9, got ${cmp.yesterday.totalTickets}`);
  assert.strictEqual(cmp.today.totalTickets, 5, `Today countdown 0->145 must be 5, got ${cmp.today.totalTickets}`);
});

test('2.3: Multi-shift cumulative countdown without double-counting (149->140=9 + 140->132=8 => 17; 0->145=5 + 145->132=13 => 18)', () => {
  const nowIso = new Date().toISOString();
  const stateA = {
    cashierName: 'Tester',
    slots: [
      { boxNumber: 1, status: 'ACTIVE', gameName: 'CD Pack', price: 5, packSize: 150, packNumber: '333333', startTicket: 140, currentTicket: 132 }
    ],
    soldOutThisShift: [],
    shiftHistory: [{
      shiftNumber: 1,
      cashier: 'Tester',
      startedAt: nowIso,
      endedAt: nowIso,
      slotsSnapshot: [
        { boxNumber: 1, status: 'ACTIVE', gameName: 'CD Pack', price: 5, packSize: 150, packNumber: '333333', startTicket: 149, currentTicket: 140, ticketsSold: 9 }
      ],
      soldOutSnapshot: []
    }]
  };
  const repA = getScreenDayReportData(stateA);
  const b1A = repA.boxes.find(b => b.box === 1);
  assert.strictEqual(b1A.sold, 17, `Cumulative countdown across 2 shifts must be 17, got ${b1A?.sold}`);
  assert.strictEqual(b1A.total, 85);

  const stateB = {
    cashierName: 'Tester',
    slots: [
      { boxNumber: 1, status: 'ACTIVE', gameName: 'CD Pack B', price: 2, packSize: 150, packNumber: '444444', startTicket: 145, currentTicket: 132 }
    ],
    soldOutThisShift: [],
    shiftHistory: [{
      shiftNumber: 1,
      cashier: 'Tester',
      startedAt: nowIso,
      endedAt: nowIso,
      slotsSnapshot: [
        { boxNumber: 1, status: 'ACTIVE', gameName: 'CD Pack B', price: 2, packSize: 150, packNumber: '444444', startTicket: 0, currentTicket: 145, ticketsSold: 5 }
      ],
      soldOutSnapshot: []
    }]
  };
  const repB = getScreenDayReportData(stateB);
  const b1B = repB.boxes.find(b => b.box === 1);
  assert.strictEqual(b1B.sold, 18, `Cumulative countdown (0->145=5 + 145->132=13) must be 18, got ${b1B?.sold}`);
  assert.strictEqual(b1B.total, 36);
});

test('2.4: Day Settlement modal calculates countdown (149->140=9 & 0->145=5 on 150-pack) and excludes needsActivation', () => {
  const els = new Map();
  const makeEl = (id) => {
    if (!els.has(id)) {
      els.set(id, { id, textContent: '', value: '', innerHTML: '', children: [], appendChild(c) { this.children.push(c); }, addEventListener() {}, showModal() {}, close() {} });
    }
    return els.get(id);
  };
  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => makeEl(id),
    createElement: (tag) => ({ tag, innerHTML: '', className: '' })
  };
  try {
    openDaySettlementModal({
      cashierName: 'Tester',
      slots: [
        { boxNumber: 1, status: 'ACTIVE', packNumber: '111111', gameName: 'CD Pack A', price: 2, packSize: 150, startTicket: 149, currentTicket: 140 },
        { boxNumber: 2, status: 'ACTIVE', packNumber: '222222', gameName: 'CD Pack B', price: 5, packSize: 150, startTicket: 0, currentTicket: 145, ticketsSold: 5 },
        { boxNumber: 3, status: 'PENDING_ACTIVATION', packNumber: '333333', needsActivation: true, gameName: 'Staged', price: 10, packSize: 30, startTicket: 0, currentTicket: 1 }
      ],
      soldOutThisShift: [],
      shiftHistory: []
    });
    assert.strictEqual(els.get('dsKpiTickets').textContent, '14', `Expected 9+5=14 sold, got ${els.get('dsKpiTickets').textContent}`);
    assert.strictEqual(els.get('dsKpiTotalSales').textContent, '$43.00', `Expected $18+$25=$43.00, got ${els.get('dsKpiTotalSales').textContent}`);

    openDaySettlementModal({ cashierName: '', slots: [], soldOutThisShift: [], shiftHistory: [] });
    assert.notStrictEqual(els.get('dsKpiCashier').textContent, 'master');
    assert.strictEqual(els.get('dsKpiTickets').textContent, '0');
    assert.strictEqual(els.get('dsKpiTotalSales').textContent, '$0.00');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('2.5: Countdown sold, remaining & full-pack sell-out edge cases', () => {
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 149, currentTicket: 140, packSize: 150 }), 9);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 140, currentTicket: 132, packSize: 150 }), 8);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 0, currentTicket: 145, packSize: 150 }), 5);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 0, currentTicket: 145, packSize: 150, isCountdown: true }), 5);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 150, currentTicket: 145, packSize: 150 }), 5);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 149, currentTicket: 149, packSize: 150 }), 0);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 0, currentTicket: 150, packSize: 150, status: 'SOLD_OUT' }), 150);
  assert.strictEqual(calculateSlotSoldTickets({ startTicket: 149, currentTicket: 150, packSize: 150, status: 'SOLD_OUT' }), 150);
  assert.strictEqual(calculateSoldOutRecordTickets({ startTicket: 0, closeTicket: 150, packSize: 150, price: 2 }), 150);
  assert.strictEqual(calculateSlotRemainingTickets({ startTicket: 0, currentTicket: 145, packSize: 150, price: 2 }), 145);
  assert.strictEqual(calculateSlotRemainingTickets({ startTicket: 149, currentTicket: 140, packSize: 150, price: 2 }), 141);

  const invData = getInventoryScreenData({
    slots: [{ boxNumber: 2, status: 'ACTIVE', packNumber: '222222', gameName: 'Test 150', price: 2, packSize: 150, startTicket: 0, currentTicket: 145 }],
    inStockInventory: [],
    soldOutThisShift: []
  });
  assert.strictEqual(invData.kpis.ticketsOnRackCount, 145, `Inventory remaining for 0->145 on 150-pack must be 145, got ${invData.kpis.ticketsOnRackCount}`);
  assert.strictEqual(invData.kpis.rackValue, 290, `Inventory value must be 145*$2=$290, got ${invData.kpis.rackValue}`);
});

console.log('\n=== SECTION 4, 5 & 6: ZERO FALLBACKS & HONEST EMPTY STATES ===');

test('4.1: Cleared store_amigo Inventory returns 0 on rack/safe/tickets/sales (never 1882/6383/1200/1237)', () => {
  mockStorage.set('lotto_current_store_id', 'store_amigo');
  const emptyState = {
    dataCleared: true,
    todaySales: 0,
    slots: Array.from({ length: 65 }, (_, i) => ({ boxNumber: i + 1, status: 'EMPTY', packNumber: null })),
    inStockInventory: [],
    inventory: [],
    soldOutThisShift: []
  };
  const inv = getInventoryScreenData(emptyState);
  assert.strictEqual(inv.kpis.packsOnRackCount, 0);
  assert.strictEqual(inv.kpis.ticketsOnRackCount, 0, `Expected 0 ticketsOnRackCount, got ${inv.kpis.ticketsOnRackCount}`);
  assert.strictEqual(inv.kpis.rackValue, 0, `Expected 0 rackValue, got ${inv.kpis.rackValue}`);
  assert.strictEqual(inv.kpis.safePacksCount, 0);
  assert.strictEqual(inv.kpis.safeValue, 0);
  assert.strictEqual(inv.kpis.soldTodaySales, 0);
});

test('4.2: Blank store_amigo even with dataCleared:false returns honest 0 KPIs and empty sold/removed lists', () => {
  mockStorage.set('lotto_current_store_id', 'store_amigo');
  const inv = getInventoryScreenData({
    dataCleared: false,
    todaySales: 0,
    slots: Array.from({ length: 65 }, (_, i) => ({ boxNumber: i + 1, status: 'EMPTY', packNumber: null })),
    inStockInventory: [],
    inventory: [],
    soldOutThisShift: [],
    returnedInventory: []
  });
  assert.strictEqual(inv.kpis.packsOnRackCount, 0);
  assert.strictEqual(inv.kpis.ticketsOnRackCount, 0);
  assert.strictEqual(inv.kpis.rackValue, 0);
  assert.strictEqual(inv.kpis.safePacksCount, 0);
  assert.strictEqual(inv.kpis.safeValue, 0);
  assert.strictEqual(inv.kpis.soldTodaySales, 0);
  assert.strictEqual(inv.completedItems.length, 0);
  assert.strictEqual(inv.removedItems.length, 0);
});

test('5.1: Empty Day Report shows empty cashier instead of hardcoded Carlos fallback', () => {
  const rep = getScreenDayReportData({ slots: [], soldOutThisShift: [], shiftHistory: [] });
  assert.notStrictEqual(rep.userId, 'Carlos', `Day Report must not invent cashier Carlos`);
  assert.strictEqual(rep.totalTickets, 0);
  assert.strictEqual(rep.totalInstantSales, 0);
});

console.log('\n=== SECTION 8: SCEL UNCATALOGUED HANDLING ===');

test('8.1: parseScelPrintedTicketNumber does NOT invent price $1 / packSize 100 for uncatalogued game', () => {
  const p = parseScelPrintedTicketNumber('1799-002921-5-069');
  assert.strictEqual(p.isValid, true);
  assert.strictEqual(p.isCatalogued, false);
  assert.strictEqual(p.game, null, `Uncatalogued SCEL game must not invent $1/100 game object`);
});

test('8.2: adaptScelToLotteryBarcode does NOT invent price $3 / packSize 100 for uncatalogued game', () => {
  const c = computeScCheckDigit('002921');
  const p = adaptScelToLotteryBarcode(`1799-002921-${c}-069`, []);
  assert.strictEqual(p.isValid, false, `Uncatalogued game without custom definition must not silently invent price $3 / 100`);
});

test('8.3: Catalogued SCEL game without explicit PIN does not store countdown as explicit security PIN', () => {
  const c = computeScCheckDigit('002921');
  const p = adaptScelToLotteryBarcode(`1705-002921-${c}-069`, []);
  assert.strictEqual(p.isValid, true);
  assert.strictEqual(p.hasExplicitSecurityCode, false);
  assert.strictEqual(p.countdownCode, '080');
});

console.log(`\nRegression summary: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
