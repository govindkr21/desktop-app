const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function listRecords() {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.env.APPDATA, 'Sarox Winding & Insulation Tester V2', 'database.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('DB not found');
    return;
  }
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  const stmt = db.prepare('SELECT id, clientName, motorUtilityTag FROM records ORDER BY id DESC');
  console.log('ID | Client Name | Motor Tag');
  console.log('---------------------------');
  while (stmt.step()) {
    const r = stmt.getAsObject();
    console.log(`${r.id} | ${r.clientName} | ${r.motorUtilityTag}`);
  }
  stmt.free();
}

listRecords();
