import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9889;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function check() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1276,556',
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
        const reqId = id++;
        cbs.set(reqId, res);
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    await call('Page.enable');
    await sleep(1500);

    const res = await call('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const view = document.getElementById('viewSellCounter');
        const children = Array.from(view ? view.children : []).map(c => {
          const r = c.getBoundingClientRect();
          return { id: c.id, cls: c.className, h: Math.round(r.height), top: Math.round(r.top) };
        });
        const rack = document.querySelector('.dispenser-rack-container');
        const wrapper = document.querySelector('.dispensers-grid-wrapper');
        const cards = Array.from(document.querySelectorAll('.box-card')).slice(0, 3).map(c => {
          const r = c.getBoundingClientRect();
          return { h: Math.round(r.height), w: Math.round(r.width) };
        });
        return { children, rackH: rack ? Math.round(rack.getBoundingClientRect().height) : 0, wrapperH: wrapper ? Math.round(wrapper.getBoundingClientRect().height) : 0, cards };
      })()`
    });

    console.log('Measurement:', JSON.stringify(res.result?.result?.value, null, 2));

  } finally {
    p.kill();
  }
}

check().catch(console.error);
