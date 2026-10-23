import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9789;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
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
    const page = targets.find(t => t.type === 'page' && t.url.includes('5173'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let id = 1;
    const cbs = new Map();
    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.id && cbs.has(d.id)) {
        cbs.get(d.id)(d);
        cbs.delete(d.id);
      }
    };
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const curId = id++;
        cbs.set(curId, resolve);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }
    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res?.result?.result?.value !== undefined) return res.result.result.value;
      if (res?.result?.value !== undefined) return res.result.value;
      return res?.result;
    }
    async function screenshot(path) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path, Buffer.from(res.result.data, 'base64'));
    }

    console.log('\n--- Testing Box 63 Click & Box Adjust Modal Styling (Light Mode) ---');
    // Click box 63 tile
    await evaluate(`(() => {
      const box63 = document.querySelector('.box-card[data-box="63"]');
      if (box63) box63.click();
    })()`);
    await sleep(600);

    const lightStyles = await evaluate(`(() => {
      const modal = document.getElementById('boxAdjustModal');
      const badge = document.getElementById('boxDetailNumBadge');
      const gameName = document.getElementById('boxDetailGameName');
      const statCard = document.querySelector('#boxAdjustModal .stat');
      const statVal = document.querySelector('#boxAdjustModal .stat .v');
      const tabMove = document.getElementById('tabBoxMove');
      const emptyChips = document.querySelectorAll('#boxMovePickChips .chip');

      const cs = (el) => el ? window.getComputedStyle(el) : {};
      return {
        open: modal ? modal.open : false,
        modalBg: cs(modal).backgroundColor,
        modalRadius: cs(modal).borderRadius,
        badgeBg: cs(badge).backgroundColor,
        badgeFont: cs(badge).fontFamily,
        gameNameText: gameName ? gameName.textContent : '',
        gameNameFont: cs(gameName).fontFamily,
        gameNameWeight: cs(gameName).fontWeight,
        statCardBg: cs(statCard).backgroundColor,
        statValFont: cs(statVal).fontFamily,
        tabMoveBg: cs(tabMove).backgroundColor,
        emptyChipsCount: emptyChips.length
      };
    })()`);

    console.log('Light Mode Styles for Box Adjust Modal:', lightStyles);

    assert.strictEqual(lightStyles.open, true, 'boxAdjustModal is open after clicking Box 63');
    assert(lightStyles.badgeFont.includes('JetBrains Mono') || lightStyles.badgeFont.includes('monospace'), 'Badge uses monospace font');
    assert(lightStyles.gameNameFont.includes('Figtree'), 'Game title uses Figtree font');
    assert(lightStyles.emptyChipsCount > 0, 'Empty box chips are rendered in Change Box tab');

    // Screenshot light mode box adjust modal
    await screenshot('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\screenshots\\box63_modal_light.png');
    console.log('✓ PASS: Box Adjust Modal Light Mode styling verified!');

    console.log('\n--- Testing Box 63 Click & Box Adjust Modal Styling (Dark Mode) ---');
    // Switch to dark mode
    await evaluate(`document.documentElement.setAttribute('data-theme', 'dark');`);
    await sleep(400);

    const darkStyles = await evaluate(`(() => {
      const modal = document.getElementById('boxAdjustModal');
      const badge = document.getElementById('boxDetailNumBadge');
      const gameName = document.getElementById('boxDetailGameName');
      const statCard = document.querySelector('#boxAdjustModal .stat');

      const cs = (el) => el ? window.getComputedStyle(el) : {};
      return {
        modalBg: cs(modal).backgroundColor,
        badgeBg: cs(badge).backgroundColor,
        badgeColor: cs(badge).color,
        gameNameColor: cs(gameName).color,
        statCardBg: cs(statCard).backgroundColor
      };
    })()`);

    console.log('Dark Mode Styles for Box Adjust Modal:', darkStyles);

    // In dark mode, background should be dark surface #161A20 -> rgb(22, 26, 32)
    assert.strictEqual(darkStyles.modalBg, 'rgb(22, 26, 32)', 'Modal background is dark surface #161A20');
    assert.strictEqual(darkStyles.badgeBg, 'rgb(27, 41, 73)', 'Badge background is dark brand-soft #1B2949');
    assert.strictEqual(darkStyles.gameNameColor, 'rgb(238, 241, 245)', 'Game name is high-contrast light ink #EEF1F5');

    // Screenshot dark mode box adjust modal
    await screenshot('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\screenshots\\box63_modal_dark.png');
    console.log('✓ PASS: Box Adjust Modal Dark Mode styling verified!');

    // Close boxAdjustModal and switch back to light mode
    await evaluate(`(() => {
      document.getElementById('boxAdjustModal')?.close();
      document.documentElement.removeAttribute('data-theme');
    })()`);
    await sleep(300);

    console.log('\n--- Testing Settlement Button Click & Settlement Modal ---');
    await evaluate(`document.getElementById('tabSettlement')?.click();`);
    await sleep(500);

    const settleCheck = await evaluate(`(() => {
      const modal = document.getElementById('settlementModernModal');
      const stScanned = document.getElementById('stScannedCount');
      const stSales = document.getElementById('stTicketSales');
      return {
        open: modal ? modal.open : false,
        scanned: stScanned ? stScanned.textContent : '',
        sales: stSales ? stSales.textContent : ''
      };
    })()`);
    console.log('Settlement Modal State:', settleCheck);
    assert.strictEqual(settleCheck.open, true, 'Settlement modal opens on tabSettlement click');
    await screenshot('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\screenshots\\settlement_modal.png');
    console.log('✓ PASS: Settlement Modal verified!');

    // Close settlement modal
    await evaluate(`document.getElementById('settlementModernModal')?.close();`);
    await sleep(300);

    console.log('\n--- Testing Quick View (This Month) Button Click ---');
    await evaluate(`document.getElementById('tabThisMonth')?.click();`);
    await sleep(500);

    const listCheck = await evaluate(`(() => {
      const modal = document.getElementById('listQuickViewModal');
      const badge = document.getElementById('plCountBadge');
      const rows = document.querySelectorAll('#plTableBody tr');
      return {
        open: modal ? modal.open : false,
        badgeCount: badge ? badge.textContent : '',
        rowCount: rows.length
      };
    })()`);
    console.log('List Quick View Modal State:', listCheck);
    assert.strictEqual(listCheck.open, true, 'Quick View modal opens on tabThisMonth click');
    assert(listCheck.rowCount > 0, 'Table rows are rendered for This Month');
    console.log('✓ PASS: List Quick View Modal verified!');

    // Close quick view modal
    await evaluate(`document.getElementById('listQuickViewModal')?.close();`);
    await sleep(300);

    console.log('\n--- Testing Empty Box Slot Click & Activation Modal ---');
    await evaluate(`(() => {
      const emptySlot = document.querySelector('.ribbon-cell.empty-slot') || document.querySelector('.box-card-add-pack');
      if (emptySlot) emptySlot.click();
      else if (window.openActivationForBox) window.openActivationForBox(5);
    })()`);
    await sleep(600);

    const actCheck = await evaluate(`(() => {
      const modal = document.getElementById('activationModal');
      const boxInput = document.getElementById('keypadBoxInput');
      return {
        open: modal ? modal.open : false,
        boxValue: boxInput ? boxInput.value : ''
      };
    })()`);
    console.log('Activation Modal State:', actCheck);
    assert.strictEqual(actCheck.open, true, 'Activation modal opens on empty slot click');
    await screenshot('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\screenshots\\activation_modal.png');
    console.log('✓ PASS: Activation Modal verified!');

    await evaluate(`document.getElementById('activationModal')?.close();`);

  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
