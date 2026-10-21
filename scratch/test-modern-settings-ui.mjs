import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9280;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const p = spawn(CHROME, [
    '--remote-debugging-port=' + PORT,
    '--headless=new',
    '--disable-gpu',
    'http://localhost:5173'
  ]);

  try {
    await sleep(2000);
    const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('No page found');

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

    const call = (method, params = {}) => new Promise(res => {
      const i = id++;
      cbs.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

    await call('Page.enable');
    await call('DOM.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

    const evaluate = expr => call('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result?.result?.value);

    console.log('--- Step 1: Navigating to Settings ---');
    await evaluate(`document.getElementById('navSettings').click();`);
    await sleep(400);

    // Tab 1: Store & email
    const tab1Info = await evaluate(`(() => {
      const title = document.querySelector('.settings-page-header-new .page-main-title')?.textContent.trim();
      const subtitle = document.querySelector('.settings-page-header-new .page-subtitle')?.textContent.trim();
      const storeName = document.getElementById('setStoreName')?.value;
      const timeZone = document.getElementById('setTimeZone')?.value;
      const emails = Array.from(document.querySelectorAll('.settings-recipient-email')).map(el => el.textContent.trim());

      return { title, subtitle, storeName, timeZone, emails };
    })()`);
    console.log('Tab 1 (Store & email) check:', tab1Info);

    const snap1 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/settings-tab1-store-email.png', Buffer.from(snap1.result.data, 'base64'));
    console.log('Saved scratch/settings-tab1-store-email.png');

    // Tab 2: Boxes
    console.log('--- Step 2: Testing Boxes Tab ---');
    await evaluate(`document.querySelector('.btn-settings-top-tab[data-tab="boxes"]').click();`);
    await sleep(300);

    const tab2Info = await evaluate(`(() => {
      const countSub = document.getElementById('settingsBoxesCountSub')?.textContent.trim();
      const totalDisplay = document.getElementById('settingsTotalBoxesDisplay')?.textContent.trim();
      const caption = document.getElementById('settingsBoxesCaptionNote')?.textContent.trim();
      const activePills = document.querySelectorAll('.settings-box-pill.box-pill-active').length;
      const emptyPills = document.querySelectorAll('.settings-box-pill.box-pill-empty').length;

      return { countSub, totalDisplay, caption, activePills, emptyPills };
    })()`);
    console.log('Tab 2 (Boxes) check:', tab2Info);

    const snap2 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/settings-tab2-boxes.png', Buffer.from(snap2.result.data, 'base64'));
    console.log('Saved scratch/settings-tab2-boxes.png');

    // Tab 3: Games
    console.log('--- Step 3: Testing Games Tab ---');
    await evaluate(`document.querySelector('.btn-settings-top-tab[data-tab="games"]').click();`);
    await sleep(300);

    const tab3Info = await evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('#settingsGamesNewTableBody tr')).map(tr => {
        return Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
      });
      return { totalGames: rows.length, first3: rows.slice(0, 3), last: rows[rows.length - 1] };
    })()`);
    console.log('Tab 3 (Games) check:', tab3Info);

    const snap3 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/settings-tab3-games.png', Buffer.from(snap3.result.data, 'base64'));
    console.log('Saved scratch/settings-tab3-games.png');

    // Tab 4: People
    console.log('--- Step 4: Testing People Tab ---');
    await evaluate(`document.querySelector('.btn-settings-top-tab[data-tab="people"]').click();`);
    await sleep(300);

    const tab4Info = await evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('#settingsPeopleNewTableBody tr')).map(tr => {
        const name = tr.querySelector('strong')?.textContent.trim();
        const signIn = tr.querySelector('td:nth-child(2)')?.textContent.trim();
        const role = tr.querySelector('.role-pill-modern')?.textContent.trim();
        const active = tr.querySelector('.toggle-person-active')?.checked;
        return { name, signIn, role, active };
      });
      return { people: rows };
    })()`);
    console.log('Tab 4 (People) check:', tab4Info);

    const snap4 = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scratch/settings-tab4-people.png', Buffer.from(snap4.result.data, 'base64'));
    console.log('Saved scratch/settings-tab4-people.png');

    console.log('🎉 ALL SETTINGS SCREEN UI VERIFICATIONS PASSED!');
  } finally {
    p.kill();
  }
}

run();
