import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9789;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function debugTree() {
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

    const tree = await evalInPage(`(() => {
      const dlg = document.getElementById('receiveBookModernModal');
      let cur = dlg;
      const path = [];
      while (cur) {
        path.push({ tag: cur.tagName, id: cur.id, cls: cur.className });
        cur = cur.parentElement;
      }
      return path;
    })()`);

    console.log('Path to root:', JSON.stringify(tree, null, 2));
    ws.close();
  } finally {
    p.kill();
  }
}

debugTree();
