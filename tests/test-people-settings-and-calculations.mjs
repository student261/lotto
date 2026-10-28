import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import calculateSlotSoldTickets from data.js or main.js
import { calculateSlotSoldTickets, getInitialState } from '../src/data.js';

describe('Calculation Engine Verification (Zero Sales vs Scanned Top Ticket)', () => {
  it('Should return 0 sold when closing ticket matches starting ticket on countdown pack', () => {
    // 200 pack starting at 199
    const slot200 = {
      boxNumber: 3,
      gameId: '1648',
      gameName: 'EPIC RICHES',
      packNumber: '00001',
      packSize: 200,
      price: 1,
      startTicket: 199,
      currentTicket: 199
    };
    assert.strictEqual(calculateSlotSoldTickets(slot200, 199), 0, 'Same ticket 199 -> 199 must be 0 sold');
  });

  it('Should heal uninitialized startTicket 0 to 0 sold when top ticket 199 is scanned', () => {
    const slotUninit = {
      boxNumber: 3,
      gameId: '1648',
      gameName: 'EPIC RICHES',
      packNumber: '00001',
      packSize: 200,
      price: 1,
      startTicket: 0,
      currentTicket: 0
    };
    // Cashier scans top ticket 199 at end shift
    assert.strictEqual(calculateSlotSoldTickets(slotUninit, 199), 0, 'startTicket 0 vs top ticket 199 must heal to 0 sold');
  });

  it('Should correctly count sold tickets when tickets are actually sold on countdown pack', () => {
    const slotCountdown = {
      boxNumber: 3,
      gameId: '1648',
      packSize: 200,
      startTicket: 199,
      currentTicket: 199
    };
    // Scanned 195 at end shift -> 199 - 195 = 4 tickets sold
    assert.strictEqual(calculateSlotSoldTickets(slotCountdown, 195), 4, '199 down to 195 must be 4 sold');
  });

  it('Should correctly count Box 2 starting at 9 and scanned at 9 as 0 sold', () => {
    const slotBox2 = {
      boxNumber: 2,
      gameId: '1500',
      packSize: 300,
      startTicket: 9,
      currentTicket: 9
    };
    assert.strictEqual(calculateSlotSoldTickets(slotBox2, 9), 0, '9 -> 9 must be 0 sold');
  });

  it('Should correctly count Box 6 starting at 4 and scanned at 4 as 0 sold', () => {
    const slotBox6 = {
      boxNumber: 6,
      gameId: '1520',
      packSize: 150,
      startTicket: 4,
      currentTicket: 4
    };
    assert.strictEqual(calculateSlotSoldTickets(slotBox6, 4), 0, '4 -> 4 must be 0 sold');
  });
});

describe('Settings People Table and Dialogs HTML Verification', () => {
  it('Should have correct dialogs and buttons in index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');
    assert.ok(html.includes('id="settingsResetPinModal"'), 'settingsResetPinModal dialog must exist');
    assert.ok(html.includes('id="settingsAddPersonModal"'), 'settingsAddPersonModal dialog must exist');
    assert.ok(html.includes('id="saveSettingsResetPinBtn"'), 'saveSettingsResetPinBtn button must exist');
    assert.ok(html.includes('id="btnSettingsAddPerson"'), 'btnSettingsAddPerson button must exist');
    assert.ok(html.includes('id="settingsPeopleNewTableBody"'), 'settingsPeopleNewTableBody table must exist');
  });

  it('Should render People modern table correctly from state', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf-8');
    assert.ok(mainJs.includes('btn-person-reset-pin'), 'renderSettingsPeopleModern must include Change PIN button');
    assert.ok(mainJs.includes('btn-person-remove'), 'renderSettingsPeopleModern must include Remove button');
    assert.ok(mainJs.includes('toggle-person-active'), 'renderSettingsPeopleModern must include active toggle switch');
  });
});
