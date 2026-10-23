import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9796;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1920,1080',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2500);
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = targets.find(t => t.type === 'page' && t.url.includes('5173'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let id = 1;
    const cbs = new Map();
    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.id && cbs.has(d.id)) {
        cbs.get(d.id)(d);
        cbs.delete(d.id);
      }
    };
    function send(method, params = {}) {
      const curId = id++;
      return new Promise(resolve => {
        cbs.set(curId, resolve);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await send('Page.enable');
    await send('DOM.enable');

    console.log('\n--- 1. Testing Sidebar Matching Image 3 ---');
    const sidebarEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const brandName = document.querySelector('.brand-app-name');
        const badge = document.querySelector('.brand-badge-icon');
        const collapse = document.querySelector('.sidebar-collapse-btn');
        const activeNav = document.querySelector('.sidebar-nav-item.active');
        const badgeSvg = badge?.querySelector('svg')?.innerHTML || '';
        const collapseSvg = collapse?.querySelector('svg')?.innerHTML || '';

        return JSON.stringify({
          brandColor: window.getComputedStyle(brandName).color,
          brandWeight: window.getComputedStyle(brandName).fontWeight,
          badgeBg: window.getComputedStyle(badge).backgroundColor,
          badgeHasTicketSvg: badgeSvg.includes('M2 9a3 3 0 0 1 0 6v2'),
          collapseHasChevronSvg: collapseSvg.includes('m16 15-3-3 3-3'),
          collapseBorder: window.getComputedStyle(collapse).border,
          collapseBg: window.getComputedStyle(collapse).backgroundColor,
          activeNavBg: window.getComputedStyle(activeNav).backgroundColor,
          activeNavColor: window.getComputedStyle(activeNav).color
        });
      })()`
    });
    const sVal = JSON.parse(sidebarEval.result.result.value || sidebarEval.result.value);
    console.log('Sidebar properties:', sVal);
    assert(sVal.badgeHasTicketSvg, 'Badge must contain ticket SVG');
    assert(sVal.collapseHasChevronSvg, 'Collapse button must contain chevron SVG');
    assert(sVal.brandColor === 'rgb(29, 78, 216)', 'Brand text must be blue #1D4ED8');
    assert(sVal.brandWeight === '800', 'Brand text must be weight 800');
    console.log('✓ PASS: Sidebar brand header & navigation verified!');

    // Screenshot sidebar
    const snapSidebar = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/Admin/.gemini/antigravity-ide/brain/e5d66af5-2b32-406b-b7b2-c5318eae9544/screenshots/fixed_sidebar.png', Buffer.from(snapSidebar.result.data, 'base64'));

    console.log('\n--- 2. Testing Inventory Full Width & Spacing (Image 1 Fix) ---');
    await send('Runtime.evaluate', {
      expression: `document.querySelector('#navInventory')?.click();`
    });
    await sleep(400);

    // Switch to active tab to see box pills
    await send('Runtime.evaluate', {
      expression: `document.querySelector('#invTabActive')?.click();`
    });
    await sleep(400);

    const invEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const view = document.getElementById('viewInventory');
        const main = document.querySelector('.pos-main-container');
        const cs = window.getComputedStyle(view);
        const rect = view.getBoundingClientRect();
        const mainClientW = main.clientWidth;
        const cardW = document.querySelector('.inv-table-card').getBoundingClientRect().width;
        const boxBadge = document.querySelector('.boxn');

        return JSON.stringify({
          viewWidth: rect.width,
          mainClientWidth: mainClientW,
          cardWidth: cardW,
          maxWidth: cs.maxWidth,
          padding: cs.padding,
          margin: cs.margin,
          hasBoxBadge: !!boxBadge,
          boxBadgeFont: boxBadge ? window.getComputedStyle(boxBadge).fontFamily : null
        });
      })()`
    });
    const iVal = JSON.parse(invEval.result.result.value || invEval.result.value);
    console.log('Inventory properties:', iVal);
    assert(iVal.maxWidth === 'none', 'Inventory maxWidth must be none');
    assert(Math.abs(iVal.viewWidth - iVal.mainClientWidth) <= 2, 'Inventory must span full container client width');
    assert(iVal.cardWidth > 1500, `Inventory table card must stretch wide (>1500px, got ${iVal.cardWidth}px)`);
    assert(iVal.hasBoxBadge, 'Active tab must have box badges');
    console.log('✓ PASS: Inventory full-width spacing & table styling verified!');

    const snapInv = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/Admin/.gemini/antigravity-ide/brain/e5d66af5-2b32-406b-b7b2-c5318eae9544/screenshots/fixed_inventory_fullwidth.png', Buffer.from(snapInv.result.data, 'base64'));

    console.log('\n--- 3. Testing Reports / History Full Width & Spacing (Image 2 Fix) ---');
    await send('Runtime.evaluate', {
      expression: `document.querySelector('#navHistory')?.click();`
    });
    await sleep(400);

    const repEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const view = document.getElementById('viewHistory');
        const main = document.querySelector('.pos-main-container');
        const cs = window.getComputedStyle(view);
        const rect = view.getBoundingClientRect();
        const mainClientW = main.clientWidth;
        const cardW = document.querySelector('.rpt-table-card-clean').getBoundingClientRect().width;

        return JSON.stringify({
          viewWidth: rect.width,
          mainClientWidth: mainClientW,
          cardWidth: cardW,
          maxWidth: cs.maxWidth,
          padding: cs.padding,
          margin: cs.margin
        });
      })()`
    });
    const rVal = JSON.parse(repEval.result.result.value || repEval.result.value);
    console.log('Reports properties:', rVal);
    assert(rVal.maxWidth === 'none', 'Reports maxWidth must be none');
    assert(Math.abs(rVal.viewWidth - rVal.mainClientWidth) <= 2, 'Reports must span full container client width');
    assert(rVal.cardWidth > 1500, `Reports table card must stretch wide (>1500px, got ${rVal.cardWidth}px)`);
    console.log('✓ PASS: Reports full-width spacing & table styling verified!');

    const snapRep = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/Admin/.gemini/antigravity-ide/brain/e5d66af5-2b32-406b-b7b2-c5318eae9544/screenshots/fixed_reports_fullwidth.png', Buffer.from(snapRep.result.data, 'base64'));

    console.log('\n--- 4. Testing Dark Mode Sidebar & Views ---');
    await send('Runtime.evaluate', {
      expression: `document.body.setAttribute('data-theme', 'dark');`
    });
    await sleep(300);

    const darkEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const brandName = document.querySelector('.brand-app-name');
        const sidebar = document.querySelector('.pos-sidebar');
        return JSON.stringify({
          brandColor: window.getComputedStyle(brandName).color,
          sidebarBg: window.getComputedStyle(sidebar).backgroundColor
        });
      })()`
    });
    const dVal = JSON.parse(darkEval.result.result.value || darkEval.result.value);
    console.log('Dark mode properties:', dVal);
    assert(dVal.brandColor === 'rgb(238, 241, 245)', 'Dark mode brand name should be #EEF1F5 for contrast per Phase 3 test');
    console.log('✓ PASS: Dark mode verified!');

    const snapDark = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/Admin/.gemini/antigravity-ide/brain/e5d66af5-2b32-406b-b7b2-c5318eae9544/screenshots/fixed_dark_reports.png', Buffer.from(snapDark.result.data, 'base64'));

    ws.close();
  } finally {
    p.kill();
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
