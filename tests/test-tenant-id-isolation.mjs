import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock localStorage and sessionStorage for pure Node testing
const localStoreMap = new Map();
const sessionStoreMap = new Map();

global.localStorage = {
  getItem: (k) => localStoreMap.has(k) ? localStoreMap.get(k) : null,
  setItem: (k, v) => localStoreMap.set(k, String(v)),
  removeItem: (k) => localStoreMap.delete(k),
  clear: () => localStoreMap.clear()
};

global.sessionStorage = {
  getItem: (k) => sessionStoreMap.has(k) ? sessionStoreMap.get(k) : null,
  setItem: (k, v) => sessionStoreMap.set(k, String(v)),
  removeItem: (k) => sessionStoreMap.delete(k),
  clear: () => sessionStoreMap.clear()
};

global.window = {
  localStorage: global.localStorage,
  sessionStorage: global.sessionStorage,
  location: { search: '' }
};

import { 
  getInitialState, 
  getCleanEmptyState, 
  loadState, 
  saveState, 
  resetToCleanState, 
  getCurrentStoreId, 
  setCurrentStoreId, 
  getStoreStorageKey 
} from '../src/data.js';

import { 
  getRegisteredUsers, 
  saveRegisteredUsers, 
  registerNewUser, 
  findUserByCredentials, 
  lookupUserAssignedStore 
} from '../src/clerksData.js';

describe('Multi-Tenant Account & ID Data Isolation', () => {

  it('1. Amigo primary user is registered with store_amigo', () => {
    const authRes = findUserByCredentials('amigo', '1234');
    assert.strictEqual(authRes.success, true);
    assert.strictEqual(authRes.user.storeId, 'store_amigo');

    const users = getRegisteredUsers();
    const amigoUser = users.find(u => u.signInName === 'amigo');
    assert.ok(amigoUser, 'amigo user must exist in registered users');
    assert.strictEqual(amigoUser.storeId, 'store_amigo', 'amigo user storeId must be store_amigo');
    assert.strictEqual(amigoUser.storeName, 'Amigo Food Mart', 'amigo storeName must be Amigo Food Mart');
  });

  it('2. Amigo store loads initial reference boxes and saves to lotto_track_pos_data_v3', () => {
    setCurrentStoreId('store_amigo');
    const amigoState = loadState('store_amigo');
    assert.strictEqual(amigoState.storeName, 'AMIGO FOOD MART');
    const activeBoxes = (amigoState.slots || []).filter(s => s.status === 'ACTIVE');
    assert.strictEqual(activeBoxes.length, 19, 'Amigo must have 19 active dispenser boxes');

    // Make an edit in Amigo's store (e.g. Box 1 has 5 tickets sold)
    amigoState.slots[0].ticketsSold = 5;
    saveState(amigoState, 'store_amigo');

    // Storage key check
    const rawAmigo = localStorage.getItem('lotto_track_pos_data_v3');
    assert.ok(rawAmigo, 'lotto_track_pos_data_v3 must exist');
    const parsedAmigo = JSON.parse(rawAmigo);
    assert.strictEqual(parsedAmigo.slots[0].ticketsSold, 5);
  });

  it('3. Registering a different ID creates a distinct store and does NOT show Amigo data', () => {
    // New user "alex" registers
    const alexAuth = findUserByCredentials('alex', 'alexPass123');
    assert.strictEqual(alexAuth.success, true);
    assert.strictEqual(alexAuth.user.signInName, 'alex');
    assert.strictEqual(alexAuth.user.storeId, 'store_alex', 'New user must get store_alex');
    assert.strictEqual(alexAuth.user.storeName, 'Alex Store');

    // Lookup store for alex
    const alexAssigned = lookupUserAssignedStore('alex');
    assert.strictEqual(alexAssigned.storeId, 'store_alex');
    assert.strictEqual(alexAssigned.storeName, 'Alex Store');

    // Load state for store_alex
    setCurrentStoreId('store_alex');
    const alexState = loadState('store_alex');
    assert.strictEqual(alexState.storeId, 'store_alex');

    // Verify Alex sees 0 active boxes (clean dispenser), NOT Amigo's 19 boxes!
    const alexActiveBoxes = (alexState.slots || []).filter(s => s.status === 'ACTIVE');
    assert.strictEqual(alexActiveBoxes.length, 0, 'Alex must see 0 active boxes, NOT Amigo boxes!');
    assert.notStrictEqual(alexState.storeName, 'AMIGO FOOD MART');

    // Verify Amigo's data in lotto_track_pos_data_v3 was NOT changed or overwritten
    const rawAmigo = localStorage.getItem('lotto_track_pos_data_v3');
    const parsedAmigo = JSON.parse(rawAmigo);
    assert.strictEqual(parsedAmigo.slots[0].ticketsSold, 5, 'Amigo data must remain untouched!');
  });

  it('4. Clearing data in a different ID does NOT delete or wipe Amigo data', () => {
    setCurrentStoreId('store_alex');
    const alexState = loadState('store_alex');
    
    // Alex clears their data
    resetToCleanState(alexState);

    // Verify Alex's store is cleared
    const alexRaw = localStorage.getItem('lotto_track_pos_data_v3_store_alex');
    assert.ok(alexRaw, 'Alex store file must exist');

    // CRITICAL: Amigo's lotto_track_pos_data_v3 must NOT be deleted or wiped!
    const rawAmigo = localStorage.getItem('lotto_track_pos_data_v3');
    assert.ok(rawAmigo, 'Amigo data must still exist');
    const parsedAmigo = JSON.parse(rawAmigo);
    assert.strictEqual(parsedAmigo.slots[0].ticketsSold, 5, 'Amigo data was not deleted!');
    const amigoActive = parsedAmigo.slots.filter(s => s.status === 'ACTIVE');
    assert.strictEqual(amigoActive.length, 19, 'Amigo still has all 19 active boxes!');
  });

  it('5. Logging back into Amigo loads all original data with 0 changes or deletions', () => {
    // Authenticate as amigo
    const authRes = findUserByCredentials('amigo', '1234');
    assert.strictEqual(authRes.success, true);
    assert.strictEqual(authRes.user.storeId, 'store_amigo');

    // Switch store back to store_amigo
    setCurrentStoreId('store_amigo');
    const restoredAmigoState = loadState('store_amigo');
    assert.strictEqual(restoredAmigoState.storeName, 'AMIGO FOOD MART');
    assert.strictEqual(restoredAmigoState.slots[0].ticketsSold, 5);
    const active = restoredAmigoState.slots.filter(s => s.status === 'ACTIVE');
    assert.strictEqual(active.length, 19, 'All 19 active boxes restored intact!');
  });

  it('6. Registering multiple different IDs keeps every store completely isolated', () => {
    const userIds = ['mart_one', 'david', 'express_lotto', 'station99'];
    for (const uid of userIds) {
      const auth = findUserByCredentials(uid, 'pass_' + uid);
      assert.strictEqual(auth.success, true);
      assert.strictEqual(auth.user.storeId, `store_${uid}`);
      
      const st = loadState(`store_${uid}`);
      const active = (st.slots || []).filter(s => s.status === 'ACTIVE');
      assert.strictEqual(active.length, 0, `Store ${uid} must not have Amigo boxes`);
    }

    // Amigo still has 19 boxes
    const amigoState = loadState('store_amigo');
    const active = amigoState.slots.filter(s => s.status === 'ACTIVE');
    assert.strictEqual(active.length, 19, 'Amigo boxes still 100% intact');
  });
});
