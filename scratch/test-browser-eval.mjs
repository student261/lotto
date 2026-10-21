import { spawn } from 'child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9226;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const p = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu', 'http://localhost:5173']);
  await sleep(2000);
  try {
    const res = await fetch('http://127.0.0.1:' + PORT + '/json');
    const targets = await res.json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    
    let id = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const curId = id++;
        const handler = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === curId) {
            ws.removeEventListener('message', handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await send('Runtime.enable');
    
    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.btn-ctrl-refresh');
        const kpi = document.querySelector('.dashboard-kpi-bar');
        const side = document.querySelector('.pos-sidebar');
        return JSON.stringify({
          title: document.title,
          btnRefreshDisplay: btn ? window.getComputedStyle(btn).display : 'null',
          btnRefreshBg: btn ? window.getComputedStyle(btn).backgroundColor : 'null',
          kpiBarDisplay: kpi ? window.getComputedStyle(kpi).display : 'null',
          sidebarWidth: side ? window.getComputedStyle(side).width : 'null',
          sidebarClass: side ? side.className : 'null',
          styleSheets: Array.from(document.styleSheets).map(s => s.href)
        });
      })()`
    });
    console.log('Browser evaluation:', evalRes.result.value);
    ws.close();
  } finally {
    p.kill();
  }
}

run();
