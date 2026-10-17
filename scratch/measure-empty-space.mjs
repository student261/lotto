import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9245;

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
  await sleep(1500);

  const res = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elMain = document.querySelector('.pos-main-container');
      const elView = document.getElementById('viewSellCounter');
      const elHdr = document.querySelector('.pos-unified-header-bar');
      const elRack = document.querySelector('.dispenser-rack-container');

      function inspect(el, name) {
        if (!el) return { name, exists: false };
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          name,
          rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          marginTop: cs.marginTop,
          marginBottom: cs.marginBottom
        };
      }

      return {
        windowHeight: window.innerHeight,
        main: inspect(elMain, '.pos-main-container'),
        view: inspect(elView, '#viewSellCounter'),
        header: inspect(elHdr, '.pos-unified-header-bar'),
        rack: inspect(elRack, '.dispenser-rack-container'),
        gapTopToHeader: elHdr ? elHdr.getBoundingClientRect().top : null,
        gapHeaderToRack: (elHdr && elRack) ? (elRack.getBoundingClientRect().top - elHdr.getBoundingClientRect().bottom) : null
      };
    })()`
  });

  console.log(JSON.stringify(res, null, 2));
  p.kill();
}

run().catch(console.error);
