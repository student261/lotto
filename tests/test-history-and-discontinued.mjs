import assert from 'assert';
import fs from 'fs';
import { getHistoryScreenData, getDailyReportData } from '../src/historyData.js';

console.log('--- Testing History Screen & Discontinued Reason Chips ---');

// 1. Check getHistoryScreenData with empty shiftHistory
const emptyData = getHistoryScreenData({ shiftHistory: [] });
assert.strictEqual(emptyData.shifts.length, 0, 'No fake shifts when shiftHistory is empty');
assert.strictEqual(emptyData.kpis.totalSales, 0, 'Total sales is $0');
assert.strictEqual(emptyData.kpis.ticketsSold, 0, 'Tickets sold is 0');
assert.strictEqual(emptyData.kpis.closedShiftsCount, 0, 'Closed shifts count is 0');
console.log('✓ PASS: Empty shift history has 0 shifts and $0 totals (no fake shifts)');

// 2. Check getHistoryScreenData with a real closed shift
const realShiftState = {
  shiftHistory: [
    {
      shiftNumber: 1,
      cashier: 'Maulik',
      startedAt: '2026-10-24T08:00:00.000Z',
      endedAt: '2026-10-24T16:00:00.000Z',
      totalTicketsSold: 25,
      totalSalesRevenue: 250.00,
      activationsCount: 1
    }
  ]
};
const realData = getHistoryScreenData(realShiftState);
assert.strictEqual(realData.shifts.length, 1, 'Exactly 1 real shift');
assert.strictEqual(realData.shifts[0].shift, '#1', 'Shift label is #1');
assert.strictEqual(realData.shifts[0].salesperson, 'Maulik', 'Salesperson is Maulik');
assert.strictEqual(realData.shifts[0].tickets, 25, 'Tickets sold is 25');
assert.strictEqual(realData.shifts[0].sales, 250.00, 'Sales revenue is 250.00');
assert.strictEqual(realData.kpis.totalSales, 250.00, 'KPI total sales is 250.00');
assert.strictEqual(realData.kpis.ticketsSold, 25, 'KPI tickets sold is 25');
assert.strictEqual(realData.kpis.closedShiftsCount, 1, 'KPI closed shifts is 1');
console.log('✓ PASS: Real shift data produces exact real metrics without any fake shifts');

// 3. Check HTML chips in index.html
const indexHtml = fs.readFileSync('./index.html', 'utf8');
assert(indexHtml.includes('data-reason="Returned"'), 'Returned reason chip exists in index.html');
assert(indexHtml.includes('data-reason="Damaged"'), 'Damaged reason chip exists in index.html');
assert(indexHtml.includes('data-reason="Discontinued"'), 'Discontinued chip exists in index.html');
console.log('✓ PASS: Discontinued, Returned, and Damaged reason chips exist in index.html');

console.log('\n========================================');
console.log('   ALL HISTORY & CHIP TESTS PASSED!    ');
console.log('========================================');
