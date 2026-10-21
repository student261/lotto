import { spawn } from 'child_process';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9230;

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
      if (data.method === 'Runtime.exceptionThrown') {
        console.error('Browser Exception:', data.params.exceptionDetails);
      }
      if (data.method === 'Console.messageAdded') {
        console.log('Console:', data.params.message.text);
      }
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

    await send('Runtime.enable');
    await send('Console.enable');
    await send('Page.enable');
    await sleep(1000);

    console.log('Dispatching click on chip...');
    const result = await evaluate(`
      (() => {
        try {
          const chip = document.querySelector('.inv-demo-chip[data-barcode="1415-560411-000"]');
          console.log('Found chip:', chip ? chip.outerHTML : 'none');
          if (chip) {
            chip.click();
            return 'clicked successfully';
          }
          return 'chip not found';
        } catch (e) {
          return 'Error: ' + e.message + ' ' + e.stack;
        }
      })()
    `);
    console.log('Evaluate result:', result);
    await sleep(500);

    const counts = await evaluate(`
      ({
        added: document.getElementById('invAddedCount')?.textContent,
        inStock: document.getElementById('invBadgeInStock')?.textContent,
        firstRowGame: document.querySelector('#invTableBody tr td.td-inv-game .game-title')?.textContent,
        firstRowPack: document.querySelector('#invTableBody tr td.td-inv-pack')?.textContent
      })
    `);
    console.log('Counts and table state:', counts);

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

run();
