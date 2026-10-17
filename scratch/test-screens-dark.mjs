import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9233;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

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
      const reqId = id++;
      cbs.set(reqId, res);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await call('Page.enable');

  // Trigger Screen 04 in dark mode
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('lotto_theme', 'dark');
      window.closeShiftScreen?.renderShiftClosedScreen({
        shiftNumber: 1,
        cashierName: 'master',
        openingTime: '7:02 AM',
        closedTime: '3:30 PM',
        instantSales: 871.00,
        ticketsSold: 127,
        activationsCount: 2,
        activationsValue: 600.00,
        unresolvedProblemsCount: 0,
        resolvedWithOverridesCount: 0,
        managerOverrideUsed: false
      });
    })()`
  });
  await sleep(600);

  let ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/test-screen04-dark.png', Buffer.from(ss.result.data, 'base64'));

  // Trigger Screen 05 in dark mode
  await call('Runtime.evaluate', {
    expression: `(() => {
      window.closeShiftScreen?.renderHandoverScreen({
        previousShift: { shiftNumber: 1, cashierName: 'master', closedTime: '3:30 PM' },
        nextShiftNumber: 2,
        activePacksCount: 19,
        emptyBoxesCount: 46
      });
    })()`
  });
  await sleep(600);

  ss = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/test-screen05-dark.png', Buffer.from(ss.result.data, 'base64'));

  console.log('Saved scratch/test-screen04-dark.png and scratch/test-screen05-dark.png');
  p.kill();
}

run().catch(console.error);
