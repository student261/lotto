import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9880;
const tmp = mkdtempSync(join(tmpdir(), 'chrome-test-cleardata-'));

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
    let targets = null;
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json`);
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    if (!targets) throw new Error('Could not connect to Chrome on port ' + PORT);
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

    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 1200));

    console.log('--- Step 1: Check initial active slots on page ---');
    const step1 = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          activeCount: (window.state.slots || []).filter(s => s.status === 'ACTIVE' && s.packNumber).length,
          shiftNumber: window.state.shiftNumber,
          dataCleared: window.state.dataCleared
        };
      })()`,
      returnByValue: true
    });
    console.log('Initial state:', JSON.stringify(step1.result.value));

    console.log('--- Step 2: Navigate to Settings -> Clear data tab and click Clear ---');
    const step2 = await send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('navSettings')?.click();
        const clearTab = document.querySelector('.btn-settings-top-tab[data-tab="cleardata"]');
        clearTab?.click();

        const input = document.getElementById('inputConfirmClear');
        const btn = document.getElementById('btnClearAllData');
        if (!input || !btn) return { error: 'Input or button missing' };

        input.value = 'CLEAR';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const btnDisabledBefore = btn.disabled;
        btn.click();

        return {
          btnDisabledBefore,
          stateAfterClickCleared: window.state.dataCleared,
          activeAfterClick: (window.state.slots || []).filter(s => s.status === 'ACTIVE' && s.packNumber).length
        };
      })()`,
      returnByValue: true
    });
    console.log('Step 2 result:', JSON.stringify(step2.result.value));

    console.log('--- Step 3: Wait 2 seconds (reload happens after 450ms) ---');
    await new Promise(r => setTimeout(r, 2000));

    console.log('--- Step 4: Check active slots after reload ---');
    const step4 = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          activeCount: (window.state.slots || []).filter(s => s.status === 'ACTIVE' && s.packNumber).length,
          shiftNumber: window.state.shiftNumber,
          dataCleared: window.state.dataCleared
        };
      })()`,
      returnByValue: true
    });
    console.log('State after reload:', JSON.stringify(step4.result.value));

    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    p.kill();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    process.exit(1);
  }
}, 1000);
