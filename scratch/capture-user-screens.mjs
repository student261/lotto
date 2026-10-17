import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9271;
const SCRATCH_DIR = "c:\\Users\\Admin\\Desktop\\lotto\\scratch";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1200,980',
    'http://localhost:5173'
  ]);

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
  await sleep(1500);

  // Set up test data so slot 1 has active pack with sales matching Image 1
  await call('Runtime.evaluate', {
    expression: `(() => {
      const st = window.getState?.();
      if (st && st.slots) {
        const s = st.slots.find(slot => slot.boxNumber === 1);
        if (s) {
          s.gameName = '5X Money';
          s.price = 1;
          s.packNumber = '128842';
          s.packSize = 300;
          s.startTicket = 0;
          s.currentTicket = 13;
          s.status = 'ACTIVE';
          s.daysActive = 2;
        }
        window.saveState?.(st);
      }
    })()`
  });
  await sleep(300);

  // ==========================================
  // 1. Box Adjust Modal
  // ==========================================
  await call('Runtime.evaluate', {
    expression: `(() => {
      const st = window.getState?.();
      const s = st.slots.find(slot => slot.boxNumber === 1);
      window.openBoxAdjustModal?.(s);
    })()`
  });
  await sleep(600);

  const shot1 = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCRATCH_DIR, 'screen1_box_details.png'), Buffer.from(shot1.result.data, 'base64'));
  console.log('Saved screen1_box_details.png');

  // Dark mode
  await call('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'dark');`
  });
  await sleep(400);
  const shot1Dark = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCRATCH_DIR, 'screen1_box_details_dark.png'), Buffer.from(shot1Dark.result.data, 'base64'));
  console.log('Saved screen1_box_details_dark.png');

  // Switch back to light
  await call('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'light');`
  });
  await sleep(300);

  // ==========================================
  // 2. Click "Loaded by mistake" to open Manager Approval Modal
  // ==========================================
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('btnSetCountZero')?.click();
    })()`
  });
  await sleep(500);

  const shot3 = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCRATCH_DIR, 'screen3_manager_approval.png'), Buffer.from(shot3.result.data, 'base64'));
  console.log('Saved screen3_manager_approval.png');

  // Dark mode for Manager Approval
  await call('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'dark');`
  });
  await sleep(400);
  const shot3Dark = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCRATCH_DIR, 'screen3_manager_approval_dark.png'), Buffer.from(shot3Dark.result.data, 'base64'));
  console.log('Saved screen3_manager_approval_dark.png');

  // Switch back to light
  await call('Runtime.evaluate', {
    expression: `document.documentElement.setAttribute('data-theme', 'light');`
  });
  await sleep(300);

  // Close Manager Approval
  await call('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('managerApprovalModal')?.close();
      document.getElementById('boxAdjustModal')?.close();
    })()`
  });
  await sleep(400);

  // ==========================================
  // 3. Shift Report / Settlement Modal
  // ==========================================
  await call('Runtime.evaluate', {
    expression: `(() => {
      window.openShiftReportModal?.();
    })()`
  });
  await sleep(600);

  const shot2 = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCRATCH_DIR, 'screen2_shift_settlement.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('Saved screen2_shift_settlement.png');

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
