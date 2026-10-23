import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9444;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
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

    const evalRes = await call('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const views = Array.from(document.querySelectorAll('[id^=view]'));
        const visibleViews = views.filter(v => window.getComputedStyle(v).display !== 'none').map(v => v.id);
        return {
          title: document.title,
          build: document.documentElement.dataset.build,
          visibleViews: visibleViews,
          bodyClass: document.body.className,
          theme: document.documentElement.getAttribute('data-theme')
        };
      })()`
    });

    console.log('Eval res:', JSON.stringify(evalRes));
  } finally {
    p.kill();
  }
}

run().catch(console.error);
