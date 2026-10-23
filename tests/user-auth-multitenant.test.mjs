// ============================================================================
// Multi-Tenant User Authentication & Store Isolation Verification Suite
// ============================================================================

import { strict as assert } from 'assert';
import fs from 'fs';
import {
  registerNewUser,
  authenticateOrRegisterUser,
  getRegisteredUsers,
  saveRegisteredUsers,
  findUserByCredentials,
  lookupUserAssignedStore
} from '../src/clerksData.js';
import {
  getStoreStorageKey,
  getStoresList,
  saveStoresList,
  getCleanEmptyState
} from '../src/data.js';

// Setup mock localStorage and sessionStorage for Node.js
const mockLocalStorageData = {};
const mockSessionStorageData = {};

global.localStorage = {
  getItem: (key) => mockLocalStorageData[key] || null,
  setItem: (key, val) => { mockLocalStorageData[key] = String(val); },
  removeItem: (key) => { delete mockLocalStorageData[key]; },
  clear: () => { for (const k of Object.keys(mockLocalStorageData)) delete mockLocalStorageData[k]; }
};

global.sessionStorage = {
  getItem: (key) => mockSessionStorageData[key] || null,
  setItem: (key, val) => { mockSessionStorageData[key] = String(val); },
  removeItem: (key) => { delete mockSessionStorageData[key]; },
  clear: () => { for (const k of Object.keys(mockSessionStorageData)) delete mockSessionStorageData[k]; }
};

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('  RUNNING USER AUTH & MULTI-TENANT DATABASE TESTS  ');
console.log('====================================================\n');

console.log('--- Test Group 1: New User Auto-Registration ---');

runTest('Auto-registers new user "amigo" with password "ax123"', () => {
  const res = authenticateOrRegisterUser('amigo', 'ax123');
  assert.equal(res.success, true, 'Registration succeeded');
  assert.equal(res.isNew, true, 'User was marked as new');
  assert.equal(res.user.signInName, 'amigo', 'Correct sign-in name');
  assert.equal(res.user.storeId, 'store_amigo', 'Assigned store_amigo');
  assert.equal(res.user.storeName, 'Amigo Food Mart', 'Assigned Amigo Food Mart');

  const registered = getRegisteredUsers();
  assert(registered.some(u => u.signInName === 'amigo'), 'User is persisted in database');
});

runTest('Rejects "amigo" with wrong password', () => {
  const res = authenticateOrRegisterUser('amigo', 'wrong_pass');
  assert.equal(res.success, false, 'Authentication failed on wrong password');
  assert.equal(res.reason, 'INVALID_PASSWORD', 'Reason is INVALID_PASSWORD');
});

runTest('Re-authenticates "amigo" with correct password "ax123"', () => {
  const res = authenticateOrRegisterUser('amigo', 'ax123');
  assert.equal(res.success, true, 'Authentication succeeded');
  assert.equal(res.isNew, false, 'User is recognized as existing');
  assert.equal(res.user.signInName, 'amigo');
  assert.equal(res.user.storeId, 'store_amigo');
});

console.log('\n--- Test Group 2: Second User Registration & Multi-Tenant Data Isolation ---');

runTest('Auto-registers second tenant "downtown_owner" with password "dt_pass_99"', () => {
  const res = authenticateOrRegisterUser('downtown_owner', 'dt_pass_99');
  assert.equal(res.success, true);
  assert.equal(res.isNew, true);
  assert.equal(res.user.signInName, 'downtown_owner');
  assert.equal(res.user.storeId, 'store_downtown_owner');

  const registered = getRegisteredUsers();
  assert.equal(registered.filter(u => u.signInName === 'amigo').length, 1);
  assert.equal(registered.filter(u => u.signInName === 'downtown_owner').length, 1);
});

runTest('Stores list includes both stores with isolation', () => {
  const stores = getStoresList();
  assert(stores.some(s => s.id === 'store_amigo'), 'Contains store_amigo');
  assert(stores.some(s => s.id === 'store_downtown_owner'), 'Contains store_downtown_owner');
});

runTest('Storage keys are strictly isolated per tenant', () => {
  const amigoKey = getStoreStorageKey('store_amigo');
  const downtownKey = getStoreStorageKey('store_downtown_owner');
  assert.notEqual(amigoKey, downtownKey, 'Keys must be different');
  assert.equal(amigoKey, 'lotto_track_pos_data_v3');
  assert.equal(downtownKey, 'lotto_track_pos_data_v3_store_downtown_owner');
});

console.log('\n--- Test Group 3: UI & Settings Cleanliness (Removed Marked Store Select) ---');

runTest('Settings pane in index.html does NOT contain current store select or + Add Store button', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert(!html.includes('id="settingsStoreSelect"'), 'Removed settingsStoreSelect');
  assert(!html.includes('id="btnAddStore"'), 'Removed btnAddStore');
  assert(!html.includes('Switch between stores or create a new store'), 'Removed store switch caption');
  assert(html.includes('id="setStoreName"'), 'Store name input is preserved');
  assert(html.includes('id="setTimeZone"'), 'Time zone select is preserved');
});

runTest('Sign-in form placeholder and hints are updated', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert(!html.includes('value="rosa"'), 'Removed default value="rosa"');
  assert(html.includes('placeholder="e.g. amigo or admin"'), 'Added friendly placeholder');
  assert(html.includes('New user? Enter your sign-in name'), 'Added new user registration hint');
});

console.log('\n--- Test Group 4: Case Insensitive Username Login ---');

runTest('User "AMIGO" with password "ax123" resolves to "amigo"', () => {
  const res = authenticateOrRegisterUser('AMIGO', 'ax123');
  assert.equal(res.success, true);
  assert.equal(res.user.signInName, 'amigo');
  assert.equal(res.user.storeId, 'store_amigo');
});

console.log('\n====================================================');
console.log(`   TEST RESULTS: Passed: ${passed}, Failed: ${failed}`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ ALL USER AUTH & MULTI-TENANT TESTS PASSED PERFECTLY!');
}
