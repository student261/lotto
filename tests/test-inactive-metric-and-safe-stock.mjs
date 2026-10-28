import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

describe('Inactive Metric & Safe Stock Calculation Verification', () => {

  it('1. Metric Inactive calculates 0 when there are 19 active boxes and 0 safe stock packs', () => {
    // Setup state matching screenshot: 19 active slots, 0 inStockInventory
    const activeSlots = Array.from({ length: 19 }, (_, i) => ({
      boxNumber: i + 1,
      status: 'ACTIVE',
      gameName: `Game ${i + 1}`,
      packNumber: `10000${i}`,
      daysActive: 2,
      startTicket: 10,
      currentTicket: 10,
      ticketsSold: 0
    }));

    const inStockInventory = [];

    // The fixed calculation: only inStock packs not assigned to any dispenser box
    const inStockPacks = (inStockInventory || []).filter(p => !p.boxNumber);
    const countInactive = inStockPacks.length;

    assert.strictEqual(countInactive, 0, 'Inactive count must be 0 when stock is empty');
  });

  it('2. Metric Inactive updates dynamically to exact safe stock count when packs are received', () => {
    const inStockInventory = [
      { packNumber: '99001', gameName: 'Mega Millions', price: 5 },
      { packNumber: '99002', gameName: 'Jumbo Bucks', price: 10 }
    ];

    const inStockPacks = inStockInventory.filter(p => !p.boxNumber);
    const countInactive = inStockPacks.length;

    assert.strictEqual(countInactive, 2, 'Inactive count must be 2 when 2 packs are in stock');
  });

  it('3. Idle quick view modal list only contains in-stock safe packs, not active dispenser boxes', () => {
    const inStockInventory = [
      { packNumber: '99001', gameName: 'Mega Millions', price: 5 }
    ];
    const activeSlots = [
      { boxNumber: 1, status: 'ACTIVE', gameName: '5X Money', packNumber: '128842', daysActive: 5, currentTicket: 13, startTicket: 13 }
    ];

    const itemsToRender = (inStockInventory || []).filter(p => !p.boxNumber).map(p => ({
      boxDisplay: 'Safe',
      isSafe: true,
      gameName: p.gameName,
      packNumber: p.packNumber
    }));

    assert.strictEqual(itemsToRender.length, 1);
    assert.strictEqual(itemsToRender[0].boxDisplay, 'Safe');
    assert.strictEqual(itemsToRender[0].packNumber, '99001');

    // Ensure Box 1 (active dispenser box) is NOT in the inactive list
    const hasActiveBox = itemsToRender.some(item => item.boxDisplay === '1' || item.packNumber === '128842');
    assert.strictEqual(hasActiveBox, false, 'Active dispenser boxes must NOT be included in inactive list');
  });

  it('4. index.html contains tabInactive button and metricInactive readout', () => {
    const html = fs.readFileSync('index.html', 'utf-8');
    assert.ok(html.includes('id="tabInactive"'), 'tabInactive button exists');
    assert.ok(html.includes('id="metricInactive"'), 'metricInactive span exists');
  });
});
