import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9821;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-ss-updinv-'));

const p = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tmp}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  'http://localhost:5173'
]);

setTimeout(async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await res.json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const send = (method, params = {}) => new Promise(resolve => {
      const curId = id++;
      const handler = e => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    const evalCode = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 950,
      deviceScaleFactor: 1,
      mobile: false
    });

    await new Promise(r => setTimeout(r, 2000));

    // Open Updating Inventory mode (initial 0 added state)
    await evalCode(`
      (() => {
        document.getElementById('btnUpdateInventoryCard').click();
      })()
    `);

    await new Promise(r => setTimeout(r, 600));

    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    const outPath1 = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\.tempmediaStorage\\updating_inventory_initial.png';
    writeFileSync(outPath1, Buffer.from(shot1.data, 'base64'));
    console.log('Saved initial screenshot to:', outPath1);

    // Now scan ticket from media_1792843899698.png
    await evalCode(`
      (() => {
        window.handleUpdatingInventoryScan('1465-0093468-000');
      })()
    `);

    await new Promise(r => setTimeout(r, 600));

    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    const outPath2 = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\e5d66af5-2b32-406b-b7b2-c5318eae9544\\.tempmediaStorage\\updating_inventory_terminal.png';
    writeFileSync(outPath2, Buffer.from(shot2.data, 'base64'));
    console.log('Saved terminal screenshot to:', outPath2);

    ws.close();
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
  } catch (err) {
    console.error('Screenshot error:', err);
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
}, 2500);
