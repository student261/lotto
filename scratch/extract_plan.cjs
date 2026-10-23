const fs = require('fs');
const readline = require('readline');

async function extract() {
  const fileStream = fs.createReadStream('C:/Users/Admin/.gemini/antigravity-ide/brain/097b5dc4-4753-4d8d-933e-0460271b28f3/.system_generated/logs/transcript_full.jsonl');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.includes('PHASE-BY-PHASE PLAN')) {
      const obj = JSON.parse(line);
      const content = obj.content;
      const p0 = content.indexOf('CHECKPOINT');
      console.log(content.slice(p0, p0 + 1200));
      break;
    }
  }
}
extract();
