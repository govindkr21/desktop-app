const fs = require('fs');

const backupPath = 'c:\\Users\\HITIKA\\OneDrive\\Documents\\oldAppBackup21-6.json';
const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

console.log('Keys in backup:', Object.keys(data));

const record = data.records.find(r => r.id === 1781981272019);
console.log('Record found:', record ? 'Yes' : 'No');
if (record) {
  console.log('Record details:', {
    id: record.id,
    clientName: record.clientName,
    motorUtilityTag: record.motorUtilityTag
  });
}

const insulation = data.insulation ? data.insulation[1781981272019] : null;
console.log('Insulation data keys:', insulation ? Object.keys(insulation) : 'None');

const multimeter = data.multimeter ? data.multimeter[1781981272019] : null;
console.log('Multimeter data keys:', multimeter ? Object.keys(multimeter) : 'None');
