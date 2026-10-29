import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9798;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('====================================================');
  console.log('   SERIES PIN & END SHIFT EMPTY BOX VERIFICATION    ');
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

  const tmpProfile = mkdtempSync(join(tmpdir(), 'chrome-pin-test-'));

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    'http://localhost:5173'
  ]);

  let ws = null;

  try {
    let targets = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json`);
        targets = await res.json();
        break;
      } catch (e) {
        await sleep(300);
      }
    }

    const pageTarget = targets?.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('Could not find Chrome page target');

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let idSeq = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idSeq++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise(r => ws.onopen = r);

    async function evalCode(expr) {
      const res = await send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result.value;
    }

    // Wait for app init
    for (let i = 0; i < 20; i++) {
      const ready = await evalCode('typeof window.state !== "undefined" && typeof window.processScannedBarcode === "function"');
      if (ready) break;
      await sleep(250);
    }

    // Setup clean environment with Box 1 activated with opening PIN 067
    await evalCode(`
      (() => {
        window.state.shiftStatus = 'IN_PROGRESS';
        window.state.slots = [];
        for (let i = 1; i <= 65; i++) {
          window.state.slots.push({
            boxNumber: i,
            gameName: '',
            price: null,
            packNumber: '',
            packSize: 100,
            startTicket: 0,
            currentTicket: 0,
            ticketsSold: 0,
            status: 'EMPTY',
            activatedThisShift: false
          });
        }
        // Slot 1: Game 1418, Pack 0996564, Ticket 81, PIN 067
        window.state.slots[0] = {
          boxNumber: 1,
          gameName: '5X Money',
          gameId: '1418',
          barcodePrefix: '1418',
          price: 2,
          packNumber: '0996564',
          packSize: 150,
          startTicket: 81,
          currentTicket: 81,
          securityCode: '067',
          startSecurityCode: '067',
          currentSecurityCode: '067',
          ticketsSold: 0,
          status: 'ACTIVE',
          activatedThisShift: true,
          scannedInEndShift: false,
          scannedBarcodes: [{
            barcode: '14180996564081067',
            ticketNumber: 81,
            securityCode: '067'
          }]
        };
        // Slot 2: Active slot for Box 2
        window.state.slots[1] = {
          boxNumber: 2,
          gameName: 'Super Cash',
          gameId: '1419',
          barcodePrefix: '1419',
          price: 5,
          packNumber: '0887766',
          packSize: 100,
          startTicket: 10,
          currentTicket: 10,
          ticketsSold: 0,
          status: 'ACTIVE',
          activatedThisShift: true,
          scannedInEndShift: false
        };
        window.saveState(window.state);
        window.renderDispenserRack();
        window.renderHeaderAndMetrics();
      })()
    `);

    console.log('--- Test Group 1: Scanning Same Pack Ticket (068 PIN) During Shift ---');
    const midShiftScan = await evalCode(`
      (() => {
        // Cashier scans same pack next ticket: 1418-0996564-081 (068)
        window.processScannedBarcode('1418-0996564-081 (068)');

        const ticketDetailsModal = document.getElementById('ticketDetailsModal');
        const modalOpen = ticketDetailsModal ? ticketDetailsModal.open : false;
        const b1 = window.state.slots[0];
        const card1 = document.querySelector('.box-card[data-box="1"]');
        const countTxt = card1 ? card1.querySelector('.ticket-sold-count')?.textContent?.trim() : '';

        const toastEl = document.querySelector('.toast, #toastContainer .toast-item, .scan-toast');
        const toastText = toastEl ? toastEl.textContent : '';
        const bannerTitle = document.getElementById('scanActionTitle')?.textContent?.trim() || '';

        return {
          modalOpen,
          toastText,
          bannerTitle,
          ticketsSold: b1.ticketsSold,
          soldCount: window.calculateSlotSoldTickets(b1),
          countTxt,
          action: window.state.lastScanData?.action
        };
      })()
    `);

    assert(!midShiftScan.modalOpen, 'Scanning same pack ticket does NOT open Step 1 Ticket Details modal');
    assert(midShiftScan.toastText.includes('shift is still active') || midShiftScan.toastText.includes('End shift to count total sales'), `Toast says shift is still active (got "${midShiftScan.toastText}")`);
    assert(midShiftScan.bannerTitle === 'Shift is still active', `Banner title says "Shift is still active" (got "${midShiftScan.bannerTitle}")`);
    assert(midShiftScan.ticketsSold === 0, 'Tickets sold remains 0 during shift (counted only on End Shift)');
    assert(midShiftScan.countTxt === '0', 'Dispenser card displays 0 sold during shift');

    console.log('\n--- Test Group 2: End Shift Mode - Dispenser Rack Starts Empty ---');
    await evalCode(`
      const endBtn = document.getElementById('mainShiftActionBtn');
      if (endBtn) endBtn.click();
    `);
    await sleep(400);

    const endShiftInit = await evalCode(`
      (() => {
        window.renderDispenserRack();

        const activeBoxCards = document.querySelectorAll('.box-card.active');
        const addPackCard = document.getElementById('cardLoadNewPack');
        const shiftStatus = window.state.shiftStatus;

        return {
          shiftStatus,
          cardCount: activeBoxCards.length,
          hasAddPackCard: !!addPackCard
        };
      })()
    `);

    assert(endShiftInit.shiftStatus === 'SCANNING_END_SHIFT', 'Shift status transitioned to SCANNING_END_SHIFT');
    assert(endShiftInit.cardCount === 0, 'Dispenser rack cards are empty/hidden during End Shift before scanning');
    assert(!endShiftInit.hasAddPackCard, 'Load new pack card is hidden during End Shift scanning');

    console.log('\n--- Test Group 3: Scanning Closing Ticket (068 PIN) Activates Box With 1 Sale ---');
    const endShiftScan = await evalCode(`
      (() => {
        // Cashier scans closing ticket: 1418-0996564-081 (068)
        window.processScannedBarcode('1418-0996564-081 (068)');

        const b1 = window.state.slots[0];
        const activeBoxCards = document.querySelectorAll('.box-card.active');
        const card1 = document.querySelector('.box-card[data-box="1"]');
        const countTxt = card1 ? card1.querySelector('.ticket-sold-count')?.textContent?.trim() : '';
        const b2Card = document.querySelector('.box-card[data-box="2"]');

        return {
          scannedInEndShift: b1.scannedInEndShift,
          ticketsSold: b1.ticketsSold,
          calculatedSold: window.calculateSlotSoldTickets(b1),
          renderedBoxCount: activeBoxCards.length,
          box1Visible: !!card1,
          box1CountTxt: countTxt,
          box2Hidden: !b2Card
        };
      })()
    `);

    assert(endShiftScan.scannedInEndShift === true, 'Box 1 is marked as scannedInEndShift');
    assert(endShiftScan.ticketsSold === 1, `Box 1 ticketsSold counted 1 sale from series PIN delta (got ${endShiftScan.ticketsSold})`);
    assert(endShiftScan.calculatedSold === 1, `calculateSlotSoldTickets returns 1 (got ${endShiftScan.calculatedSold})`);
    assert(endShiftScan.box1Visible === true, 'Box 1 activated and appeared in dispenser rack');
    assert(endShiftScan.box1CountTxt === '1', `Box 1 dispenser card displays "1" sold (got "${endShiftScan.box1CountTxt}")`);
    assert(endShiftScan.box2Hidden === true, 'Unscanned Box 2 remains hidden/empty until scanned');

    console.log('\n====================================================');
    console.log(`   TEST RESULTS: Passed: ${passed}, Failed: ${failed}`);
    console.log('====================================================\n');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (ws) ws.close();
    p.kill();
    try { rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTest();
