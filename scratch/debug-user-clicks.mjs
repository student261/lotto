import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9276;

async function test() {
  const p = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu', '--window-size=1200,900', 'http://localhost:5173']);
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
  await new Promise(r => setTimeout(r, 1200));

  // 1. Click box 60
  const clickBox60 = await call('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.box-card, .dispenser-card, .box-tile'));
      const card60 = cards.find(c => {
        const num = c.querySelector('.box-num, .tile-box-num, .box-number-badge, .box-number');
        return num && num.textContent.trim() === '60';
      }) || cards.find(c => c.textContent.includes('60') && c.textContent.includes('Jumbo Bucks'));
      
      let clickInfo = { foundCard60: !!card60 };
      if (card60) {
        card60.click();
      }
      const openDlgs = Array.from(document.querySelectorAll('dialog[open]')).map(d => ({ id: d.id, className: d.className }));
      clickInfo.openDlgs = openDlgs;
      return clickInfo;
    })()`,
    returnByValue: true
  });
  console.log('After clicking Box 60:', JSON.stringify(clickBox60.result.value));

  const shotBox = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/user_test_click_box60.png', Buffer.from(shotBox.result.data, 'base64'));

  // Close open dialogs
  await call('Runtime.evaluate', { expression: `document.querySelectorAll('dialog[open]').forEach(d => d.close());` });
  await new Promise(r => setTimeout(r, 400));

  // 2. Click tabSettlement
  const clickTabSettle = await call('Runtime.evaluate', {
    expression: `(() => {
      const tab = document.getElementById('tabSettlement');
      let tabInfo = { foundTab: !!tab };
      if (tab) {
        tab.click();
      }
      const openDlgs = Array.from(document.querySelectorAll('dialog[open]')).map(d => ({ id: d.id, className: d.className }));
      tabInfo.openDlgs = openDlgs;
      return tabInfo;
    })()`,
    returnByValue: true
  });
  console.log('After clicking tabSettlement:', JSON.stringify(clickTabSettle.result.value));

  const shotSettle = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/user_test_click_settle.png', Buffer.from(shotSettle.result.data, 'base64'));

  try { p.kill(); } catch (e) {}
}

test().catch(console.error);
