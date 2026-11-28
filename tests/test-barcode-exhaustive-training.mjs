import { strict as assert } from 'assert';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  parseLotteryBarcode,
  formatLotteryBarcode,
  formatTicketDisplayBarcode,
  formatDisplayPackNumber,
  findGaCatalogGame
} from '../src/data.js';
import { SCEL_GAMES, computeScCheckDigit, findScelGame } from '../src/scel.js';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9897;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function runExhaustiveUnitTraining() {
  console.log('--- PART 1: Exhaustive SCEL Catalog & Multi-Format Stress Matrix ---');

  // Fixed test packs covering check digits 0..9 across SCEL games
  const samplePacks = ['000005', '047212', '045114', '002921', '019869', '123450'];
  const checkMap = Object.fromEntries(samplePacks.map(p => [p, computeScCheckDigit(p)]));
  check(new Set(Object.values(checkMap)).size >= 4, `Covered multiple SC check digits: ${JSON.stringify(checkMap)}`);

  for (const game of SCEL_GAMES) {
    const g = game.gameNumber;
    const ps = game.packSize;
    const gaShared = Boolean(findGaCatalogGame(g, []));
    const ticketIndices = Array.from(new Set([0, 1, Math.floor(ps / 2), ps - 2, ps - 1]));

    for (let idx = 0; idx < ticketIndices.length; idx++) {
      const tix = ticketIndices[idx];
      const tixStr = String(tix).padStart(3, '0');
      const secStr = String(ps - 1 - tix).padStart(3, '0');
      const pack = samplePacks[(parseInt(g, 10) + idx) % samplePacks.length];
      const chk = checkMap[pack];
      const expectedDisp = `${g}-${pack}-${chk}-${tixStr} (${secStr})`;

      const symB = (tixStr[0] === chk && parseInt(`${tixStr.slice(1)}${chk}`, 10) < ps);
      const symA = (chk === '0' && tix >= 100 && tixStr[2] === chk && Math.floor(tix / 10) < Math.min(150, ps));

      const formats = [
        `${g}-${pack}-${chk}-${tixStr}(${secStr})`,
        `${g}-${pack}-${chk}-${tixStr} (${secStr})`,
        `${g}/${pack}/${chk}/${tixStr}(${secStr})`,
        `${g}.${pack}.${chk}.${tixStr}[${secStr}]`,
        `${g}:${pack}:${chk}:${tixStr} ${secStr}`,
        `${g}${pack}${chk}${tixStr}${secStr}`,
        `${g}${pack}${tixStr}${chk}(${secStr})`,
        `]d1${g}${pack}${tixStr}${chk}${secStr}`,
        `${g}${pack}${chk}\x1D${tixStr}${secStr}`,
        ...(!symA ? [
          `${g}${pack}${chk}${tixStr}`,
          `000${g}${pack}${chk}${tixStr}`,
          `]C1${g}${pack}${chk}${tixStr}`,
          `*${g}${pack}${chk}${tixStr}*`,
          `${g}${pack}${chk}${tixStr}123456`
        ] : []),
        ...(!symB ? [
          `${g}${pack}${tixStr}${chk}`,
          `0${g}${pack}${tixStr}${chk}`,
          `00${g}${pack}${tixStr}${chk}`,
          `0000${g}${pack}${tixStr}${chk}`,
          `]I0${g}${pack}${tixStr}${chk}`,
          `${g}${pack}${tixStr}${chk}9876543210`,
          `${g}${pack}${tixStr}${chk}1234567890123456`,
          `00${g}${pack}${tixStr}${chk}9876543210`,
          `https://www.sceducationlottery.com/verify?code=${g}${pack}${tixStr}${chk}`
        ] : [])
      ];

      const storeModes = gaShared ? ['SC'] : ['SC', 'GA', 'AUTO'];
      for (const f of formats) {
        const expDisplayForFormat = f.endsWith(`[${secStr}]`) ? `${g}-${pack}-${chk}-${tixStr} [${secStr}]` : expectedDisp;
        for (const mode of storeModes) {
          const r = parseLotteryBarcode(f, [], mode);
          check(
            r?.isValid === true &&
            r?.jurisdiction === 'SC' &&
            r?.gameNumber === g &&
            r?.packNumber === pack &&
            r?.basePackNumber === pack &&
            r?.checkDigit === chk &&
            r?.ticketNumber === tix &&
            r?.ticketString === tixStr &&
            r?.securityCode === secStr &&
            r?.displayBarcode === expDisplayForFormat &&
            r?.price === game.price &&
            r?.packSize === ps,
            `[${mode}] game=${g} raw="${f}" -> "${r?.displayBarcode}" expected "${expDisplayForFormat}"`
          );
        }
      }

      // Check Layout B when non-check trailer != chk (scientific/IGT variance)
      if (!gaShared) {
        const altTrailer = String((parseInt(chk, 10) + 3) % 10);
        if (tixStr[0] !== chk) {
          const bVar = `${g}${pack}${tixStr}${altTrailer}`;
          const rVar = parseLotteryBarcode(bVar, [], 'SC');
          check(
            rVar?.isValid === true && rVar?.ticketNumber === tix && rVar?.checkDigit === chk && rVar?.displayBarcode === expectedDisp,
            `SC alt trailer "${bVar}" -> "${rVar?.displayBarcode}"`
          );
        }
      }
    }

    // Out-of-roll ticket number strictly rejected in SC
    const badTix = String(ps).padStart(3, '0');
    const badRes = parseLotteryBarcode(`${g}-047212-${computeScCheckDigit('047212')}-${badTix}(000)`, [], 'SC');
    check(badRes?.isValid === false, `SC game ${g} rejects out-of-range ticket #${badTix}`);
  }

  console.log(`  ✓ PASS: ${passed} SCEL matrix assertions across ${SCEL_GAMES.length} games passed`);

  console.log('--- PART 2: Uncataloged, Check=0, GA/SC Format Helpers & Negative Boundaries ---');

  // Ensure uncataloged continuous SC scan returns structured rejection cleanly (never TypeError)
  for (const uncat of ['99990029215069', '9999-002921-5-069', '17990472129000', '16480183780290']) {
    const r = parseLotteryBarcode(uncat, [], 'SC');
    check(r && r.isValid === false && r.isUncatalogued === true && r.basePackNumber, `Uncataloged SC "${uncat}" safely rejected without crash (pack=${r?.basePackNumber})`);
  }

  // SC check=0 Layout A vs Layout B discrimination (both with & without suffix)
  const packChk0 = '000005';
  check(computeScCheckDigit(packChk0) === '0', '000005 check digit is 0');
  const chk0A = parseLotteryBarcode(`1705${packChk0}0105`, [], 'SC'); // Layout A: check=0, tix=105 (digit13='5' != '0')
  const chk0B = parseLotteryBarcode(`1705${packChk0}0140`, [], 'SC'); // Layout B: tix=014, digit13='0'==check
  check(chk0A?.isValid && chk0A.ticketNumber === 105, `check=0 Layout A 17050000050105 -> tix=105 (got ${chk0A?.ticketNumber})`);
  check(chk0B?.isValid && chk0B.ticketNumber === 14, `check=0 Layout B 17050000050140 -> tix=014 (got ${chk0B?.ticketNumber})`);

  // formatTicketDisplayBarcode override PIN on SC & formatDisplayPackNumber with AIM / leading zero padding
  check(formatTicketDisplayBarcode('16180472120009', [], '042', 'SC') === '1618-047212-9-000 (042)', 'formatTicketDisplayBarcode honors override PIN on SC');
  check(formatDisplayPackNumber(']I016180472120009') === '047212', 'formatDisplayPackNumber strips ]I0 AIM prefix cleanly');
  check(formatDisplayPackNumber('0016180472120009') === '047212', 'formatDisplayPackNumber strips 00 padding cleanly');

  // Retail & malformed rejections (never false-accepted in either SC or GA)
  for (const bad of ['049000028904', ']E0049000028904', '012345678905', '2731-590419', '12345', 'ABC-123456', '1705002921506908', '1705-047212-000(149)', '1684-345553-004 (295)']) {
    const rSc = parseLotteryBarcode(bad, [], 'SC');
    check(rSc?.isValid === false, `SC rejects non-ticket / malformed "${bad}"`);
  }
  for (const badGa of ['049000028904', ']E0049000028904', '012345678905', '2731-590419', '12345', 'ASSET-99102']) {
    const rGa = parseLotteryBarcode(badGa, [], 'GA');
    check(rGa?.isValid === false, `GA rejects non-ticket "${badGa}"`);
  }

  // GA key formats including AIM, 00-padded, 24-digit, 30-digit, 16-digit, URL
  const gaChecks = [
    ['16480183780290', 'GA', '1648', '018378', 29, '000'],
    [']C0116480183788000', 'GA', '1648', '018378', 0, '029'],
    ['0016480183788000', 'GA', '1648', '018378', 0, '029'],
    ['182800385621002774086718', 'GA', '1828', '003856', 100, '049'],
    ['182800385621002774086718123456', 'GA', '1828', '003856', 100, '049'],
    ['https://www.galottery.com/verify?b=14170670170009', 'GA', '1417', '067017', 9, '290']
  ];
  for (const [raw, jur, g, basePack, tix, sec] of gaChecks) {
    const r = parseLotteryBarcode(raw, [], jur);
    check(
      r?.isValid === true && r.gameNumber === g && r.basePackNumber === basePack && r.ticketNumber === tix && r.securityCode === sec,
      `GA "${raw}" -> game=${g} pack=${basePack} tix=${tix} sec=${sec} (got game=${r?.gameNumber} pack=${r?.basePackNumber} tix=${r?.ticketNumber} sec=${r?.securityCode})`
    );
  }
}

async function runLiveScannerAndWorkflowTraining() {
  console.log('\n--- PART 3: Chrome CDP Live Scanner HID Keystrokes & Multi-View Workflow Training ---');
  const tmp = mkdtempSync(join(tmpdir(), 'chrome-barcode-train-'));
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
    const pending = new Map();
    const runtimeErrors = [];
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push(msg.params?.exceptionDetails?.text || 'exception');
      }
    };
    const send = (method, params = {}) => new Promise(res => {
      const id = seq++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval error');
      }
      return r.result?.value;
    };

    await new Promise(r => { ws.onopen = r; });
    await send('Runtime.enable');

    for (let i = 0; i < 30; i++) {
      const ready = await evalJs(`typeof window.processScannedBarcode === 'function' && typeof window.state === 'object'`);
      if (ready) break;
      await sleep(250);
    }

    async function dispatchChar(ch) {
      const code = ch.charCodeAt(0);
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: ch,
        text: ch,
        unmodifiedText: ch,
        windowsVirtualKeyCode: code >= 97 && code <= 122 ? code - 32 : code
      });
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: ch,
        windowsVirtualKeyCode: code >= 97 && code <= 122 ? code - 32 : code
      });
    }

    async function dispatchKey(key, code, vk, modifiers = 0) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk });
    }

    async function hidScan(str, delayMs = 6) {
      await sleep(520);
      for (const ch of str) {
        await dispatchChar(ch);
        if (delayMs > 0) await sleep(delayMs);
      }
    }

    // 1. Verify #barcodeInput preserves pasted/typed AIM, URL, / . : * while enforcing legacy sanitization limits
    const inputFilterCheck = await evalJs(`(() => {
      const inp = document.getElementById('barcodeInput');
      const run = (v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); return inp.value; };
      const out = {
        aim: run(']I016180472120009'),
        delim: run('1618/047212/9/000(059)'),
        url: run('https://www.sceducationlottery.com/verify?code=16180472120009'),
        legacyJunk: run('Hello@#$%^1910-0016624-007(142)'),
        pure30: run('1234567890123456789012345678909999')
      };
      inp.value = '';
      return out;
    })()`);
    check(inputFilterCheck.aim === ']I016180472120009', `#barcodeInput preserves AIM prefix (got "${inputFilterCheck.aim}")`);
    check(inputFilterCheck.delim === '1618/047212/9/000(059)', `#barcodeInput preserves slash delimiters (got "${inputFilterCheck.delim}")`);
    check(inputFilterCheck.url === 'https://www.sceducationlottery.com/verify?code=16180472120009', `#barcodeInput preserves lottery URL (got "${inputFilterCheck.url}")`);
    check(inputFilterCheck.legacyJunk === '1910-0016624-007(142)', `#barcodeInput still strips non-barcode junk (got "${inputFilterCheck.legacyJunk}")`);
    check(inputFilterCheck.pure30.length === 30, `#barcodeInput still caps pure digits at 30 (len=${inputFilterCheck.pure30.length})`);

    // 2. Switch to SC store mode and test real CDP HID keystroke scans across AIM, BT packet pause, GS, 30-digit, and Inventory Add New Book
    await evalJs(`(() => {
      window.state.lotteryJurisdiction = 'SC';
      window.state.shiftStatus = 'IN_PROGRESS';
      window.state.inStockInventory = [];
      window.state.slots.forEach(s => { s.status = 'EMPTY'; s.packNumber = null; s.needsActivation = false; s.scannedBarcodes = []; });
      document.getElementById('navInventory')?.click();
      document.getElementById('barcodeInput')?.focus();
    })()`);

    // 2a. HID scan AIM ]I016180472120009 + Enter on Inventory -> opens Add New Book with exact SC 1618 details
    await hidScan(']I016180472120009');
    await dispatchKey('Enter', 'Enter', 13);
    await sleep(100);
    const hidAimInv = await evalJs(`(() => {
      const m = document.getElementById('receiveBookModernModal');
      const res = {
        open: Boolean(m?.open),
        code: document.getElementById('rbCodeInput')?.value,
        gid: document.getElementById('rbGidInput')?.value,
        pack: document.getElementById('rbPackInput')?.value,
        pos: document.getElementById('rbPosInput')?.value,
        name: document.getElementById('rbNameInput')?.value,
        price: document.querySelector('#rbPricesGroup .pc.on')?.getAttribute('data-price')
      };
      m?.close();
      return res;
    })()`);
    check(
      hidAimInv.open && hidAimInv.code === '1618-047212-9-000 (059)' && hidAimInv.gid === '1618' &&
      hidAimInv.pack === '047212' && hidAimInv.pos === '000' && hidAimInv.name === 'IN THE GREEN' && hidAimInv.price === '5',
      `HID AIM ]I016180472120009 opened Add New Book accurately (got ${JSON.stringify(hidAimInv)})`
    );

    // 2b. HID scan 30-digit SC game #1703 (MIGHTY JUMBO BUCKS, $10, 30 tix) + Enter on Sell Counter
    // Scan #1 opens #setTicketDetailsModal; Add to In-Stock + Scan #2 opens #setBoxModal.
    await evalJs(`(() => {
      document.getElementById('navSellCounter')?.click();
      document.getElementById('barcodeInput')?.focus();
    })()`);
    const chk1703 = computeScCheckDigit('045114');
    await hidScan(`1703045114002${chk1703}9876543210123456`);
    await dispatchKey('Enter', 'Enter', 13);
    await sleep(120);
    const hid30Step1 = await evalJs(`(() => {
      const m = document.getElementById('setTicketDetailsModal');
      const res = {
        open: Boolean(m?.open),
        bar: document.getElementById('setTicketBarcodeDisplay')?.textContent?.trim(),
        name: document.getElementById('setBoxGameNameInput')?.value?.trim(),
        packMeta: document.getElementById('setTicketMetaPackNum')?.textContent?.trim(),
        firstTix: document.getElementById('setTicketMetaFirstTicket')?.textContent?.trim(),
        tix: document.getElementById('setBoxPackTicketsInput')?.value?.trim()
      };
      document.getElementById('btnTicketDetailsNext')?.click();
      return res;
    })()`);
    check(
      hid30Step1.open && hid30Step1.bar === `1703-045114-${chk1703}-002 (027)` &&
      hid30Step1.name === 'Mighty Jumbo Bucks' && hid30Step1.packMeta === `045114 (Check: ${chk1703})` &&
      hid30Step1.firstTix === '002' && hid30Step1.tix === '30',
      `HID 30-digit SC 1703 Scan #1 opened Ticket Details accurately (got ${JSON.stringify(hid30Step1)})`
    );

    await evalJs(`document.getElementById('barcodeInput')?.focus()`);
    await hidScan(`1703045114002${chk1703}9876543210123456`);
    await dispatchKey('Enter', 'Enter', 13);
    await sleep(100);
    const hid30 = await evalJs(`(() => {
      const s2Open = Boolean(document.getElementById('setBoxModal')?.open);
      const s2Bar = document.getElementById('step2BarcodeDisplay')?.textContent?.trim();
      const s2Cnt = document.getElementById('step2TicketsCountDisplay')?.textContent?.trim();
      const s2Price = document.getElementById('step2PriceBadge')?.textContent?.trim();
      document.getElementById('setBoxModal')?.close();
      return { s2Open, s2Bar, s2Cnt, s2Price };
    })()`);
    check(
      hid30.s2Open && hid30.s2Bar === `Barcode #1703-045114-${chk1703}-002 (027)` &&
      hid30.s2Cnt === '30 tickets · starts at ticket 002' && hid30.s2Price === '$10',
      `HID 30-digit SC 1703 Scan #2 opened Set Box accurately (got ${JSON.stringify(hid30)})`
    );

    // 2c. Verify Embedded GS (Ctrl+]) with ]C1 prefix in HID scan for newly cataloged SC #1695 ($1 / 300 tix)
    await evalJs(`document.getElementById('barcodeInput')?.focus()`);
    const chk1695 = computeScCheckDigit('112233');
    await hidScan(`]C11695112233`);
    await dispatchKey(']', 'BracketRight', 221, 2);
    for (const ch of `045${chk1695}`) { await dispatchChar(ch); await sleep(6); }
    await dispatchKey('Enter', 'Enter', 13);
    await sleep(100);
    const hidGs = await evalJs(`(() => {
      const open = Boolean(document.getElementById('setTicketDetailsModal')?.open);
      const bar = document.getElementById('setTicketBarcodeDisplay')?.textContent?.trim();
      const tix = document.getElementById('setBoxPackTicketsInput')?.value?.trim();
      const name = document.getElementById('setBoxGameNameInput')?.value?.trim();
      const packMeta = document.getElementById('setTicketMetaPackNum')?.textContent?.trim();
      const firstTix = document.getElementById('setTicketMetaFirstTicket')?.textContent?.trim();
      document.getElementById('setTicketDetailsModal')?.close();
      return { open, bar, tix, name, packMeta, firstTix };
    })()`);
    check(
      hidGs.open && hidGs.bar === `1695-112233-${chk1695}-045 (254)` &&
      hidGs.tix === '300' && hidGs.name === 'Triple Red 777' &&
      hidGs.packMeta === `112233 (Check: ${chk1695})` && hidGs.firstTix === '045',
      `HID ]C1+GS SC 1695 parsed 045 (254) / 300 tickets / $1 (got ${JSON.stringify(hidGs)})`
    );

    // 2d. Verify addScannedTicketToInventory (Inventory Update banner) uses parsed price/packSize for new SC game #1706 ($5 / 60 tix)
    const chk1706 = computeScCheckDigit('098765');
    const updBannerCheck = await evalJs(`(() => {
      document.getElementById('navInventory')?.click();
      window.addScannedTicketToInventory('1706098765003${chk1706}');
      const item = window.state.inStockInventory.find(p => p.barcodePrefix === '1706');
      return {
        gameName: item?.gameName,
        price: item?.price,
        packSizeNum: item?.packSizeNum,
        displayBarcode: item?.displayBarcode,
        position: item?.position
      };
    })()`);
    check(
      updBannerCheck.price === 5 && updBannerCheck.packSizeNum === 60 &&
      updBannerCheck.position === '003' &&
      updBannerCheck.displayBarcode === `1706-098765-${chk1706}-003 (056)`,
      `addScannedTicketToInventory stored exact price/packSize/displayBarcode for SC 1706 (got ${JSON.stringify(updBannerCheck)})`
    );

    // 2e. Verify Dashboard "Updating Inventory" mode shows per-row count & ticket count, Total at End summary, and Finish total
    await evalJs(`(() => {
      window.state.inStockInventory = [];
      window.state.scannedInventoryPacks = [];
      document.getElementById('navSellCounter')?.click();
      document.getElementById('btnUpdateInventoryCard')?.click();
    })()`);
    await hidScan('16180472120009');
    await dispatchKey('Enter', 'Enter', 13);
    await sleep(80);
    await hidScan('1714-045114-6-001 (028)');
    await dispatchKey('Enter', 'Enter', 13);
    await sleep(80);
    const updTermCheck = await evalJs(`(() => {
      window.renderHeaderAndMetrics?.();
      const rowCounts = Array.from(document.querySelectorAll('#invTerminalLog .inv-term-row-count')).map(el => el.textContent.trim());
      const res = {
        bannerCount: document.getElementById('inventoryAddedCount')?.textContent?.trim(),
        bannerSummary: document.getElementById('inventoryAddedTicketsSummary')?.textContent?.trim(),
        topCount: document.getElementById('invTermRunningCount')?.textContent?.trim(),
        bottomMetrics: document.getElementById('invTermBottomMetrics')?.textContent?.trim(),
        bottomCount: document.getElementById('invTermBottomCount')?.textContent?.trim(),
        microLabelMid: document.querySelector('.last-scan-micro-label')?.textContent?.trim(),
        rackDisplayMid: document.getElementById('dispenserRackContainer')?.style?.display,
        rowCounts
      };
      document.getElementById('btnFinishInventory')?.click();
      res.finishMicro = document.querySelector('.last-scan-micro-label')?.textContent?.trim();
      res.finishTitle = document.getElementById('scanActionTitle')?.textContent?.trim();
      res.finishDetail = document.getElementById('lastScanDisplay')?.textContent?.trim();
      res.finishLarge = document.getElementById('largeStatReadout')?.textContent?.trim();
      return res;
    })()`);
    check(
      updTermCheck.bannerCount === '2' &&
      updTermCheck.bannerSummary?.includes('90 tickets ($900)') &&
      updTermCheck.topCount === 'Count = 2' &&
      updTermCheck.bottomMetrics === '2 packs · 90 tickets · $900' &&
      updTermCheck.bottomCount === 'Total Count = 2 (90 tix)' &&
      updTermCheck.rowCounts[0] === '#2 · 30 tix ($600)' &&
      updTermCheck.rowCounts[1] === '#1 · 60 tix ($300)' &&
      updTermCheck.microLabelMid === 'UPDATING INVENTORY' &&
      updTermCheck.rackDisplayMid === 'none' &&
      updTermCheck.finishMicro === 'INVENTORY UPDATED' &&
      updTermCheck.finishTitle === '2 Packs Added' &&
      updTermCheck.finishDetail === '90 tickets total · $900' &&
      updTermCheck.finishLarge === '2',
      `Updating Inventory shows per-row count, Total at End, and Finish summary (got ${JSON.stringify(updTermCheck)})`
    );

    check(runtimeErrors.length === 0, `Zero browser runtime exceptions (got ${runtimeErrors.length})`);
  } finally {
    try { ws?.close(); } catch {}
    try { chrome.kill('SIGTERM'); } catch {}
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

runExhaustiveUnitTraining();
await runLiveScannerAndWorkflowTraining();

console.log(`\n================================================================`);
console.log(` EXHAUSTIVE BARCODE TRAINING SUITE: ${passed} PASSED, ${failed} FAILED`);
console.log(`================================================================`);
if (failed > 0) process.exit(1);
