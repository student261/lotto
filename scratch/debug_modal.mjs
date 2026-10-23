import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9787;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function debugModal() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,900',
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

    await sleep(1000);

    const info = await evalInPage(`(() => {
      document.querySelector('#navInventory')?.click();
      document.getElementById('invBtnAddNewBook')?.click();
      const dlg = document.getElementById('receiveBookModernModal');
      const scrim = document.getElementById('receiveBookScrim');
      const modalRb = document.querySelector('#receiveBookModernModal .modal.rb');
      const box = dlg?.getBoundingClientRect();
      const scrimBox = scrim?.getBoundingClientRect();
      const rbBox = modalRb?.getBoundingClientRect();
      return {
        open: dlg?.open,
        dlgRect: box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null,
        scrimRect: scrimBox ? { x: scrimBox.x, y: scrimBox.y, w: scrimBox.width, h: scrimBox.height } : null,
        rbRect: rbBox ? { x: rbBox.x, y: rbBox.y, w: rbBox.width, h: rbBox.height } : null
      };
    })()`);

    console.log('Rect Info:', JSON.stringify(info, null, 2));

    await sleep(500);
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\debug_shot.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
  } finally {
    p.kill();
  }
}

debugModal();
