import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9278;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const p = spawn(CHROME, [
    '--remote-debugging-port=' + PORT,
    '--headless=new',
    '--disable-gpu',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2000);
    const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('No page found');

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

    const call = (method, params = {}) => new Promise(res => {
      const i = id++;
      cbs.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

    await call('Page.enable');
    await call('DOM.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    const evaluate = expr => call('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result?.result?.value);

    // Navigate to Reports screen
    await evaluate(`document.getElementById('navHistory').click();`);
    await sleep(400);

    // Open Shift Report for Shift #6
    await evaluate(`document.querySelector('#histTableBody tr:last-child .btn-rpt-view').click();`);
    await sleep(400);

    // Click Print button on modal
    await evaluate(`
      window.__printCalled = false;
      window.print = function() {
        window.__printCalled = true;
      };
    `);

    await evaluate(`document.getElementById('btnModalShiftRepPrint').click();`);
    await sleep(100);

    const check = await evaluate(`(() => {
      const isShiftReportClass = document.body.classList.contains('print-shift-report');
      const receiptEl = document.getElementById('printReceiptSection');
      const sheetEl = document.getElementById('modalShiftReportSheet');
      const modalEl = document.getElementById('modalShiftReportViewer');

      return {
        printCalled: window.__printCalled,
        isShiftReportClass,
        receiptDisplay: window.getComputedStyle(receiptEl).display,
        sheetDisplay: window.getComputedStyle(sheetEl).display,
        modalOpen: modalEl.hasAttribute('open')
      };
    })()`);
    console.log('DOM & Class check on Print click:', check);

    // Now test Emulation.setEmulatedMedia({ media: 'print' })
    await call('Emulation.setEmulatedMedia', { media: 'print' });
    await evaluate(`document.body.classList.add('print-shift-report');`);
    await sleep(200);

    const printStyles = await evaluate(`(() => {
      const receiptEl = document.getElementById('printReceiptSection');
      const sheetEl = document.getElementById('modalShiftReportSheet');
      const modalHeader = document.querySelector('.modal-shift-rep-header');
      const tableRows = document.querySelectorAll('#modalRepDocTableBody tr');

      const receiptComp = window.getComputedStyle(receiptEl);
      const sheetComp = window.getComputedStyle(sheetEl);
      const headerComp = window.getComputedStyle(modalHeader);

      return {
        receiptHiddenInPrint: receiptComp.display === 'none',
        receiptDisplay: receiptComp.display,
        sheetVisibleInPrint: sheetComp.display !== 'none',
        sheetDisplay: sheetComp.display,
        modalHeaderHidden: headerComp.display === 'none',
        totalRowsInPrint: tableRows.length
      };
    })()`);
    console.log('Print media emulation check:', printStyles);

    // Capture screenshot in print media emulation
    const snap = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/print-preview-emulated.png', Buffer.from(snap.result.data, 'base64'));
    console.log('Saved scratch/print-preview-emulated.png');

    // Also test Page.printToPDF to verify Chrome PDF generation works without crashing
    const pdf = await call('Page.printToPDF', {
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
      printBackground: true
    });
    if (pdf.result && pdf.result.data) {
      fs.writeFileSync('scratch/shift-report-generated.pdf', Buffer.from(pdf.result.data, 'base64'));
      console.log('Successfully generated scratch/shift-report-generated.pdf (bytes: ' + pdf.result.data.length + ')');
    }

    // Reset emulated media
    await call('Emulation.setEmulatedMedia', { media: '' });
    await evaluate(`document.body.classList.remove('print-shift-report');`);
    await sleep(200);

    // Close modal
    await evaluate(`document.getElementById('btnModalShiftRepClose').click();`);
    await sleep(200);

    // Test Dashboard End Shift Print
    await evaluate(`document.getElementById('navSellCounter').click();`);
    await sleep(300);
    await evaluate(`document.getElementById('btnHeaderEndShift').click();`);
    await sleep(400);
    await evaluate(`document.getElementById('btnConfirmCloseShiftModal').click();`);
    await sleep(800);

    // Mock print for dashboard test
    await evaluate(`
      window.__dashPrintCalled = false;
      window.print = function() { window.__dashPrintCalled = true; };
      document.getElementById('btnShiftRepPrint').click();
    `);
    await sleep(100);

    const dashCheck = await evaluate(`(() => {
      return {
        dashPrintCalled: window.__dashPrintCalled,
        isShiftReportClass: document.body.classList.contains('print-shift-report'),
        sheetDisplay: window.getComputedStyle(document.getElementById('shiftReportDocSheet')).display,
        receiptDisplay: window.getComputedStyle(document.getElementById('printReceiptSection')).display
      };
    })()`);
    console.log('Dashboard Shift Report Print check:', dashCheck);
  } finally {
    p.kill();
  }
}

run();
