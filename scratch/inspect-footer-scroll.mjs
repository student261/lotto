import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9248;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,800',
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

  const res = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const elMain = document.querySelector('.pos-main-container');
      const elView = document.getElementById('viewSellCounter');
      const elHdr = document.querySelector('.pos-unified-header-bar');
      const elRack = document.querySelector('.dispenser-rack-container');
      const elGridWrap = document.querySelector('.dispensers-grid-wrapper');
      const elFooter = document.getElementById('cardAllBoxesMap');

      function info(el, name) {
        if (!el) return { name, exists: false };
        const r = el.getBoundingClientRect();
        return {
          name,
          top: r.top,
          bottom: r.bottom,
          height: r.height,
          inViewport: r.bottom <= window.innerHeight && r.top >= 0
        };
      }

      return {
        windowInnerHeight: window.innerHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        mainScrollHeight: elMain.scrollHeight,
        header: info(elHdr, 'header'),
        rack: info(elRack, 'rack'),
        gridWrap: info(elGridWrap, 'gridWrap'),
        footer: info(elFooter, 'footer (cardAllBoxesMap)')
      };
    })()`
  });

  console.log(JSON.stringify(res.result.result.value, null, 2));

  try { p.kill(); } catch (e) {}
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
