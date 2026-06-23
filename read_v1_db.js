const fs = require('fs');

const path1 = 'C:\\Users\\HITIKA\\AppData\\Roaming\\ElectricalTestingSuite\\testing_records_v1.json';
if (fs.existsSync(path1)) {
  const db = JSON.parse(fs.readFileSync(path1, 'utf8'));
  console.log(`ElectricalTestingSuite DB has ${db.records.length} records.`);
  const sorted = [...db.records].sort((a, b) => b.id - a.id);
  console.log('--- Last 10 records in ElectricalTestingSuite DB ---');
  sorted.slice(0, 10).forEach(r => {
    const hasMultimeter = db.multimeter && db.multimeter[r.id] ? Object.keys(db.multimeter[r.id]).length : 0;
    const hasInsulation = db.insulation && db.insulation[r.id] ? Object.keys(db.insulation[r.id]).length : 0;
    console.log(`ID: ${r.id}, Date: ${r.date}, Client: ${r.clientName}, Tag: ${r.motorUtilityTag}, S/N: ${r.motorSerialNumber}, MultimeterFields: ${hasMultimeter}, InsulationFields: ${hasInsulation}`);
  });
} else {
  console.log('ElectricalTestingSuite DB does not exist.');
}
