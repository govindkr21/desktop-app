const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const backupPath = 'c:\\Users\\HITIKA\\OneDrive\\Documents\\oldAppBackup21-6.json';
const dbPath = path.join(process.env.APPDATA, 'Sarox Winding & Insulation Tester V2', 'database.db');
const targetId = 1781338708543;

function cleanParams(params) {
  return params.map(p => (p === undefined || p === null) ? null : p);
}

async function runMigration() {
  console.log('Loading sql.js...');
  const SQL = await initSqlJs();

  console.log('Reading database from:', dbPath);
  if (!fs.existsSync(dbPath)) {
    console.error('SQLite database.db not found!');
    return;
  }
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);

  console.log('Reading backup JSON file...');
  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

  const record = backupData.records.find(r => r.id === targetId);
  if (!record) {
    console.error(`Record with ID ${targetId} not found in backup!`);
    return;
  }

  // Check if record already exists in database
  const checkStmt = db.prepare('SELECT id FROM records WHERE id = ?');
  checkStmt.bind([targetId]);
  const exists = checkStmt.step();
  checkStmt.free();

  if (exists) {
    console.warn(`Warning: Record ${targetId} already exists in SQLite database. We will delete it first to do a clean overwrite.`);
    db.run('DELETE FROM records WHERE id = ?', [targetId]);
    db.run('DELETE FROM insulation_tests WHERE recordId = ?', [targetId]);
    db.run('DELETE FROM insulation_meta WHERE recordId = ?', [targetId]);
  }

  db.run('BEGIN TRANSACTION');

  // 1. Insert record details
  const insertRecordSql = `
    INSERT INTO records (
      id, projectName, customerName, clientName, clientAddress, clientPhone, clientEmail,
      clientContactName, clientContactEmail, clientNotes, facilityName, facilityAddress,
      facilityManager, facilityPhone, facilityNotes, location, motorUtilityTag,
      motorSerialNumber, motorManufacturer, motorModelNumber, manufacturingStandard,
      date, operatorName, equipmentType, powerKw, speedRpm, lineVoltage, cosFi,
      nominalCurrent, statorConnection, rotorConnection, rotorVoltage, rotorCurrent,
      efficiency, insulationClass, rotorBars, remark, testingLocation, wireMarkingT1,
      wireMarkingT2, wireMarkingT3, testVoltagePiDar, testVoltageStep, testVoltageRamp,
      correctWindingTo20, correctInsulationTo40, temperature, notes, createdAt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `;
  
  const stmt = db.prepare(insertRecordSql);
  stmt.run(cleanParams([
    record.id, record.projectName || '', record.customerName || '', record.clientName || '', record.clientAddress || '', record.clientPhone || '', record.clientEmail || '',
    record.clientContactName || '', record.clientContactEmail || '', record.clientNotes || '', record.facilityName || '', record.facilityAddress || '',
    record.facilityManager || '', record.facilityPhone || '', record.facilityNotes || '', record.location || '', record.motorUtilityTag || '',
    record.motorSerialNumber || '', record.motorManufacturer || '', record.motorModelNumber || '', record.manufacturingStandard || '',
    record.date || '', record.operatorName || '', record.equipmentType || 'Induction Motor', record.powerKw || '', record.speedRpm || '', record.lineVoltage || '', record.cosFi || '',
    record.nominalCurrent || '', record.statorConnection || 'Star', record.rotorConnection || 'Star', record.rotorVoltage || '', record.rotorCurrent || '',
    record.efficiency || '', record.insulationClass || 'A', record.rotorBars || '', record.remark || '', record.testingLocation || 'Motor Junction Box', record.wireMarkingT1 || '',
    record.wireMarkingT2 || '', record.wireMarkingT3 || '', record.testVoltagePiDar || '500V', record.testVoltageStep || '', record.testVoltageRamp || '',
    record.correctWindingTo20 ? 1 : 0, record.correctInsulationTo40 ? 1 : 0, record.temperature || '', record.notes || '', record.createdAt || new Date().toISOString()
  ]));
  stmt.free();
  console.log(`[Migration] Inserted record details for "${record.clientName}" (${record.motorUtilityTag}).`);

  // 2. Insert insulation tests and meta
  if (backupData.insulation && backupData.insulation[targetId]) {
    const recordInsulation = backupData.insulation[targetId];
    
    const insertTestSql = `
      INSERT INTO insulation_tests (recordId, tab, tableId, time, voltage, actualVoltage, current, resistance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const insertMetaSql = `
      INSERT OR REPLACE INTO insulation_meta (recordId, tab, tableId, metaJson)
      VALUES (?, ?, ?, ?)
    `;
    const stmtTest = db.prepare(insertTestSql);
    const stmtMeta = db.prepare(insertMetaSql);

    let testRowCount = 0;
    let metaCount = 0;

    for (const [tab, tabObj] of Object.entries(recordInsulation)) {
      for (const [tableId, tableVal] of Object.entries(tabObj)) {
        if (tableId.endsWith('_meta')) {
          stmtMeta.run(cleanParams([targetId, tab, tableId.replace(/_meta$/, ''), JSON.stringify(tableVal)]));
          metaCount++;
        } else if (Array.isArray(tableVal)) {
          for (const row of tableVal) {
            stmtTest.run(cleanParams([targetId, tab, tableId, row.time, row.voltage, row.actualVoltage, row.current, row.resistance]));
            testRowCount++;
          }
        }
      }
    }
    stmtTest.free();
    stmtMeta.free();
    console.log(`[Migration] Inserted ${testRowCount} insulation test rows and ${metaCount} metadata objects.`);
  } else {
    console.log('[Migration] No insulation data found for this record ID in the backup.');
  }

  db.run('COMMIT');

  // Save changes to database.db
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${dbPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, dbPath);

  console.log('[Migration] Database saved successfully. Migration complete!');
}

runMigration().catch(err => {
  console.error('[Migration] Error occurred during migration:', err);
});
