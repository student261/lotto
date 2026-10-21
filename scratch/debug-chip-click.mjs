import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9229;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const chromeProc = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5173/#inventory'
  ]);

  try {
    await sleep(2500);

    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await res.json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let idCounter = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data);
        callbacks.delete(data.id);
      }
    };

    await new Promise(r => ws.onopen = r);

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = idCounter++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const resp = await send('Runtime.evaluate', { expression, returnByValue: true });
      return resp.result?.result?.value;
    }

    await send('Page.enable');
    await send('DOM.enable');
    await sleep(1000);

    const info = await evaluate(`
      (() => {
        const chips = document.querySelectorAll('.inv-demo-chip');
        const chip = document.querySelector('.inv-demo-chip[data-barcode="1415-560411-000"]');
        const input = document.getElementById('invScanBarcodeInput');
        const banner = document.getElementById('invUpdateBanner');
        return {
          chipsCount: chips.length,
          chipFound: Boolean(chip),
          chipBarcode: chip?.getAttribute('data-barcode'),
          inputFound: Boolean(input),
          bannerDisplay: banner?.style.display
        };
      })()
    `);
    console.log('Diagnostic info before click:', info);

    const clickRes = await evaluate(`
      (() => {
        const chip = document.querySelector('.inv-demo-chip[data-barcode="1415-560411-000"]');
        if (!chip) return 'no chip';
        chip.click();
        const added = document.getElementById('invAddedCount')?.textContent;
        const inStock = document.getElementById('invBadgeInStock')?.textContent;
        const rows = document.querySelectorAll('#invTableBody tr').length;
        return { added, inStock, rows };
      })()
    `);
    console.log('Diagnostic result after click:', clickRes);

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

run();
