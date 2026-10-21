import { spawn } from 'child_process';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9254;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== VERIFYING ADMIN PRIVILEGES, PIN CHANGE & AUTH INTEGRATION ===\n');
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
    await call('Page.enable');

    for (let i = 0; i < 30; i++) {
      const ready = await evaluate(`typeof window.requireAdminAuth === 'function' && typeof window.isCurrentAdmin === 'function'`);
      if (ready) break;
      await sleep(200);
    }

    console.log('--- 1. Testing isCurrentAdmin() for different roles ---');
    // Initially signed in or default
    const test1 = await evaluate(`(() => {
      const state = window.getState();
      state.cashierName = 'Daniel'; // Daniel is Salesperson
      const isDanielAdmin = window.isCurrentAdmin();
      
      state.cashierName = 'Carlos'; // Carlos is Salesperson
      const isCarlosAdmin = window.isCurrentAdmin();

      state.cashierName = 'Maulik'; // Maulik is Owner
      const isMaulikAdmin = window.isCurrentAdmin();

      state.cashierName = 'Admin'; // Admin is Owner
      const isAdminUserAdmin = window.isCurrentAdmin();

      return { isDanielAdmin, isCarlosAdmin, isMaulikAdmin, isAdminUserAdmin };
    })()`);

    console.log('Admin check results:', test1);
    assert.strictEqual(test1.isDanielAdmin, false, 'Daniel is Salesperson so isCurrentAdmin must be false');
    assert.strictEqual(test1.isCarlosAdmin, false, 'Carlos is Salesperson so isCurrentAdmin must be false');
    assert.strictEqual(test1.isMaulikAdmin, true, 'Maulik is Owner so isCurrentAdmin must be true');
    assert.strictEqual(test1.isAdminUserAdmin, true, 'Admin is Owner so isCurrentAdmin must be true');

    console.log('--- 2. Testing requireAdminAuth with Mocked Prompt ---');
    const testAuthPrompt = await evaluate(`(() => {
      const state = window.getState();
      state.cashierName = 'Carlos'; // Not admin

      // Test 1: prompt returns null (cancelled)
      window.prompt = () => null;
      const cancelled = window.requireAdminAuth('test action');

      // Test 2: prompt returns wrong PIN
      window.prompt = () => '9999';
      const wrongPin = window.requireAdminAuth('test action');

      // Test 3: prompt returns correct Owner PIN '1234'
      window.prompt = () => '1234';
      const correctPin = window.requireAdminAuth('test action');

      // Test 4: When Maulik is logged in, no prompt needed
      state.cashierName = 'Maulik';
      let promptCalled = false;
      window.prompt = () => { promptCalled = true; return '1234'; };
      const ownerDirect = window.requireAdminAuth('test action');

      return { cancelled, wrongPin, correctPin, ownerDirect, promptCalled };
    })()`);

    console.log('Auth prompt test results:', testAuthPrompt);
    assert.strictEqual(testAuthPrompt.cancelled, false, 'Cancelled prompt must block action');
    assert.strictEqual(testAuthPrompt.wrongPin, false, 'Wrong PIN must block action');
    assert.strictEqual(testAuthPrompt.correctPin, true, 'Correct Admin PIN must authorize action');
    assert.strictEqual(testAuthPrompt.ownerDirect, true, 'Owner should bypass prompt');
    assert.strictEqual(testAuthPrompt.promptCalled, false, 'Prompt should NOT be called for owner');

    console.log('--- 3. Testing Settings People Table: "Change PIN" & Live Update ---');
    // Open settings view tab 4 (People)
    await evaluate(`(() => {
      window.switchStore('store_amigo');
      const state = window.getState();
      state.cashierName = 'Maulik'; // Owner
      // Navigate to Settings tab 4
      const navItem = document.querySelector('[data-view="viewSettings"]');
      if (navItem) navItem.click();
      const tabPeople = document.getElementById('tabSettingsPeople');
      if (tabPeople) tabPeople.click();
    })()`);
    await sleep(400);

    const checkTableHasChangePinBtn = await evaluate(`(() => {
      const rows = document.querySelectorAll('#settingsPeopleNewTableBody tr');
      const changePinBtns = document.querySelectorAll('#settingsPeopleNewTableBody .btn-person-reset-pin');
      return { rowCount: rows.length, btnCount: changePinBtns.length };
    })()`);
    console.log('Settings People Table Buttons:', checkTableHasChangePinBtn);
    assert.ok(checkTableHasChangePinBtn.btnCount > 0, 'Change PIN buttons must be rendered in people table');

    console.log('--- 4. Changing PIN for Carlos via Modal ---');
    // Trigger click on Carlos's Change PIN button
    const modalTrigger = await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('#settingsPeopleNewTableBody .btn-person-reset-pin'))
        .find(b => b.dataset.personName === 'Carlos' || b.dataset.personId === 'carlos');
      if (!btn) return { error: 'Carlos button not found' };
      btn.click();
      
      const modal = document.getElementById('resetPinModal');
      const title = document.getElementById('resetPinModalTitle')?.textContent;
      const input = document.getElementById('newPinInput');
      if (input) input.value = '5566';
      
      const saveBtn = document.getElementById('saveSettingsResetPinBtn');
      if (saveBtn) saveBtn.click();

      // Check if state updated
      const state = window.getState();
      const clerk = state.clerks?.find(c => c.name === 'Carlos');
      const person = state.settingsPeopleList?.find(c => c.name === 'Carlos');
      return { 
        title, 
        carlosClerkPin: clerk?.pin, 
        carlosPersonPin: person?.pin 
      };
    })()`);
    console.log('Modal trigger & PIN update results:', modalTrigger);
    assert.strictEqual(modalTrigger.carlosPersonPin, '5566', 'Carlos PIN must be updated to 5566');

    console.log('--- 5. Signing Out & Logging in with new PIN 5566 ---');
    // Sign out to open Sign In screen
    await evaluate(`window.showSignInScreen()`);
    await sleep(400);

    // Try signing in with wrong PIN 9999 -> should fail
    const oldLoginResult = await evaluate(`(() => {
      const userInput = document.getElementById('inputSignInUser');
      const passInput = document.getElementById('inputSignInPass');
      userInput.value = 'carlos';
      userInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.value = '9999';
      document.getElementById('signInMainForm').dispatchEvent(new Event('submit', { cancelable: true }));

      const alert = document.getElementById('signInErrorAlert');
      return { 
        alertVisible: alert && alert.style.display !== 'none',
        alertText: alert?.textContent?.trim()
      };
    })()`);
    console.log('Wrong PIN login result (expected failure):', oldLoginResult);
    assert.strictEqual(oldLoginResult.alertVisible, true, 'Wrong PIN must be rejected');

    // Now sign in with new PIN 5566 -> must succeed!
    const newLoginResult = await evaluate(`(() => {
      const userInput = document.getElementById('inputSignInUser');
      const passInput = document.getElementById('inputSignInPass');
      userInput.value = 'carlos';
      userInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.value = '5566';
      document.getElementById('signInMainForm').dispatchEvent(new Event('submit', { cancelable: true }));

      const signInView = document.getElementById('viewSignIn');
      const posLayout = document.querySelector('.pos-app-layout');
      const state = window.getState();
      return {
        signInHidden: signInView?.style.display === 'none',
        posVisible: posLayout && posLayout.style.display !== 'none',
        cashier: state.cashierName,
        store: state.storeName
      };
    })()`);
    console.log('New PIN 5566 login result (expected success):', newLoginResult);
    assert.strictEqual(newLoginResult.signInHidden, true, 'Sign-in screen should be hidden after valid login');
    assert.strictEqual(newLoginResult.cashier, 'Carlos', 'Cashier should be set to Carlos');

    console.log('--- 6. Runtime Exception Check ---');
    console.log('Total Browser Exceptions:', errors.length);
    assert.strictEqual(errors.length, 0, 'Must have zero browser exceptions');

    console.log('\n🎉 ALL ADMIN PRIVILEGES, PIN CHANGE & AUTH TESTS PASSED FLAWLESSLY!');

  } finally {
    p.kill();
  }
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
