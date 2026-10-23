const fs = require('fs');

const mainJs = fs.readFileSync('src/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// Search for modal implementations in mainJs
const modalFuncs = [
  'openBoxAdjustModal',
  'openChangeTicketValueModal',
  'openReturnPackModal',
  'openPartialTakeOutActionModal',
  'openManagerApprovalModal',
  'openSwitchBoxModal',
  'openChangeBoxModal',
  'openFixTicketPositionModal',
  'openTerminalReconcileModal',
  'openActivationForBox',
  'openResetOptionsModal',
  'openEndShiftConfirmation',
  'openShiftReportModal',
  'openInventoryModal',
  'openInventoryStatusModal',
  'openSetTicketDetailsModal',
  'openSetBoxModal',
  'openBoxBarcodesModal',
  'openHistoryModal',
  'openPastShiftReportModal',
  'openSettingsModal',
  'openCashierModal'
];

const modalDetails = [];

modalFuncs.forEach(fn => {
  const idx = mainJs.indexOf('function ' + fn);
  if (idx !== -1) {
    const chunk = mainJs.slice(idx, idx + 1200);
    // Find modal DOM ID referenced
    const domMatches = chunk.match(/getElementById\(['"]([^'"]+)['"]\)/g) || [];
    modalDetails.push({
      function: fn,
      domReferences: [...new Set(domMatches)],
      snippet: chunk.slice(0, 300).replace(/\r?\n\s*/g, ' ')
    });
  }
});

console.log('Modal details count:', modalDetails.length);
fs.writeFileSync('scratch/modals_analyzed.json', JSON.stringify(modalDetails, null, 2));
