import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9258;
const SCREENSHOT_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\2da9a679-e8a6-4567-8bc5-b56d1d96835d";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

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

  await call('Page.enable');
  await sleep(1500);

  // Step 1: Navigate to Inventory View
  await call('Runtime.evaluate', {
    expression: `document.getElementById('navInventory')?.click();`
  });
  await sleep(500);

  // Step 2: Check Inventory table & button text
  const checkButtons = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const rows = document.querySelectorAll('#invTableBody tr');
      const fixBtns = Array.from(document.querySelectorAll('.btn-inv-fix span')).map(s => s.textContent.trim());
      return {
        rowCount: rows.length,
        fixBtnTexts: fixBtns.slice(0, 5),
        allSayFixOnly: fixBtns.length > 0 && fixBtns.every(t => t === 'Fix')
      };
    })()`
  });
  console.log('Button verification:', checkButtons.result.result.value);

  // Take screenshot of inventory table with "Fix" buttons
  const shotTable = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'inventory_table_fix_button.png'), Buffer.from(shotTable.result.data, 'base64'));

  // Step 3: Open Fix Modal for Box 1
  await call('Runtime.evaluate', {
    expression: `(() => {
      const firstFixBtn = document.querySelector('#invTableBody tr .btn-inv-fix');
      if (firstFixBtn) firstFixBtn.click();
    })()`
  });
  await sleep(600);

  // Step 4: Verify modal contents
  const modalInspection = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const modal = document.getElementById('invFixCountModal');
      const title = document.getElementById('invFixModalTitle')?.textContent.trim();
      const game = document.getElementById('invFixGameName')?.textContent.trim();
      const pack = document.getElementById('invFixPackNumber')?.textContent.trim();
      const price = document.getElementById('invFixPrice')?.textContent.trim();
      const size = document.getElementById('invFixPackSize')?.textContent.trim();
      const cur = document.getElementById('invFixCurrentTix')?.textContent.trim();
      const input = document.getElementById('invFixNewTicketInput')?.value;
      const notice = document.getElementById('invFixImpactText')?.textContent.trim();
      const isOpen = modal && modal.open;

      return {
        isOpen,
        width: window.getComputedStyle(modal).width,
        maxWidth: window.getComputedStyle(modal).maxWidth,
        title,
        game,
        pack,
        price,
        size,
        cur,
        inputValue: input,
        impactNotice: notice
      };
    })()`
  });
  console.log('Modal inspection:', modalInspection.result.result.value);

  // Capture screenshot of Fix modal in light mode
  const shotModalLight = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'fix_modal_light.png'), Buffer.from(shotModalLight.result.data, 'base64'));

  // Switch to dark theme and capture screenshot
  await call('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'dark');`
  });
  await sleep(400);
  const shotModalDark = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'fix_modal_dark.png'), Buffer.from(shotModalDark.result.data, 'base64'));

  // Switch back to light theme
  await call('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'light');`
  });
  await sleep(300);

  // Step 5: Test quick pill buttons & stepper
  const testStepper = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const incBtn = document.getElementById('invFixIncBtn');
      incBtn?.click();
      const valAfterInc = document.getElementById('invFixNewTicketInput')?.value;
      const noticeAfterInc = document.getElementById('invFixImpactText')?.textContent.trim();

      const pillP5 = document.querySelector('.inv-fix-pill-btn[data-step="5"]');
      pillP5?.click();
      const valAfterP5 = document.getElementById('invFixNewTicketInput')?.value;

      const resetBtn = document.querySelector('.inv-fix-pill-btn[data-step="0"]');
      resetBtn?.click();
      const valAfterReset = document.getElementById('invFixNewTicketInput')?.value;

      return {
        valAfterInc,
        noticeAfterInc,
        valAfterP5,
        valAfterReset
      };
    })()`
  });
  console.log('Stepper & Quick Pills Test:', testStepper.result.result.value);

  // Step 6: Test Fix Save Functionality (Full Update Inventory Parity)
  const testSave = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const input = document.getElementById('invFixNewTicketInput');
      input.value = '15';
      input.dispatchEvent(new Event('input'));

      const saveBtn = document.getElementById('invFixSaveBtn');
      saveBtn?.click();

      const modal = document.getElementById('invFixCountModal');
      const box1Slot = (window.state?.slots || []).find(s => s.boxNumber === 1);

      return {
        modalClosed: !modal.open,
        slot1CurrentTicket: box1Slot?.currentTicket
      };
    })()`
  });
  console.log('Save result:', testSave.result.result.value);

  // Step 7: Verify Stock Intake (Update Inventory) functions remain 100% operational
  const intakeTest = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const intakeBtn = document.getElementById('invBtnStockIntake');
      if (intakeBtn) intakeBtn.click();
      const rpView = document.getElementById('viewReceivePacks');
      const isVisible = rpView && window.getComputedStyle(rpView).display === 'block';

      const movementCards = Array.from(document.querySelectorAll('.rp-movement-card')).map(c => c.getAttribute('data-movement'));
      const barcodeInput = document.getElementById('rpPackBarcodeInput');

      // Click each movement type to verify interactivity
      const cardsClickable = [];
      document.querySelectorAll('.rp-movement-card').forEach(c => {
        c.click();
        cardsClickable.push(c.classList.contains('active'));
      });

      return {
        receivePacksVisible: isVisible,
        movementTypesCount: movementCards.length,
        movementTypes: movementCards,
        hasBarcodeInput: Boolean(barcodeInput),
        allCardsInteractive: cardsClickable.every(v => v === true)
      };
    })()`
  });
  console.log('Stock Intake (Update Inventory) full verification:', intakeTest.result.result.value);

  // Capture screenshot of Stock Intake
  const shotIntake = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'stock_intake_verified.png'), Buffer.from(shotIntake.result.data, 'base64'));

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
