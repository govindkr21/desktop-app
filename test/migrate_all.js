const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const backupPath = 'C:\\Users\\Dell\\Downloads\\oldAppBackup21-6.json';
const dbPath = 'C:\\Users\\Dell\\AppData\\Roaming\\Sarox Winding & Insulation Tester V2\\database.db';

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

  if (!backupData.records || !Array.isArray(backupData.records)) {
    console.error('No records array found in backup!');
    return;
  }

  db.run('BEGIN TRANSACTION');

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
  
  const insertTestSql = `
    INSERT INTO insulation_tests (recordId, tab, tableId, time, voltage, actualVoltage, current, resistance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const insertMetaSql = `
    INSERT OR REPLACE INTO insulation_meta (recordId, tab, tableId, metaJson)
    VALUES (?, ?, ?, ?)
  `;

  const stmtRecord = db.prepare(insertRecordSql);
  const stmtTest = db.prepare(insertTestSql);
  const stmtMeta = db.prepare(insertMetaSql);

  let recordCount = 0;
  let testRowCount = 0;
  let metaCount = 0;

  for (const record of backupData.records) {
    const targetId = record.id;

    // Check if record already exists in database
    const checkStmt = db.prepare('SELECT id FROM records WHERE id = ?');
    checkStmt.bind([targetId]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      // Overwrite: delete existing records and tests first
      db.run('DELETE FROM records WHERE id = ?', [targetId]);
      db.run('DELETE FROM insulation_tests WHERE recordId = ?', [targetId]);
      db.run('DELETE FROM insulation_meta WHERE recordId = ?', [targetId]);
    }

    // Insert record details
    stmtRecord.run(cleanParams([
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
    recordCount++;

    // Insert insulation tests and meta for this record
    if (backupData.insulation && backupData.insulation[targetId]) {
      const recordInsulation = backupData.insulation[targetId];
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
    }
  }

  stmtRecord.free();
  stmtTest.free();
  stmtMeta.free();

  db.run('COMMIT');

  // Save changes to database.db
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${dbPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, dbPath);

  console.log(`[Migration] Successfully migrated ${recordCount} records, ${testRowCount} insulation rows, and ${metaCount} metadata objects.`);
  console.log('[Migration] Database saved successfully. All records migrated!');
}

runMigration().catch(err => {
  console.error('[Migration] Error occurred during migration:', err);
});
