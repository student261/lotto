import { spawn } from 'child_process';
import fs from 'fs';

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9288;

async function test() {
  const p = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu', '--window-size=1280,900', 'http://localhost:5173']);
  await new Promise(r => setTimeout(r, 2200));
  
  const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
  };
  await new Promise(r => ws.onopen = r);
  function call(method, params = {}) {
    return new Promise(res => {
      const reqId = id++;
      cbs.set(reqId, res);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }
  await call('Page.enable');
  await new Promise(r => setTimeout(r, 1200));

  // 1. Click Box 60 in the rack
  const resBox60 = await call('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('.box-card'));
      const card60 = cards.find(c => {
        const numEl = c.querySelector('.box-main-number');
        return numEl && numEl.textContent.trim() === '60';
      }) || cards.find(c => c.dataset.box === '60');

      if (!card60) return { error: 'Card 60 not found' };
      card60.click();

      const modal = document.getElementById('boxAdjustModal');
      const isOpen = modal && modal.open;
      const gameName = document.getElementById('boxDetailGameName')?.textContent;
      const price = document.getElementById('boxDetailPrice')?.textContent;
      const nextTicket = document.getElementById('boxDetailNextTicket')?.textContent;
      const leftInBox = document.getElementById('boxDetailLeftInBox')?.textContent;
      const timelineItems = document.querySelectorAll('.pack-timeline-item').length;

      return {
        clicked: true,
        isOpen,
        modalId: modal?.id,
        gameName,
        price,
        nextTicket,
        leftInBox,
        timelineItems
      };
    })()`,
    returnByValue: true
  });
  console.log('Box 60 Click Result:', JSON.stringify(resBox60.result?.result?.value, null, 2));

  // Take screenshot of Box 60 Modal
  const shotBox = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/user_test_click_box60.png', Buffer.from(shotBox.result.data, 'base64'));

  // Test "Loaded by mistake" inside Box 60 Modal -> Manager Approval
  const resMistake = await call('Runtime.evaluate', {
    expression: `(() => {
      const btnMistake = document.getElementById('btnSetCountZero');
      if (!btnMistake) return { error: 'btnSetCountZero not found' };
      btnMistake.click();
      const mgrModal = document.getElementById('managerApprovalModal');
      return {
        mgrModalOpen: mgrModal && mgrModal.open,
        mgrTitle: document.getElementById('mgrApprovalTitle')?.textContent,
        mgrSubtitle: document.getElementById('mgrApprovalSubtitle')?.textContent,
        reasonCount: document.querySelectorAll('.mgr-reason-chip').length
      };
    })()`,
    returnByValue: true
  });
  console.log('Loaded By Mistake Click Result:', JSON.stringify(resMistake.result?.result?.value, null, 2));

  const shotMgr = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/user_test_click_manager_approval.png', Buffer.from(shotMgr.result.data, 'base64'));

  // Close all open dialogs
  await call('Runtime.evaluate', { expression: `document.querySelectorAll('dialog[open]').forEach(d => d.close());` });
  await new Promise(r => setTimeout(r, 400));

  // 2. Click tabSettlement (SHIFT SALES · ESTIMATE)
  const resSettle = await call('Runtime.evaluate', {
    expression: `(() => {
      const tab = document.getElementById('tabSettlement');
      if (!tab) return { error: 'tabSettlement not found' };
      tab.click();

      const modal = document.getElementById('shiftReportModal');
      const isOpen = modal && modal.open;
      const title = document.getElementById('shiftReportModalTitle')?.textContent;
      const shiftDate = document.getElementById('repShiftNumDate')?.textContent;
      const cashier = document.getElementById('repCashier')?.textContent;
      const tixSold = document.getElementById('repTicketsSold')?.textContent;
      const totalRev = document.getElementById('repTotalRevenue')?.textContent;
      const tableRows = document.querySelectorAll('#reportBodyRows tr').length;
      const expectedCash = document.getElementById('recExpectedCash')?.textContent;

      return {
        clickedTab: true,
        isOpen,
        title,
        shiftDate,
        cashier,
        tixSold,
        totalRev,
        tableRows,
        expectedCash
      };
    })()`,
    returnByValue: true
  });
  console.log('tabSettlement Click Result:', JSON.stringify(resSettle.result?.result?.value, null, 2));

  // Take screenshot of Settlement Screen
  const shotSettle = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/user_test_click_settle.png', Buffer.from(shotSettle.result.data, 'base64'));

  try { p.kill(); } catch (e) {}
}

test().catch(console.error);
