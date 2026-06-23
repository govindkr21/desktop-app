const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function checkDb() {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.env.APPDATA, 'Sarox Winding & Insulation Tester V2', 'database.db');
  
  console.log('Reading database from:', dbPath);
  if (!fs.existsSync(dbPath)) {
    console.log('Database file does not exist!');
    return;
  }
  
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  // List tables
  const tablesStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('\n--- TABLES ---');
  while (tablesStmt.step()) {
    console.log(tablesStmt.getAsObject().name);
  }
  tablesStmt.free();
  
  // Count records
  try {
    const recordsCount = db.prepare("SELECT COUNT(*) as count FROM records");
    recordsCount.step();
    console.log('\nRecords count:', recordsCount.getAsObject().count);
    recordsCount.free();
  } catch (e) {
    console.error('Error reading records:', e.message);
  }
  
  // Count insulation tests
  try {
    const insCount = db.prepare("SELECT COUNT(*) as count FROM insulation_tests");
    insCount.step();
    console.log('Insulation tests count:', insCount.getAsObject().count);
    insCount.free();
  } catch (e) {
    console.error('Error reading insulation_tests:', e.message);
  }

  // Count multimeter tests
  try {
    const mulCount = db.prepare("SELECT COUNT(*) as count FROM multimeter_tests");
    mulCount.step();
    console.log('Multimeter tests count:', mulCount.getAsObject().count);
    mulCount.free();
  } catch (e) {
    console.error('Error reading multimeter_tests:', e.message);
  }
}

checkDb();
