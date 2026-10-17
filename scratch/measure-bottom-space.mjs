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
    '--window-size=1440,900',
    'http://localhost:5173'
  ]);

  await sleep(1500);

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

  await send('Page.enable');

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const container = document.querySelector('.pos-main-container');
      const sellView = document.getElementById('viewSellCounter');
      const allBoxesCard = document.getElementById('cardAllBoxesMap');
      const slotsRibbon = document.getElementById('slotsRibbon');

      const cRect = container.getBoundingClientRect();
      const sRect = sellView.getBoundingClientRect();
      const aRect = allBoxesCard.getBoundingClientRect();
      const rRect = slotsRibbon.getBoundingClientRect();

      const cStyle = window.getComputedStyle(container);
      const sStyle = window.getComputedStyle(sellView);
      const aStyle = window.getComputedStyle(allBoxesCard);

      return {
        container: {
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          paddingBottom: cStyle.paddingBottom,
          marginBottom: cStyle.marginBottom
        },
        sellView: {
          offsetHeight: sellView.offsetHeight,
          paddingBottom: sStyle.paddingBottom,
          marginBottom: sStyle.marginBottom
        },
        allBoxesCard: {
          offsetHeight: allBoxesCard.offsetHeight,
          paddingBottom: aStyle.paddingBottom,
          marginBottom: aStyle.marginBottom,
          bottomToContainerBottom: container.scrollHeight - (allBoxesCard.offsetTop + allBoxesCard.offsetHeight)
        },
        elementsAfterAllBoxesCard: Array.from(sellView.children).map(c => ({
          tag: c.tagName,
          id: c.id,
          className: c.className,
          display: window.getComputedStyle(c).display,
          height: c.offsetHeight
        }))
      };
    })()`,
    returnByValue: true
  });

  console.log('MEASUREMENTS:', JSON.stringify(evalRes, null, 2));

  ws.close();
  chromeProc.kill();
}

run().catch(console.error);
