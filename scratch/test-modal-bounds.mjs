import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9266;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2000);
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
        const i = id++;
        cbs.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    }

    await call('Page.enable');
    await call('DOM.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 650, // Small laptop screen height!
      deviceScaleFactor: 1,
      mobile: false
    });

    async function evaluate(expr) {
      const res = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
      return res.result?.result?.value;
    }

    // Go to history, open modal
    await evaluate(`document.getElementById('navHistory').click();`);
    await sleep(300);
    await evaluate(`document.querySelector('#histTableBody tr:last-child .btn-rpt-view').click();`);
    await sleep(400);

    const bounds = await evaluate(`(() => {
      const m = document.getElementById('modalShiftReportViewer');
      const rect = m.getBoundingClientRect();
      const title = document.getElementById('modalShiftRepToolbarTitle').getBoundingClientRect();
      return {
        modalTop: rect.top,
        modalBottom: rect.bottom,
        modalHeight: rect.height,
        windowHeight: window.innerHeight,
        titleTop: title.top
      };
    })()`);
    console.log('Bounds at 650px height:', bounds);

    // Test scrolling inside modal body
    await evaluate(`document.querySelector('.modal-shift-rep-body').scrollTop = 700;`);
    await sleep(300);

    const scrollMetrics = await evaluate(`(() => {
      const b = document.querySelector('.modal-shift-rep-body');
      return {
        scrollTop: b.scrollTop,
        scrollHeight: b.scrollHeight,
        clientHeight: b.clientHeight,
        isScrolled: b.scrollTop > 0
      };
    })()`);
    console.log('Scroll metrics in modal:', scrollMetrics);

    const snap2 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/modal-scrolled.png', Buffer.from(snap2.result.data, 'base64'));
    console.log('Saved scratch/modal-scrolled.png');
  } finally {
    p.kill();
  }
}

run();
