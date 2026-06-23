const fs = require('fs');
const content = fs.readFileSync('test/src/renderer/components/MultimeterTab.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('secondary') || line.includes('DEG') || line.includes('theta') || line.includes('THETA')) {
    console.log(`${idx + 1}: ${line}`);
  }
});
