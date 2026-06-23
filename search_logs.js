const fs = require('fs');

const logPath = 'C:\\Users\\HITIKA\\AppData\\Roaming\\Sarox Winding & Insulation Tester V2\\logs\\main.log';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log('--- Filtered June 14 logs ---');
lines.forEach((line, index) => {
  if (line.startsWith('[2026-06-14')) {
    if (!line.includes('borderColor') && !line.includes('style property during rerender')) {
      console.log(`${index + 1}: ${line}`);
    }
  }
});
