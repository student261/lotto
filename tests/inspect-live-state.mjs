const fetch = globalThis.fetch;
async function inspect() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('5173'));
  if (!page) {
    console.log('No 5173 page found on 9222, targets:', targets);
    return;
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `JSON.stringify({
          shiftStatus: window.state?.shiftStatus,
          shiftNumber: window.state?.currentShiftNumber,
          activeCount: window.state?.slots?.filter(s => s.status === 'ACTIVE').length,
          slots: window.state?.slots?.filter(s => s.status === 'ACTIVE').map(s => ({
            boxNumber: s.boxNumber,
            gameName: s.gameName,
            price: s.price,
            startTicket: s.startTicket,
            currentTicket: s.currentTicket,
            ticketsSold: s.ticketsSold,
            previousShiftSold: s.previousShiftSold,
            scannedInEndShift: s.scannedInEndShift,
            packNumber: s.packNumber,
            startSecurityCode: s.startSecurityCode,
            currentSecurityCode: s.currentSecurityCode
          }))
        }, null, 2)`,
        returnByValue: true
      }
    }));
  };
  ws.onmessage = e => {
    console.log(JSON.parse(e.data).result?.result?.value);
    process.exit(0);
  };
}
inspect().catch(console.error);
