import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9777;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function checkConsole() {
  const p = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
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
      if (d.method === 'Runtime.consoleAPICalled') {
        console.log('CONSOLE:', d.params.type, d.params.args.map(a => a.value));
      }
      if (d.method === 'Runtime.exceptionThrown') {
        console.log('EXCEPTION:', d.params.exceptionDetails);
      }
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

    await call('Runtime.enable');
    await call('Page.enable');
    await call('Page.reload');
    await sleep(2000);

    const testEval = await call('Runtime.evaluate', {
      returnByValue: true,
      expression: 'JSON.stringify({ hasHooks: typeof window.__INIT_POS_TEST_HOOKS__, initFunc: typeof window.initPOS, keys: Object.keys(window).filter(k => k.startsWith("__")) })'
    });
    console.log('TestEval result:', testEval.result?.result?.value);

  } finally {
    p.kill();
  }
}

checkConsole().catch(console.error);
