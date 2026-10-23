const fs = require('fs');
const lines = fs.readFileSync('C:/Users/Admin/.gemini/antigravity-ide/brain/097b5dc4-4753-4d8d-933e-0460271b28f3/.system_generated/logs/transcript.jsonl', 'utf8').trim().split('\n');
const userInputs = [];
for (let i = 0; i < lines.length; i++) {
  try {
    const obj = JSON.parse(lines[i]);
    if (obj.type === 'USER_INPUT') {
      userInputs.push({ idx: i, step: obj.step_index, content: obj.content });
    }
  } catch(e) {}
}
console.log('User inputs count:', userInputs.length);
console.log(userInputs);
if (userInputs.length >= 2) {
  const prevUser = userInputs[userInputs.length - 2];
  console.log('Previous user step:', prevUser.step);
  // Find model messages between prevUser.idx and current
  for (let j = prevUser.idx + 1; j < lines.length; j++) {
    const o = JSON.parse(lines[j]);
    if (o.source === 'MODEL' && o.type === 'PLANNER_RESPONSE' && o.content) {
      console.log('--- Planner response at step ' + o.step_index + ' ---');
      console.log(o.content.slice(0, 1000));
    }
  }
}
