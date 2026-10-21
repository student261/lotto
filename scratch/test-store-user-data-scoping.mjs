import { spawn } from 'child_process';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9252;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== VERIFYING MULTI-STORE & USER DATA SCOPING ===\n');
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2500);
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const cbs = new Map();
    const errors = [];

    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push(d.params.exceptionDetails);
        console.error('Browser Exception:', JSON.stringify(d.params.exceptionDetails));
      }
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

    async function evaluate(expression) {
      const resp = await call('Runtime.evaluate', { expression, returnByValue: true });
      return resp.result?.result?.value;
    }

    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);

    // 1. Initial State: Store 1 (Amigo Food Mart)
    console.log('--- 1. Checking Store 1 (Amigo Food Mart) ---');
    const store1Data = await evaluate(`
      (() => {
        const sid = window.getCurrentStoreId();
        const state = window.getState();
        const sidebarStore = document.getElementById('sidebarStoreName')?.textContent;
        const b1Card = document.querySelector('.box-card[data-box="1"]');
        const b1Tix = b1Card?.querySelector('.ticket-number-display')?.textContent;
        return {
          sid,
          storeName: state.storeName,
          sidebarStore,
          b1Tix
        };
      })()
    `);
    console.log('Store 1 Info:', store1Data);
    assert.equal(store1Data.sid, 'store_amigo');
    assert.ok(store1Data.storeName.includes('AMIGO FOOD MART'));

    // 2. Switch Store to Store 2 (Downtown Quick Mart)
    console.log('\n--- 2. Switching to Store 2 (Downtown Quick Mart) ---');
    await evaluate(`window.switchStore('store_downtown');`);
    await sleep(600);

    const store2Data = await evaluate(`
      (() => {
        const sid = window.getCurrentStoreId();
        const state = window.getState();
        const sidebarStore = document.getElementById('sidebarStoreName')?.textContent;
        const activeBoxesCount = (state.slots || []).filter(s => s.status === 'ACTIVE' && s.packNumber).length;
        return {
          sid,
          storeName: state.storeName,
          sidebarStore,
          activeBoxesCount
        };
      })()
    `);
    console.log('Store 2 Info:', store2Data);
    assert.equal(store2Data.sid, 'store_downtown');
    assert.ok(store2Data.storeName.includes('DOWNTOWN QUICK MART'));
    assert.ok(store2Data.sidebarStore.includes('DOWNTOWN QUICK MART'));

    // 3. Switch back to Store 1 (Amigo Food Mart)
    console.log('\n--- 3. Switching back to Store 1 ---');
    await evaluate(`window.switchStore('store_amigo');`);
    await sleep(600);

    const store1Back = await evaluate(`
      (() => {
        const sid = window.getCurrentStoreId();
        const state = window.getState();
        const sidebarStore = document.getElementById('sidebarStoreName')?.textContent;
        const b1Card = document.querySelector('.box-card[data-box="1"]');
        const b1Tix = b1Card?.querySelector('.ticket-number-display')?.textContent;
        return {
          sid,
          storeName: state.storeName,
          sidebarStore,
          b1Tix
        };
      })()
    `);
    console.log('Store 1 Back Info:', store1Back);
    assert.equal(store1Back.sid, 'store_amigo');
    assert.ok(store1Back.storeName.includes('AMIGO FOOD MART'));
    assert.equal(store1Back.b1Tix, store1Data.b1Tix, 'Store 1 ticket data must be perfectly preserved!');

    // 4. Test User / Cashier Switching via Cashier Modal
    console.log('\n--- 4. Testing User / Cashier Switching ---');
    // Open modal
    await evaluate(`document.getElementById('sidebarUserPill')?.click();`);
    await sleep(300);

    const modalOpenCheck = await evaluate(`document.getElementById('cashierModal')?.open`);
    console.log('Cashier Modal Open:', modalOpenCheck);
    assert.equal(modalOpenCheck, true);

    // Click Priya clerk pill
    await evaluate(`
      (() => {
        const btnPriya = document.querySelector('.quick-clerk-pill[data-clerk="Priya"]');
        btnPriya?.click();
        document.getElementById('saveCashierModalBtn')?.click();
      })()
    `);
    await sleep(400);

    const userPriyaCheck = await evaluate(`
      (() => {
        const userName = document.getElementById('sidebarUserName')?.textContent;
        const avatar = document.getElementById('sidebarAvatar')?.textContent;
        const role = document.getElementById('sidebarUserRole')?.textContent;
        return { userName, avatar, role };
      })()
    `);
    console.log('Priya User Info:', userPriyaCheck);
    assert.equal(userPriyaCheck.userName, 'Priya');
    assert.equal(userPriyaCheck.avatar, 'P');
    assert.equal(userPriyaCheck.role, 'Cashier');

    // Switch back to master
    await evaluate(`
      (() => {
        document.getElementById('btnSignOut')?.click();
        const btnMaster = document.querySelector('.quick-clerk-pill[data-clerk="master"]');
        btnMaster?.click();
        document.getElementById('saveCashierModalBtn')?.click();
      })()
    `);
    await sleep(400);

    const userMasterCheck = await evaluate(`
      (() => {
        const userName = document.getElementById('sidebarUserName')?.textContent;
        const avatar = document.getElementById('sidebarAvatar')?.textContent;
        const role = document.getElementById('sidebarUserRole')?.textContent;
        return { userName, avatar, role };
      })()
    `);
    console.log('Master User Info:', userMasterCheck);
    assert.equal(userMasterCheck.userName, 'master');
    assert.equal(userMasterCheck.avatar, 'M');
    assert.equal(userMasterCheck.role, 'Owner');

    console.log('\nTotal exceptions detected:', errors.length);
    assert.equal(errors.length, 0);
    console.log('✓ ALL MULTI-STORE & USER DATA SCOPING TESTS PASSED PERFECTLY!');
  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
