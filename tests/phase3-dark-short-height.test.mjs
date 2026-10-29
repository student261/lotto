import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9778;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('========================================================');
  console.log('   RUNNING PHASE 3 DARK MODE & SHORT HEIGHT TEST SUITE  ');
  console.log('========================================================\n');

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

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1276,556',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2500);
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const cbs = new Map();
    ws.onmessage = e => {
      const d = JSON.parse(e.data);
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

    async function evalInPage(expression) {
      const res = await call('Runtime.evaluate', {
        returnByValue: true,
        expression
      });
      return res.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await sleep(1500);

    // 1. Dark Mode Verification
    console.log('--- Test Group 1: Dark Mode Contrast & Colors ---');
    await evalInPage(`(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('lotto_theme', 'dark');
    })()`);
    await sleep(300);

    const darkRes = await evalInPage(`(() => {
      const sidebar = document.querySelector('.pos-sidebar');
      const brandName = document.querySelector('.pos-sidebar .brand-app-name');
      const boxNumber = document.querySelector('.sell-counter-view .box-card .box-main-number');
      const ticketCount = document.querySelector('.sell-counter-view .box-card .ticket-sold-count');

      const sideBg = sidebar ? window.getComputedStyle(sidebar).backgroundColor : '';
      const brandColor = brandName ? window.getComputedStyle(brandName).color : '';
      const boxColor = boxNumber ? window.getComputedStyle(boxNumber).color : '';
      const ticketColor = ticketCount ? window.getComputedStyle(ticketCount).color : '';

      return { sideBg, brandColor, boxColor, ticketColor };
    })()`);

    // RGB for #161A20 is rgb(22, 26, 32)
    assert(darkRes?.sideBg !== 'rgb(255, 255, 255)', 'Sidebar is NOT forced white in dark mode');
    assert(darkRes?.sideBg === 'rgb(22, 26, 32)', 'Sidebar background matches --surface dark token #161A20');
    // RGB for #EEF1F5 is rgb(238, 241, 245)
    assert(darkRes?.brandColor === 'rgb(238, 241, 245)', 'Brand text has high-contrast light color #EEF1F5 in dark mode');
    assert(darkRes?.boxColor === 'rgb(238, 241, 245)', 'Dispenser box number is light high-contrast #EEF1F5 in dark mode');
    // RGB for #6B97FF is rgb(107, 151, 255)
    assert(darkRes?.ticketColor === 'rgb(107, 151, 255)', 'Ticket sold countdown is bright brand blue #6B97FF in dark mode');

    // 2. Short-Height Rack Unclipped Verification across Viewports
    console.log('\n--- Test Group 2: Short-Height Viewports Rack Unclipped ---');
    const viewports = [
      { w: 1276, h: 556 },
      { w: 1280, h: 540 },
      { w: 1366, h: 600 },
      { w: 1366, h: 768 },
      { w: 1920, h: 1080 }
    ];

    for (const vp of viewports) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: false
      });
      await sleep(250);

      const rackRes = await evalInPage(`(() => {
        const wrapper = document.querySelector('.dispensers-grid-wrapper');
        const grid = document.querySelector('.dispensers-grid');
        const firstCard = document.querySelector('.box-card');

        const wrapperStyle = wrapper ? window.getComputedStyle(wrapper) : {};
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
        const cardRect = firstCard ? firstCard.getBoundingClientRect() : null;

        return {
          maxHeight: wrapperStyle.maxHeight,
          wrapperHeight: wrapperRect ? wrapperRect.height : 0,
          cardHeight: cardRect ? cardRect.height : 0,
          isNotClipped: wrapperRect && wrapperRect.height >= 180
        };
      })()`);

      assert(rackRes?.maxHeight === 'none', `At ${vp.w}x${vp.h}: max-height is 'none' (not fixed 295px/310px)`);
      assert(rackRes?.isNotClipped, `At ${vp.w}x${vp.h}: rack wrapper renders with healthy unclipped height (${Math.round(rackRes?.wrapperHeight)}px)`);
    }

  } finally {
    p.kill();
  }

  console.log('\n========================================================');
  console.log(`   PHASE 3 RESULTS: Passed: ${passed}, Failed: ${failed}   `);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
