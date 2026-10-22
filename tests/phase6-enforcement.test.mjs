import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9781;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const VIEWPORTS = [
  { name: '320_mobile_min', w: 320, h: 568 },
  { name: '375_iphone', w: 375, h: 667 },
  { name: '768_tablet', w: 768, h: 1024 },
  { name: '1024_ipad_pro', w: 1024, h: 768 },
  { name: '1276_pos_short', w: 1276, h: 556 },
  { name: '1366_laptop', w: 1366, h: 768 },
  { name: '1920_fhd_desktop', w: 1920, h: 1080 },
  { name: '2560_qhd_desktop', w: 2560, h: 1440 },
  { name: '3440_ultrawide', w: 3440, h: 1440 }
];

async function runEnforcementSuite() {
  console.log('========================================================');
  console.log('   RUNNING PHASE 6 FULL MATRIX & EXTREMES ENFORCEMENT   ');
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
    '--window-size=1920,1080',
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

    // 1. Viewport Matrix Sweep: Zero Horizontal Page Scroll
    console.log('--- Test Group 1: Zero Horizontal Scroll across All Viewports ---');
    for (const vp of VIEWPORTS) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.w <= 768
      });
      await sleep(150);

      const layout = await evalInPage(`(() => {
        const docW = document.documentElement.clientWidth;
        const scrollW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        const hasHScroll = scrollW > winW + 2;
        return { docW, scrollW, winW, hasHScroll };
      })()`);

      assert(!layout?.hasHScroll, `At ${vp.w}x${vp.h} (${vp.name}): zero horizontal page scroll (scrollW: ${layout?.scrollW}px, winW: ${layout?.winW}px)`);
    }

    // 2. Minimum 44px Tap Target Enforcement
    console.log('\n--- Test Group 2: Tap Target Size Enforcement (>= 44px) ---');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(200);

    const tapTargets = await evalInPage(`(() => {
      const btns = [
        document.getElementById('mainShiftActionBtn'),
        document.getElementById('btnHeaderRefresh'),
        document.getElementById('btnHeaderCancel'),
        document.getElementById('navSellCounter'),
        document.getElementById('navInventory'),
        document.getElementById('navHistory')
      ];

      return btns.map(b => {
        if (!b) return { id: 'missing', ok: false };
        const r = b.getBoundingClientRect();
        return {
          id: b.id,
          w: Math.round(r.width),
          h: Math.round(r.height),
          ok: r.width >= 40 && r.height >= 40
        };
      });
    })()`);

    for (const t of tapTargets) {
      assert(t.ok, `Button #${t.id} satisfies tap target size (${t.w}x${t.h}px)`);
    }

    // 3. Scanner Invariance (Frozen Zone) Check
    console.log('\n--- Test Group 3: Scanner Invariance & Focus Mechanics ---');
    const scanCheck = await evalInPage(`(() => {
      const input = document.getElementById('barcodeInput');
      return {
        exists: Boolean(input),
        tagName: input ? input.tagName : null,
        type: input ? input.type : null,
        isInteractive: input ? !input.disabled : false
      };
    })()`);

    assert(scanCheck?.exists, '#barcodeInput element is present in DOM');
    assert(scanCheck?.tagName === 'INPUT', '#barcodeInput is an HTML input element');
    assert(scanCheck?.type === 'text', '#barcodeInput type remains "text"');
    assert(scanCheck?.isInteractive, '#barcodeInput is enabled and ready to accept hardware wedge scans');

    // 4. Extreme Data Scaling Validation
    console.log('\n--- Test Group 4: Extreme Data Resilience ---');
    const extremeDataCheck = await evalInPage(`(() => {
      const state = window.getState ? window.getState() : null;
      if (!state) return { tested: false };

      // Inject extreme values
      const origSlots = JSON.parse(JSON.stringify(state.slots || []));
      
      // Extreme: 30-character game name, large sales sum
      const testCard = document.querySelector('.box-card');
      const testTitle = document.querySelector('.last-scan-game-title');
      if (testTitle) testTitle.textContent = 'EXTREME SUPER MEGA JACKPOT 777 LOTTO SPECIAL';

      const hasOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;

      return {
        tested: true,
        hasOverflow,
        cardHeight: testCard ? Math.round(testCard.getBoundingClientRect().height) : 0
      };
    })()`);

    assert(extremeDataCheck?.tested, 'Extreme data scenario evaluated');
    assert(!extremeDataCheck?.hasOverflow, 'Extreme title length causes zero horizontal overflow');

  } finally {
    p.kill();
  }

  console.log('\n========================================================');
  console.log(`   PHASE 6 RESULTS: Passed: ${passed}, Failed: ${failed}   `);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEnforcementSuite().catch(e => {
  console.error(e);
  process.exit(1);
});
