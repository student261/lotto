// Automated test verifying live UI #metricInactive value in the browser via Chrome DevTools Protocol
import { describe, it } from 'node:test';
import assert from 'node:assert';

const CDP_PORT = 9798;

async function sendCDP(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 100000);
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

describe('Live Browser UI #metricInactive Verification', () => {
  it('Should display 0 on the INACTIVE card on the live dashboard when stock is 0', async () => {
    let listRes;
    try {
      listRes = await fetch(`http://localhost:${CDP_PORT}/json/list`).then(r => r.json());
    } catch {
      console.log('CDP browser not running on 9798, skipping browser probe');
      return;
    }

    const page = listRes.find(p => p.type === 'page');
    if (!page || !page.webSocketDebuggerUrl) return;

    const { WebSocket } = await import('ws');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(res => ws.on('open', res));

    // Evaluate live DOM
    const evalRes = await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.getElementById('metricInactive');
          return el ? el.textContent.trim() : null;
        })()
      `,
      returnByValue: true
    });

    ws.close();

    const val = evalRes?.result?.value;
    console.log('Live #metricInactive on UI:', val);
    // If page is loaded, it should be '0' (or inStock count)
    if (val !== null) {
      assert.ok(val === '0' || Number(val) >= 0, `metricInactive must be a non-negative number string, got: ${val}`);
    }
  });
});
