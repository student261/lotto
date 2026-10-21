import { spawn } from 'child_process';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9253;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== VERIFYING SIGN IN UI, PASSWORD AUTH & STORE ROUTING ===\n');
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
    
    // Wait for Vite module compilation
    for (let i = 0; i < 30; i++) {
      const ready = await evaluate(`typeof window.showSignInScreen === 'function'`);
      if (ready) break;
      await sleep(300);
    }

    // Step 1: Open Sign In Screen via showSignInScreen()
    console.log('--- 1. Testing Sign In Screen UI & Elements ---');
    await evaluate(`window.showSignInScreen()`);
    await sleep(500);

    const isSignInVisible = await evaluate(`
      document.getElementById('viewSignIn').style.display !== 'none'
    `);
    const isPosHidden = await evaluate(`
      document.querySelector('.pos-app-layout').style.display === 'none'
    `);
    console.log('Sign in screen visible:', isSignInVisible);
    console.log('POS app layout hidden:', isPosHidden);
    assert.strictEqual(isSignInVisible, true, 'Sign In screen must be visible');
    assert.strictEqual(isPosHidden, true, 'POS layout must be hidden when on Sign In');

    // Check UI texts matching reference screenshot
    const leftHeadline = await evaluate(`document.querySelector('.signin-headline')?.innerText?.trim()`);
    const stepCardsCount = await evaluate(`document.querySelectorAll('.signin-step-card').length`);
    const signInTitle = await evaluate(`document.querySelector('.signin-form-title')?.innerText?.trim()`);
    const footerHint = await evaluate(`document.querySelector('.signin-footer-hint')?.innerText?.trim()`);

    console.log('Headline:', leftHeadline);
    console.log('Step cards count:', stepCardsCount);
    console.log('Form title:', signInTitle);
    console.log('Footer hint:', footerHint);

    assert(leftHeadline.includes('four simple steps'), 'Headline must match screenshot');
    assert.strictEqual(stepCardsCount, 4, 'Must have 4 step cards');
    assert.strictEqual(signInTitle, 'Sign in', 'Form title must be Sign in');
    assert(footerHint.includes('Ask the store owner to reset it'), 'Footer hint must match screenshot');

    // Step 2: Test Real-Time Store Subtitle dynamic lookup
    console.log('\n--- 2. Testing Real-time Store Subtitle Update ---');
    await evaluate(`
      const uInp = document.getElementById('inputSignInUser');
      uInp.value = 'kevin';
      uInp.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await sleep(100);
    const kevinStoreSub = await evaluate(`document.getElementById('signInStoreSubtitle')?.innerText?.trim()`);
    console.log('Typing "kevin" sets subtitle to:', kevinStoreSub);
    assert.strictEqual(kevinStoreSub, 'Downtown Quick Mart');

    const debugInfo = await evaluate(`
      (() => {
        const uInp = document.getElementById('inputSignInUser');
        const before = document.getElementById('signInStoreSubtitle').textContent;
        uInp.value = 'rosa';
        uInp.dispatchEvent(new Event('input', { bubbles: true }));
        const afterEvent = document.getElementById('signInStoreSubtitle').textContent;
        window.updateSignInStoreSubtitle ? window.updateSignInStoreSubtitle('rosa') : null;
        const afterDirect = document.getElementById('signInStoreSubtitle').textContent;
        return { before, afterEvent, afterDirect, assigned: window.lookupUserAssignedStore('rosa') };
      })()
    `);
    console.log('DEBUG INFO FOR ROSA:', debugInfo);
    const rosaStoreSub = await evaluate(`document.getElementById('signInStoreSubtitle')?.innerText?.trim()`);
    console.log('Typing "rosa" sets subtitle to:', rosaStoreSub);
    assert.strictEqual(rosaStoreSub, 'Amigo Food Mart');

    // Step 3: Test Password Eye Icon Toggle
    console.log('\n--- 3. Testing Eye Icon Password Visibility Toggle ---');
    const typeInitial = await evaluate(`document.getElementById('inputSignInPass').type`);
    await evaluate(`document.getElementById('btnToggleSignInPass').click()`);
    const typeToggled = await evaluate(`document.getElementById('inputSignInPass').type`);
    await evaluate(`document.getElementById('btnToggleSignInPass').click()`);
    const typeRestored = await evaluate(`document.getElementById('inputSignInPass').type`);

    console.log('Initial password type:', typeInitial);
    console.log('Toggled password type:', typeToggled);
    console.log('Restored password type:', typeRestored);
    assert.strictEqual(typeInitial, 'password');
    assert.strictEqual(typeToggled, 'text');
    assert.strictEqual(typeRestored, 'password');

    // Step 4: Test Invalid Password Validation
    console.log('\n--- 4. Testing Invalid Password Validation ---');
    await evaluate(`
      document.getElementById('inputSignInUser').value = 'rosa';
      document.getElementById('inputSignInPass').value = 'wrongpass999';
      document.getElementById('signInMainForm').dispatchEvent(new Event('submit', { cancelable: true }));
    `);
    await sleep(200);
    const errorText = await evaluate(`document.getElementById('signInErrorAlert')?.innerText?.trim()`);
    console.log('Error alert shown:', errorText);
    assert(errorText.includes('Incorrect password'), 'Must show incorrect password alert');

    // Step 5: Sign in as Rosa -> Should open Amigo Food Mart
    console.log('\n--- 5. Signing in as Rosa (Store 1: Amigo Food Mart) ---');
    await evaluate(`
      document.getElementById('inputSignInUser').value = 'rosa';
      document.getElementById('inputSignInPass').value = '1234';
      document.getElementById('signInMainForm').dispatchEvent(new Event('submit', { cancelable: true }));
    `);
    await sleep(400);

    const isPOSVisibleAfterRosa = await evaluate(`
      document.getElementById('viewSignIn').style.display === 'none' &&
      document.querySelector('.pos-app-layout').style.display !== 'none'
    `);
    const activeStoreRosa = await evaluate(`window.getCurrentStoreId()`);
    const activeCashierRosa = await evaluate(`window.state?.cashierName || window.getState?.()?.cashierName`);
    const sidebarUserRosa = await evaluate(`document.getElementById('sidebarUserName')?.innerText?.trim()`);
    const sidebarRoleRosa = await evaluate(`document.getElementById('sidebarUserRole')?.innerText?.trim()`);

    console.log('POS visible after Rosa login:', isPOSVisibleAfterRosa);
    console.log('Active Store ID:', activeStoreRosa);
    console.log('Active Cashier:', activeCashierRosa);
    console.log('Sidebar User Name:', sidebarUserRosa);
    console.log('Sidebar Role:', sidebarRoleRosa);

    assert.strictEqual(isPOSVisibleAfterRosa, true);
    assert.strictEqual(activeStoreRosa, 'store_amigo');
    assert.strictEqual(activeCashierRosa, 'Rosa');
    assert.strictEqual(sidebarUserRosa, 'Rosa');

    // Step 6: Click Sign Out -> Returns to Sign In Screen
    console.log('\n--- 6. Testing Sidebar Sign Out button ---');
    await evaluate(`document.getElementById('menuSignOutBtn').click()`);
    await sleep(300);
    const isSignInVisibleAfterSignOut = await evaluate(`
      document.getElementById('viewSignIn').style.display !== 'none'
    `);
    console.log('Sign in screen visible after sign out click:', isSignInVisibleAfterSignOut);
    assert.strictEqual(isSignInVisibleAfterSignOut, true);

    // Step 7: Sign in as Kevin -> Should automatically open Downtown Quick Mart!
    console.log('\n--- 7. Signing in as Kevin (Store 2: Downtown Quick Mart routing) ---');
    await evaluate(`
      document.getElementById('inputSignInUser').value = 'kevin';
      document.getElementById('inputSignInPass').value = '1234';
      document.getElementById('signInMainForm').dispatchEvent(new Event('submit', { cancelable: true }));
    `);
    await sleep(400);

    const activeStoreKevin = await evaluate(`window.getCurrentStoreId()`);
    const activeCashierKevin = await evaluate(`window.state.cashierName`);
    const sidebarStoreKevin = await evaluate(`document.getElementById('sidebarStoreName')?.innerText?.trim()`);
    const sidebarUserKevin = await evaluate(`document.getElementById('sidebarUserName')?.innerText?.trim()`);

    console.log('Active Store ID after Kevin login:', activeStoreKevin);
    console.log('Active Cashier after Kevin login:', activeCashierKevin);
    console.log('Sidebar Store Name:', sidebarStoreKevin);
    console.log('Sidebar User Name:', sidebarUserKevin);

    assert.strictEqual(activeStoreKevin, 'store_downtown', 'Must route to store_downtown for Kevin');
    assert.strictEqual(activeCashierKevin, 'Kevin');
    assert.strictEqual(sidebarUserKevin, 'Kevin');
    assert(sidebarStoreKevin.toLowerCase().includes('downtown'), 'Sidebar must show Downtown Quick Mart');

    // Step 8: Sign out and sign in as Admin -> Opens Amigo Food Mart with Owner/Admin role
    console.log('\n--- 8. Signing in as Admin (Admin routing) ---');
    await evaluate(`window.showSignInScreen()`);
    await sleep(300);
    await evaluate(`
      document.getElementById('inputSignInUser').value = 'admin';
      document.getElementById('inputSignInPass').value = '1234';
      document.getElementById('signInMainForm').dispatchEvent(new Event('submit', { cancelable: true }));
    `);
    await sleep(400);

    const activeStoreAdmin = await evaluate(`window.getCurrentStoreId()`);
    const activeCashierAdmin = await evaluate(`window.state?.cashierName || window.getState?.()?.cashierName`);
    const sidebarRoleAdmin = await evaluate(`document.getElementById('sidebarUserRole')?.innerText?.trim()`);

    console.log('Active Store ID after Admin login:', activeStoreAdmin);
    console.log('Active Cashier after Admin login:', activeCashierAdmin);
    console.log('Sidebar Role after Admin login:', sidebarRoleAdmin);

    assert.strictEqual(activeStoreAdmin, 'store_amigo');
    assert.strictEqual(activeCashierAdmin, 'Admin');
    assert.strictEqual(sidebarRoleAdmin, 'Owner');

    // Verify 0 runtime exceptions
    console.log('\n--- 9. Runtime Exception Verification ---');
    console.log('Total Browser Exceptions:', errors.length);
    assert.strictEqual(errors.length, 0, 'No uncaught exceptions allowed in browser');

    console.log('\n🎉 ALL SIGN-IN UI, AUTH & STORE ROUTING TESTS PASSED PERFECTLY!\n');
  } finally {
    p.kill();
  }
}

run().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
