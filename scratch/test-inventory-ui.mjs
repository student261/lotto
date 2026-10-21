import { readFileSync } from 'fs';
import { getInventoryScreenData, REFERENCE_IN_STOCK_PACKS } from '../src/inventoryData.js';

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

console.log('=== Testing Inventory UI & Data Integrity (Matching Images 1 & 2) ===');

// Test 1: Data Model
const mockState = { slots: [], inStockInventory: null };
const data = getInventoryScreenData(mockState, 'in_stock');

assert(Array.isArray(data.items), 'data.items is an array');
assert(data.items.length === 4, `data.items has 4 items in stock by default (found ${data.items.length})`);

const row1 = data.items[0];
assert(row1.gameName === '5X Money', `Row 1 game is 5X Money (found ${row1.gameName})`);
assert(row1.gameNumber === 'Game 1417', `Row 1 gameNumber is Game 1417 (found ${row1.gameNumber})`);
assert(row1.packNumber === '0670170', `Row 1 packNumber is 0670170 (found ${row1.packNumber})`);
assert(row1.price === 1, `Row 1 price is $1 (found ${row1.price})`);
assert(row1.packSize === '300 tickets', `Row 1 packSize is 300 tickets (found ${row1.packSize})`);
assert(row1.statusLabel === 'In stock', `Row 1 status is In stock (found ${row1.statusLabel})`);
assert(row1.position === '000', `Row 1 position is 000 (found ${row1.position})`);
assert(row1.receivedDate === 'Oct 17', `Row 1 receivedDate is Oct 17 (found ${row1.receivedDate})`);

const row2 = data.items[1];
assert(row2.gameName === '500X The Money', `Row 2 game is 500X The Money (found ${row2.gameName})`);
assert(row2.packNumber === '1036463', `Row 2 packNumber is 1036463 (found ${row2.packNumber})`);
assert(row2.price === 50, `Row 2 price is $50 (found ${row2.price})`);
assert(row2.packSize === '18 tickets', `Row 2 packSize is 18 tickets (found ${row2.packSize})`);

// Test 2: HTML Structure in index.html
const indexHtml = readFileSync('index.html', 'utf8');

assert(indexHtml.includes('id="viewInventory"'), 'viewInventory exists in index.html');
assert(indexHtml.includes('id="invMainPageTitle"'), 'invMainPageTitle exists in index.html');
assert(indexHtml.includes('id="invBtnToggleUpdateInventory"'), 'invBtnToggleUpdateInventory exists in index.html');
assert(indexHtml.includes('id="invBtnAddNewBook"'), 'invBtnAddNewBook exists in index.html');
assert(indexHtml.includes('id="invUpdateBanner"'), 'invUpdateBanner exists in index.html');
assert(indexHtml.includes('id="invBtnDoneUpdate"'), 'invBtnDoneUpdate exists in index.html');
assert(indexHtml.includes('id="invScanBarcodeInput"'), 'invScanBarcodeInput exists in index.html');
assert(indexHtml.includes('id="invSegmentedTabs"'), 'invSegmentedTabs exists in index.html');
assert(indexHtml.includes('id="invTabInStock"'), 'invTabInStock exists in index.html');
assert(indexHtml.includes('id="invTabActive"'), 'invTabActive exists in index.html');
assert(indexHtml.includes('id="invTabCompleted"'), 'invTabCompleted exists in index.html');
assert(indexHtml.includes('id="invTabRemoved"'), 'invTabRemoved exists in index.html');
assert(indexHtml.includes('id="invTabAll"'), 'invTabAll exists in index.html');
assert(indexHtml.includes('id="invSearchInput"'), 'invSearchInput exists in index.html');
assert(indexHtml.includes('id="invMainTable"'), 'invMainTable exists in index.html');
assert(indexHtml.includes('id="invTableBody"'), 'invTableBody exists in index.html');

// Test 3: Demo chips exist in index.html
assert(indexHtml.includes('1415-560411-000'), 'Demo chip 1415-560411-000 exists');
assert(indexHtml.includes('1409-176233-000'), 'Demo chip 1409-176233-000 exists');
assert(indexHtml.includes('1417-8678178-000'), 'Demo chip 1417-8678178-000 exists');
assert(indexHtml.includes('1888-780128-000'), 'Demo chip 1888-780128-000 exists');

// Test 4: CSS Styles in src/style.css
const styleCss = readFileSync('src/style.css', 'utf8');
assert(styleCss.includes('.inv-header-strip'), '.inv-header-strip defined in style.css');
assert(styleCss.includes('.btn-inv-action-outlined'), '.btn-inv-action-outlined defined in style.css');
assert(styleCss.includes('.btn-inv-action-primary'), '.btn-inv-action-primary defined in style.css');
assert(styleCss.includes('.inv-update-banner'), '.inv-update-banner defined in style.css');
assert(styleCss.includes('.inv-banner-scan-box'), '.inv-banner-scan-box defined in style.css');
assert(styleCss.includes('.inv-demo-chip'), '.inv-demo-chip defined in style.css');
assert(styleCss.includes('.inv-segmented-pills'), '.inv-segmented-pills defined in style.css');
assert(styleCss.includes('.inv-seg-tab'), '.inv-seg-tab defined in style.css');
assert(styleCss.includes('.inv-seg-badge-blue'), '.inv-seg-badge-blue defined in style.css');
assert(styleCss.includes('.inv-modern-table'), '.inv-modern-table defined in style.css');

console.log(`\nInventory UI Tests: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
