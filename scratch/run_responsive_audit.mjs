import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9555;
const SHOT_DIR = "C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\screenshots";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const WIDTHS = [320, 360, 390, 430, 768, 820, 1024, 1180, 1276, 1280, 1366, 1440, 1536, 1680, 1920, 2560, 3440];
const HEIGHTS = [556, 600, 720, 800, 1080];
const ZOOMS = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0];

const SCREENS = [
  { id: 'viewSellCounter', name: 'Dashboard_SellCounter', nav: '#navSellCounter' },
  { id: 'viewInventory', name: 'Inventory', nav: '#navInventory' },
  { id: 'viewReceivePacks', name: 'ReceivePacks', nav: '#btnOpenReceive' },
  { id: 'viewDayReport', name: 'DayReport', nav: '#navDayReport' },
  { id: 'viewHistory', name: 'History_Reports', nav: '#navHistory' },
  { id: 'viewSettings', name: 'Settings', nav: '#navSettings' },
  { id: 'viewCloseShift', name: 'CloseShift_Page', nav: '#btnCloseShiftNav' },
  { id: 'viewSignIn', name: 'SignIn_Screen', action: 'showSignIn' }
];

const MODALS = [
  { id: 'boxAdjustModal', name: 'BoxAdjustModal', trigger: 'openBoxAdjust' },
  { id: 'changeTicketValueModal', name: 'ChangeTicketValueModal', trigger: 'openChangeTicket' },
  { id: 'switchBoxModal', name: 'SwitchBoxModal', trigger: 'openSwitchBox' },
  { id: 'modalShiftReportSheet', name: 'ShiftReportA4Modal', trigger: 'openShiftReport' },
  { id: 'managerApprovalModal', name: 'ManagerApprovalModal', trigger: 'openManagerModal' },
  { id: 'endShiftConfirmModal', name: 'EndShiftConfirmModal', trigger: 'openEndShiftModal' }
];

async function runAudit() {
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

    await call('Page.enable');
    await call('DOM.enable');
    await sleep(1500);

    const auditFindings = [];

    // Helper to evaluate layout metrics
    async function checkLayout(screenName, width, height, theme, zoom = 1.0) {
      const res = await call('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const docW = document.documentElement.clientWidth;
          const scrollW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const hasHScroll = scrollW > winW + 2;

          // Find elements extending outside viewport
          const overflows = [];
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              if (r.right > winW + 5) {
                overflows.push({
                  tag: el.tagName,
                  id: el.id,
                  cls: el.className,
                  right: Math.round(r.right),
                  winW: winW
                });
              }
            }
          });

          // Check scan field visibility
          const scanField = document.getElementById('barcodeInput');
          let scanVisible = false;
          let scanBounding = null;
          if (scanField) {
            const sr = scanField.getBoundingClientRect();
            scanBounding = { top: sr.top, bottom: sr.bottom, left: sr.left, right: sr.right, w: sr.width, h: sr.height };
            scanVisible = sr.width > 0 && sr.height > 0 && window.getComputedStyle(scanField).display !== 'none';
          }

          // Check action buttons visibility
          const endShiftBtn = document.getElementById('btnEndShift');
          let endShiftVisible = endShiftBtn ? (endShiftBtn.getBoundingClientRect().height > 0) : false;

          return {
            docW, scrollW, winW, winH,
            hasHScroll,
            overflowCount: overflows.length,
            sampleOverflows: overflows.slice(0, 5),
            scanVisible,
            endShiftVisible
          };
        })()`
      });
      return res.result?.value;
    }

    // Set theme helper
    async function setTheme(theme) {
      await call('Runtime.evaluate', {
        expression: `(() => {
          document.documentElement.setAttribute('data-theme', '${theme}');
          localStorage.setItem('lotto_theme', '${theme}');
        })()`
      });
      await sleep(200);
    }

    // Capture baseline required screenshots:
    // (b) screenshots in light and dark at 1276x556 and 1920x1080
    console.log('Capturing primary required viewports (1276x556, 1920x1080) for light and dark...');
    const keyPairs = [
      { w: 1276, h: 556, name: '1276x556' },
      { w: 1920, h: 1080, name: '1920x1080' }
    ];

    for (const pair of keyPairs) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: pair.w,
        height: pair.h,
        deviceScaleFactor: 1,
        mobile: false
      });
      for (const theme of ['light', 'dark']) {
        await setTheme(theme);
        for (const screen of SCREENS) {
          // Navigate to screen
          await call('Runtime.evaluate', {
            expression: `(() => {
              if ('${screen.action}' === 'showSignIn') {
                if (typeof window.showSignInScreen === 'function') window.showSignInScreen();
                else document.getElementById('viewSignIn')?.style.setProperty('display', 'block', 'important');
              } else {
                document.querySelector('${screen.nav}')?.click();
              }
            })()`
          });
          await sleep(350);

          const layout = await checkLayout(screen.name, pair.w, pair.h, theme);
          const shot = await call('Page.captureScreenshot', { format: 'png' });
          const fileName = `${screen.name}_${theme}_${pair.name}.png`;
          fs.writeFileSync(path.join(SHOT_DIR, fileName), Buffer.from(shot.result.data, 'base64'));

          auditFindings.push({
            screen: screen.name,
            viewport: pair.name,
            theme,
            layout,
            screenshot: fileName
          });
        }
      }
    }

    // Return to sell counter for matrix sweep
    await call('Runtime.evaluate', {
      expression: `(() => {
        if (typeof window.showSellCounterView === 'function') window.showSellCounterView();
        else document.querySelector('#navSellCounter')?.click();
      })()`
    });

    console.log('Running comprehensive responsive matrix sweep...');
    const matrixResults = [];
    for (const w of WIDTHS) {
      for (const h of [600, 1080]) {
        await call('Emulation.setDeviceMetricsOverride', {
          width: w,
          height: h,
          deviceScaleFactor: 1,
          mobile: w <= 768
        });
        await sleep(150);
        const lgt = await checkLayout('SellCounter', w, h, 'light');
        matrixResults.push({ width: w, height: h, lgt });
      }
    }

    fs.writeFileSync('scratch/matrix_audit_results.json', JSON.stringify({
      keyFindings: auditFindings,
      matrixSweep: matrixResults
    }, null, 2));

    console.log('Responsive audit completed successfully!');
  } finally {
    p.kill();
  }
}

runAudit().catch(console.error);
