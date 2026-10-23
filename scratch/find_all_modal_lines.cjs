const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
const modals = ['boxAdjustModal', 'activationModal', 'changeBoxModal', 'switchBoxModal', 'fixTicketPositionModal', 'returnPackModal', 'partialTakeOutActionModal', 'updateSoldOutTicketModal', 'endShiftConfirmModal', 'startShiftConfirmModal', 'cashierModal', 'guidedWorkflowModal'];
modals.forEach(m => {
  lines.forEach((l, i) => {
    if (l.includes(`id="${m}"`)) console.log(m, 'line:', i + 1);
  });
});
