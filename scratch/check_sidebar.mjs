import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9791;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
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
    const page = targets.find(t => t.type === 'page' && t.url.includes('5173'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let id = 1;
    const cbs = new Map();
    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.id && cbs.has(d.id)) {
        cbs.get(d.id)(d);
        cbs.delete(d.id);
      }
    };
    function send(method, params = {}) {
      const curId = id++;
      return new Promise(resolve => {
        cbs.set(curId, resolve);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const brandName = document.querySelector('.brand-app-name');
        const storeName = document.querySelector('.brand-store-name');
        const badge = document.querySelector('.brand-badge-icon');
        const collapse = document.querySelector('.sidebar-collapse-btn');
        const activeNav = document.querySelector('.sidebar-nav-item.active');

        function get(el) {
          if (!el) return null;
          const cs = window.getComputedStyle(el);
          return {
            fontFamily: cs.fontFamily,
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            color: cs.color,
            background: cs.backgroundColor,
            borderRadius: cs.borderRadius,
            width: cs.width,
            height: cs.height,
            padding: cs.padding,
            svg: el.querySelector('svg')?.outerHTML
          };
        }

        return JSON.stringify({
          brandName: get(brandName),
          storeName: get(storeName),
          badge: get(badge),
          collapse: get(collapse),
          activeNav: get(activeNav)
        });
      })()`
    });

    const val = evalRes?.result?.result?.value || evalRes?.result?.value;
    console.log('Sidebar styles:', JSON.stringify(JSON.parse(val), null, 2));

    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/Admin/.gemini/antigravity-ide/brain/e5d66af5-2b32-406b-b7b2-c5318eae9544/screenshots/current_sidebar_full.png', Buffer.from(snap.result.data, 'base64'));
    console.log('Saved screenshot current_sidebar_full.png');

    ws.close();
  } finally {
    p.kill();
  }
}

run().catch(console.error);
