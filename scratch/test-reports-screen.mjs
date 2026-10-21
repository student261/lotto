import { spawn } from 'child_process';
import fs from 'fs';
import assert from 'assert';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9245;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Testing Reports Screen Redesign (Matching Reference UI) ===');

  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
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

    async function evaluate(expression) {
      const resp = await call('Runtime.evaluate', { expression, returnByValue: true });
      return resp.result?.result?.value;
    }

    await call('Page.enable');
    await call('DOM.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Click on Reports (#navHistory) in Sidebar
    console.log('--- Clicking #navHistory in Sidebar ---');
    await evaluate(`document.getElementById('navHistory')?.click()`);
    await sleep(600);

    const reportsState = await evaluate(`(() => {
      const view = document.getElementById('viewHistory');
      const title = document.querySelector('#viewHistory .page-main-title')?.textContent.trim();
      const subtitle = document.querySelector('#viewHistory .page-subtitle')?.textContent.trim();
      const switchShift = document.getElementById('btnSwitchShiftReports');
      const switchDaily = document.getElementById('btnSwitchDailyReport');
      const rows = document.querySelectorAll('#histTableBody tr');
      const rowData = Array.from(rows).map(tr => {
        const tds = tr.querySelectorAll('td');
        return {
          shift: tds[0]?.textContent.trim(),
          date: tds[1]?.textContent.trim(),
          person: tds[2]?.textContent.trim(),
          started: tds[3]?.textContent.trim(),
          closed: tds[4]?.textContent.trim(),
          tickets: tds[5]?.textContent.trim(),
          sales: tds[6]?.textContent.trim(),
          email: tds[7]?.textContent.trim(),
          btn: tds[8]?.querySelector('button')?.textContent.trim()
        };
      });

      return {
        viewDisplay: window.getComputedStyle(view).display,
        title,
        subtitle,
        shiftActive: switchShift?.classList.contains('active'),
        dailyActive: switchDaily?.classList.contains('active'),
        rowCount: rows.length,
        firstRow: rowData[0],
        rowData
      };
    })()`);

    console.log('Reports State:', JSON.stringify(reportsState, null, 2));

    assert(reportsState.viewDisplay === 'block', 'Reports view is visible');
    assert(reportsState.title === 'Reports', 'Page title is Reports');
    assert(reportsState.subtitle === 'Saved shift reports and the daily total', 'Page subtitle matches reference');
    assert(reportsState.shiftActive === true, 'Shift reports switcher pill is active');
    assert(reportsState.rowCount >= 8, 'Table has at least 8 shift rows');

    // Capture screenshot
    const snap = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/reports-screen.png', Buffer.from(snap.result.data, 'base64'));
    console.log('Saved scratch/reports-screen.png');

    console.log('🎉 REPORTS SCREEN TEST PASSED 100%!');

    ws.close();
  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  } finally {
    p.kill();
  }
}

run();
