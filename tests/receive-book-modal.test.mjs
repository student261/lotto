import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9785;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('   RUNNING RECEIVE A BOOK MODAL VERIFICATION SUITE   ');
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

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

  try {
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

    async function evalInPage(expression) {
      const res = await call('Runtime.evaluate', {
        returnByValue: true,
        expression
      });
      return res.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await sleep(1500);

    // Group 1: Navigation to Inventory & Opening Modal
    console.log('--- Test Group 1: Opening Receive a Book Modal ---');
    const openRes = await evalInPage(`(() => {
      document.querySelector('#navInventory')?.click();
      const addBtn = document.getElementById('invBtnAddNewBook');
      if (!addBtn) return { error: 'invBtnAddNewBook not found' };
      addBtn.click();
      const modal = document.getElementById('receiveBookModernModal');
      const title = document.getElementById('rec-h')?.textContent;
      const isOpen = modal && modal.open;
      const subtitle = modal?.querySelector('.modal-h p')?.textContent;
      return { isOpen, title, subtitle };
    })()`);

    assert(openRes?.isOpen, 'Receive a Book modern modal opens upon clicking + Add New Book');
    assert(openRes?.title === 'Receive a book', 'Modal heading is exact: "Receive a book"');
    assert(openRes?.subtitle?.includes('Scan the pack barcode'), 'Modal subtitle matches design specification');

    // Group 2: Keypad typing, game recognition, pack value auto-calculation
    console.log('\n--- Test Group 2: Keypad Typing & Game Recognition ---');
    const typeRes = await evalInPage(`(() => {
      const keys = ['1', '4', '0', '4'];
      keys.forEach(k => {
        const btn = document.querySelector(\`#rbKeypadGrid .kk[data-key="\${k}"]\`);
        btn?.click();
      });
      const gidVal = document.getElementById('rbGidInput')?.value;
      const gameNameVal = document.getElementById('rbNameInput')?.value;
      const msgOkVisible = document.getElementById('rbMsgOk')?.style.display !== 'none';
      const msgOkText = document.getElementById('rbMsgOkText')?.textContent;
      const price2Selected = document.querySelector('#rbPricesGroup .pc[data-price="2"]')?.classList.contains('on');
      const packVal = document.getElementById('rbPackValueAmount')?.textContent;
      const packEq = document.getElementById('rbPackValueEq')?.textContent;
      const targetLabel = document.getElementById('rbTargetLabel')?.textContent;

      return {
        gidVal,
        gameNameVal,
        msgOkVisible,
        msgOkText,
        price2Selected,
        packVal,
        packEq,
        targetLabel
      };
    })()`);

    assert(typeRes?.gidVal === '1404', 'Game ID 1404 typed with number keypad');
    assert(typeRes?.gameNameVal === 'Hit 100', 'Game 1404 auto-recognized as "Hit 100"');
    assert(typeRes?.msgOkVisible, 'Recognition banner displays ok message');
    assert(typeRes?.price2Selected, 'Ticket price $2 chip auto-selected');
    assert(typeRes?.packVal === '$300', 'Pack value auto-calculated as $300');
    assert(typeRes?.packEq?.includes('150 tickets'), 'Pack equation correctly shows 150 tickets');
    assert(typeRes?.targetLabel === 'Pack #', 'Focus auto-advanced to Pack # after 4 digits');

    // Group 3: Capture Screenshot of Open Modal (Light Mode)
    console.log('\n--- Test Group 3: Visual Verification Screenshot ---');
    await sleep(500);
    const shotLight = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\verified_receive_book_modal_light.png', Buffer.from(shotLight.result.data, 'base64'));
    assert(fs.existsSync('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\verified_receive_book_modal_light.png'), 'Captured high-resolution screenshot in Light mode');

    // Group 4: Dark Mode Toggle & Screenshot
    console.log('\n--- Test Group 4: Dark Mode Modal Visuals ---');
    const darkRes = await evalInPage(`(() => {
      document.body.setAttribute('data-theme', 'dark');
      const modal = document.querySelector('#receiveBookModernModal .modal.rb');
      const bg = window.getComputedStyle(modal).backgroundColor;
      return { bg };
    })()`);
    await sleep(500);
    const shotDark = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\verified_receive_book_modal_dark.png', Buffer.from(shotDark.result.data, 'base64'));
    assert(fs.existsSync('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\verified_receive_book_modal_dark.png'), 'Captured high-resolution screenshot in Dark mode');

    // Group 5: Modal Dismissal
    console.log('\n--- Test Group 5: Modal Dismissal ---');
    const closeRes = await evalInPage(`(() => {
      document.getElementById('rbCancelBtn')?.click();
      const modal = document.getElementById('receiveBookModernModal');
      return { isOpen: modal?.open };
    })()`);
    assert(!closeRes?.isOpen, 'Receive a Book modal closes cleanly upon clicking Cancel');

    console.log('\n====================================================');
    console.log(`   TEST RESULTS: Passed: ${passed}, Failed: ${failed}`);
    console.log('====================================================\n');

    ws.close();
  } finally {
    p.kill();
  }
}

runTests();
