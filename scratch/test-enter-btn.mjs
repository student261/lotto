import { spawn } from 'child_process';

const p = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--remote-debugging-port=9248', '--headless=new', 'http://localhost:5173']);
setTimeout(async () => {
  try {
    const targets = await (await fetch('http://127.0.0.1:9248/json')).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const cbs = new Map();
    ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id) cbs.get(d.id)?.(d); };
    await new Promise(r => ws.onopen = r);
    function call(method, params = {}) { return new Promise(res => { const reqId = id++; cbs.set(reqId, res); ws.send(JSON.stringify({ id: reqId, method, params })); }); }
    await call('Runtime.enable');
    await new Promise(r => setTimeout(r, 1000));
    const pre = await call('Runtime.evaluate', {
      expression: `(() => {
        return {
          lastScan: document.getElementById('lastScanDisplay')?.textContent,
          activeEl: document.activeElement?.id
        };
      })()`,
      returnByValue: true
    });
    console.log('Pre-click:', pre.result.result.value);

    const res = await call('Runtime.evaluate', {
      expression: `(() => {
        const input = document.getElementById('barcodeInput');
        const btn = document.getElementById('barcodeEnterBtn');
        input.value = '14171288420015';
        btn.click();
        return {
          inputVal: input.value,
          lastScan: document.getElementById('lastScanDisplay')?.textContent
        };
      })()`,
      returnByValue: true
    });
    console.log('Post-click:', res.result.result.value);
  } finally {
    p.kill();
  }
}, 2000);
