import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9299;

async function run() {
  const p = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu', '--window-size=1280,900', 'http://localhost:5173']);
  await new Promise(r => setTimeout(r, 2000));
  const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
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
  await new Promise(r => setTimeout(r, 1000));

  const info = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const btn = document.getElementById('btnHeaderReport');
      if (!btn) return { error: 'btnHeaderReport not found' };
      btn.click();
      return {
        viewDayReportDisplay: document.getElementById('viewDayReport')?.style.display,
        hash: window.location.hash,
        title: document.getElementById('dayReportPageTitle')?.textContent,
        subtitle: document.getElementById('dayReportPageSubtitle')?.textContent,
        totalSales: document.getElementById('drSheetTotalSales')?.textContent,
        drSheetDate: document.getElementById('drSheetDate')?.textContent,
        drSheetShifts: document.getElementById('drSheetShifts')?.textContent,
        drSheetGenerated: document.getElementById('drSheetGenerated')?.textContent,
        drSheetTickets: document.getElementById('drSheetTickets')?.textContent,
        tableRowsCount: document.querySelectorAll('#drReportTableBody tr').length,
        firstRow: document.querySelector('#drReportTableBody tr')?.innerText
      };
    })()`
  });
  console.log('Report button click result:', info.result);
  // Take screenshot of live Day Report screen
  const ss1 = await call('Page.captureScreenshot');
  fs.writeFileSync('scratch/day_report_view_live.png', Buffer.from(ss1.result.data, 'base64'));
  console.log('Saved scratch/day_report_view_live.png');

  // Trigger printDayReportSheet
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.body.classList.add('print-day-report-sheet');
    })()`
  });

  await call('Emulation.setEmulatedMedia', { media: 'print' });
  const printCheck = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const sheet = document.getElementById('dayReportPaperSheet');
      const cs = sheet ? window.getComputedStyle(sheet) : null;
      const receipt = document.getElementById('printReceiptSection');
      const rcs = receipt ? window.getComputedStyle(receipt) : null;
      const posMain = document.querySelector('.pos-main-container');
      const posMainCs = posMain ? window.getComputedStyle(posMain) : null;
      const reconTotal = document.getElementById('drSheetReconTicketSales')?.textContent;
      const reconExpected = document.getElementById('drSheetReconExpected')?.textContent;
      return {
        sheetDisplay: cs?.display,
        sheetVisibility: cs?.visibility,
        posMainDisplay: posMainCs?.display,
        posMainVisibility: posMainCs?.visibility,
        receiptDisplay: rcs?.display,
        receiptVisibility: rcs?.visibility,
        bodyClasses: document.body.className,
        reconTotal,
        reconExpected
      };
    })()`
  });
  console.log('Print media evaluation:', printCheck.result);

  const pdf = await call('Page.printToPDF', {
    paperWidth: 8.5,
    paperHeight: 11,
    marginTop: 0.4,
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4,
    printBackground: true
  });
  fs.writeFileSync('scratch/day_report.pdf', Buffer.from(pdf.result.data, 'base64'));
  console.log('Saved scratch/day_report.pdf successfully! Length:', pdf.result.data.length);

  p.kill();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
