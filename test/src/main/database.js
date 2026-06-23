// ─────────────────────────────────────────────
// src/main/database.js — WASM SQLite Storage
// ─────────────────────────────────────────────
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DATA_FILE = 'database.db';
let dataPath = '';
let db = null;

// Helper to sanitize parameters for sql.js prepared statements
function cleanParams(params) {
  return params.map(p => (p === undefined || p === null) ? null : p);
}

// Helper to run query and return all rows mapped to objects
function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(cleanParams(params));
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper to run query and return the first row
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

// Helper to execute a statement
function runSql(sql, params = []) {
  if (!db) return;
  const stmt = db.prepare(sql);
  stmt.run(cleanParams(params));
  stmt.free();
}

async function init() {
  try {
    dataPath = path.join(app.getPath('userData'), DATA_FILE);
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize WebAssembly SQL.js
    const SQL = await initSqlJs();

    if (fs.existsSync(dataPath)) {
      try {
        const filebuffer = fs.readFileSync(dataPath);
        db = new SQL.Database(filebuffer);
        console.log('[DB] Loaded SQLite database from:', dataPath);
      } catch (err) {
        console.error('[DB] Corrupt database file. Backing it up and recreating.');
        const corruptBackup = `${dataPath}.corrupt-${Date.now()}.bak`;
        try {
          fs.copyFileSync(dataPath, corruptBackup);
        } catch (_) {}
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
      console.log('[DB] Created new SQLite database in memory');
    }

    // Create tables if they do not exist
    runSql(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY,
        projectName TEXT,
        customerName TEXT,
        clientName TEXT,
        clientAddress TEXT,
        clientPhone TEXT,
        clientEmail TEXT,
        clientContactName TEXT,
        clientContactEmail TEXT,
        clientNotes TEXT,
        facilityName TEXT,
        facilityAddress TEXT,
        facilityManager TEXT,
        facilityPhone TEXT,
        facilityNotes TEXT,
        location TEXT,
        motorUtilityTag TEXT,
        motorSerialNumber TEXT,
        motorManufacturer TEXT,
        motorModelNumber TEXT,
        manufacturingStandard TEXT,
        date TEXT,
        operatorName TEXT,
        equipmentType TEXT,
        powerKw TEXT,
        speedRpm TEXT,
        lineVoltage TEXT,
        cosFi TEXT,
        nominalCurrent TEXT,
        statorConnection TEXT,
        rotorConnection TEXT,
        rotorVoltage TEXT,
        rotorCurrent TEXT,
        efficiency TEXT,
        insulationClass TEXT,
        rotorBars TEXT,
        remark TEXT,
        testingLocation TEXT,
        wireMarkingT1 TEXT,
        wireMarkingT2 TEXT,
        wireMarkingT3 TEXT,
        testVoltagePiDar TEXT,
        testVoltageStep TEXT,
        testVoltageRamp TEXT,
        correctWindingTo20 INTEGER,
        correctInsulationTo40 INTEGER,
        temperature TEXT,
        notes TEXT,
        createdAt TEXT
      )
    `);

    runSql(`
      CREATE TABLE IF NOT EXISTS insulation_tests (
        recordId INTEGER,
        tab TEXT,
        tableId TEXT,
        time INTEGER,
        voltage TEXT,
        actualVoltage TEXT,
        current TEXT,
        resistance TEXT
      )
    `);

    runSql(`
      CREATE TABLE IF NOT EXISTS insulation_meta (
        recordId INTEGER,
        tab TEXT,
        tableId TEXT,
        metaJson TEXT,
        PRIMARY KEY (recordId, tab, tableId)
      )
    `);

    runSql(`
      CREATE TABLE IF NOT EXISTS multimeter_tests (
        recordId INTEGER,
        field TEXT,
        value TEXT,
        temperature TEXT,
        frequency TEXT,
        PRIMARY KEY (recordId, field)
      )
    `);

    // Run Migration check
    await migrateFromLegacyJson();

    saveSync();
  } catch (err) {
    console.error('[DB] Failed to initialize storage:', err);
  }
}

async function migrateFromLegacyJson() {
  const legacyPath = path.join(app.getPath('userData'), 'testing_records_v1.json');
  if (!fs.existsSync(legacyPath)) return;

  try {
    console.log('[DB] Found legacy JSON database. Beginning migration...');
    const raw = fs.readFileSync(legacyPath, 'utf8');
    const legacyData = JSON.parse(raw);

    runSql('BEGIN TRANSACTION');

    if (legacyData.records && Array.isArray(legacyData.records)) {
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
      for (const r of legacyData.records) {
        stmt.run(cleanParams([
          r.id, r.projectName || '', r.customerName || '', r.clientName || '', r.clientAddress || '', r.clientPhone || '', r.clientEmail || '',
          r.clientContactName || '', r.clientContactEmail || '', r.clientNotes || '', r.facilityName || '', r.facilityAddress || '',
          r.facilityManager || '', r.facilityPhone || '', r.facilityNotes || '', r.location || '', r.motorUtilityTag || '',
          r.motorSerialNumber || '', r.motorManufacturer || '', r.motorModelNumber || '', r.manufacturingStandard || '',
          r.date || '', r.operatorName || '', r.equipmentType || 'Induction Motor', r.powerKw || '', r.speedRpm || '', r.lineVoltage || '', r.cosFi || '',
          r.nominalCurrent || '', r.statorConnection || 'Star', r.rotorConnection || 'Star', r.rotorVoltage || '', r.rotorCurrent || '',
          r.efficiency || '', r.insulationClass || 'A', r.rotorBars || '', r.remark || '', r.testingLocation || 'Motor Junction Box', r.wireMarkingT1 || '',
          r.wireMarkingT2 || '', r.wireMarkingT3 || '', r.testVoltagePiDar || '500V', r.testVoltageStep || '', r.testVoltageRamp || '',
          r.correctWindingTo20 ? 1 : 0, r.correctInsulationTo40 ? 1 : 0, r.temperature || '', r.notes || '', r.createdAt || new Date().toISOString()
        ]));
      }
      stmt.free();
      console.log(`[DB] Migrated ${legacyData.records.length} records.`);
    }

    if (legacyData.insulation) {
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

      for (const [recordId, recordObj] of Object.entries(legacyData.insulation)) {
        const rId = Number(recordId);
        if (isNaN(rId)) continue;
        for (const [tab, tabObj] of Object.entries(recordObj)) {
          for (const [tableId, tableVal] of Object.entries(tabObj)) {
            if (tableId.endsWith('_meta')) {
              stmtMeta.run(cleanParams([rId, tab, tableId.replace(/_meta$/, ''), JSON.stringify(tableVal)]));
            } else if (Array.isArray(tableVal)) {
              for (const row of tableVal) {
                stmtTest.run(cleanParams([rId, tab, tableId, row.time, row.voltage, row.actualVoltage, row.current, row.resistance]));
              }
            }
          }
        }
      }
      stmtTest.free();
      stmtMeta.free();
      console.log('[DB] Migrated insulation test data.');
    }

    if (legacyData.multimeter) {
      const insertMultiSql = `
        INSERT OR REPLACE INTO multimeter_tests (recordId, field, value, temperature, frequency)
        VALUES (?, ?, ?, ?, ?)
      `;
      const stmtMulti = db.prepare(insertMultiSql);
      for (const [recordId, recordObj] of Object.entries(legacyData.multimeter)) {
        const rId = Number(recordId);
        if (isNaN(rId)) continue;
        for (const [field, fieldVal] of Object.entries(recordObj)) {
          if (fieldVal) {
            stmtMulti.run(cleanParams([rId, field, fieldVal.value, fieldVal.temperature, fieldVal.frequency]));
          }
        }
      }
      stmtMulti.free();
      console.log('[DB] Migrated multimeter test data.');
    }

    runSql('COMMIT');

    // Safety backup rename
    const backupPath = `${legacyPath}.migrated-backup`;
    fs.renameSync(legacyPath, backupPath);
    console.log(`[DB] Migration complete. Legacy JSON backed up to: ${backupPath}`);
  } catch (migrationErr) {
    runSql('ROLLBACK');
    console.error('[DB] Migration failed, database rolled back:', migrationErr);
  }
}

function saveSync() {
  if (!db || !dataPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpPath = `${dataPath}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    try {
      fs.renameSync(tmpPath, dataPath);
    } catch (renameErr) {
      fs.copyFileSync(tmpPath, dataPath);
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  } catch (err) {
    console.error('[DB] Failed to save database file:', err);
  }
}

function flush() {
  saveSync();
}

function getStorageInfo() {
  // Count records
  const row = queryOne('SELECT COUNT(*) as count FROM records');
  return {
    dataPath,
    recordCount: row ? row.count : 0,
    userDataDir: app.getPath('userData'),
  };
}

function getAllRecords() {
  const rows = queryAll('SELECT * FROM records ORDER BY id DESC');
  return rows.map(r => ({
    ...r,
    correctWindingTo20: !!r.correctWindingTo20,
    correctInsulationTo40: !!r.correctInsulationTo40
  }));
}

function createRecord(d) {
  const id = Date.now();
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
  runSql(insertRecordSql, [
    id, d.projectName || '', d.customerName || '', d.clientName || '', d.clientAddress || '', d.clientPhone || '', d.clientEmail || '',
    d.clientContactName || '', d.clientContactEmail || '', d.clientNotes || '', d.facilityName || '', d.facilityAddress || '',
    d.facilityManager || '', d.facilityPhone || '', d.facilityNotes || '', d.location || '', d.motorUtilityTag || '',
    d.motorSerialNumber || '', d.motorManufacturer || '', d.motorModelNumber || '', d.manufacturingStandard || '',
    d.date || '', d.operatorName || '', d.equipmentType || 'Induction Motor', d.powerKw || '', d.speedRpm || '', d.lineVoltage || '', d.cosFi || '',
    d.nominalCurrent || '', d.statorConnection || 'Star', d.rotorConnection || 'Star', d.rotorVoltage || '', d.rotorCurrent || '',
    d.efficiency || '', d.insulationClass || 'A', d.rotorBars || '', d.remark || '', d.testingLocation || 'Motor Junction Box', d.wireMarkingT1 || '',
    d.wireMarkingT2 || '', d.wireMarkingT3 || '', d.testVoltagePiDar || '500V', d.testVoltageStep || '', d.testVoltageRamp || '',
    d.correctWindingTo20 ? 1 : 0, d.correctInsulationTo40 ? 1 : 0, d.temperature || '', d.notes || '', new Date().toISOString()
  ]);
  saveSync();
  return getRecord(id);
}

function getRecord(id) {
  const row = queryOne('SELECT * FROM records WHERE id = ?', [Number(id)]);
  if (!row) return null;
  return {
    ...row,
    correctWindingTo20: !!row.correctWindingTo20,
    correctInsulationTo40: !!row.correctInsulationTo40
  };
}

function updateRecord(id, d) {
  const keys = Object.keys(d).filter(k => k !== 'id');
  if (keys.length > 0) {
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const params = keys.map(k => {
      if (k === 'correctWindingTo20' || k === 'correctInsulationTo40') {
        return d[k] ? 1 : 0;
      }
      return d[k];
    });
    params.push(Number(id));
    runSql(`UPDATE records SET ${setClause} WHERE id = ?`, params);
    saveSync();
  }
  return getRecord(id);
}

function nextCopyClientName(baseClientName) {
  const base = (baseClientName || '').replace(/\s*\(\d+\)\s*$/, '').trim();
  let maxN = 0;
  const rows = queryAll('SELECT clientName FROM records');
  rows.forEach(r => {
    const cn = (r.clientName || '').trim();
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = cn.match(new RegExp(`^${escaped}\\s*\\((\\d+)\\)\\s*$`));
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  });
  return `${base} (${maxN + 1})`;
}

function duplicateRecord(id) {
  const original = getRecord(id);
  if (!original) return null;
  const { id: _, createdAt: __, ...rest } = original;

  const newClientName = nextCopyClientName(rest.clientName);
  const newRecord = createRecord({ ...rest, clientName: newClientName });

  // Duplicate insulation tests
  runSql(`
    INSERT INTO insulation_tests (recordId, tab, tableId, time, voltage, actualVoltage, current, resistance)
    SELECT ?, tab, tableId, time, voltage, actualVoltage, current, resistance FROM insulation_tests WHERE recordId = ?
  `, [newRecord.id, original.id]);

  // Duplicate insulation meta
  runSql(`
    INSERT INTO insulation_meta (recordId, tab, tableId, metaJson)
    SELECT ?, tab, tableId, metaJson FROM insulation_meta WHERE recordId = ?
  `, [newRecord.id, original.id]);

  // Duplicate multimeter tests
  runSql(`
    INSERT INTO multimeter_tests (recordId, field, value, temperature, frequency)
    SELECT ?, field, value, temperature, frequency FROM multimeter_tests WHERE recordId = ?
  `, [newRecord.id, original.id]);

  saveSync();
  return newRecord;
}

function deleteRecord(id) {
  const numId = Number(id);
  runSql('DELETE FROM records WHERE id = ?', [numId]);
  runSql('DELETE FROM insulation_tests WHERE recordId = ?', [numId]);
  runSql('DELETE FROM insulation_meta WHERE recordId = ?', [numId]);
  runSql('DELETE FROM multimeter_tests WHERE recordId = ?', [numId]);
  saveSync();
  return { success: true };
}

function saveInsulationRow(recordId, tab, tableId, row) {
  runSql(`
    INSERT INTO insulation_tests (recordId, tab, tableId, time, voltage, actualVoltage, current, resistance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [Number(recordId), tab, tableId, row.time, row.voltage, row.actualVoltage, row.current, row.resistance]);
  saveSync();
  return { success: true };
}

function getInsulationData(recordId) {
  const result = {};
  const rId = Number(recordId);

  // Fetch tests
  const tests = queryAll('SELECT * FROM insulation_tests WHERE recordId = ?', [rId]);
  for (const t of tests) {
    if (!result[t.tab]) result[t.tab] = {};
    if (!result[t.tab][t.tableId]) result[t.tab][t.tableId] = [];
    result[t.tab][t.tableId].push({
      time: t.time,
      voltage: t.voltage,
      actualVoltage: t.actualVoltage,
      current: t.current,
      resistance: Number(t.resistance)
    });
  }

  // Fetch meta
  const metas = queryAll('SELECT * FROM insulation_meta WHERE recordId = ?', [rId]);
  for (const m of metas) {
    if (!result[m.tab]) result[m.tab] = {};
    try {
      result[m.tab][m.tableId + '_meta'] = JSON.parse(m.metaJson);
    } catch {
      result[m.tab][m.tableId + '_meta'] = {};
    }
  }

  return result;
}

function clearInsulationTab(recordId, tab, tableId) {
  const rId = Number(recordId);
  if (tableId) {
    runSql('DELETE FROM insulation_tests WHERE recordId = ? AND tab = ? AND tableId = ?', [rId, tab, tableId]);
  } else {
    runSql('DELETE FROM insulation_tests WHERE recordId = ? AND tab = ?', [rId, tab]);
    runSql('DELETE FROM insulation_meta WHERE recordId = ? AND tab = ?', [rId, tab]);
  }
  saveSync();
  return { success: true };
}

function renameInsulationTable(recordId, tab, oldTableId, newTableId) {
  const rId = Number(recordId);
  runSql('UPDATE insulation_tests SET tableId = ? WHERE recordId = ? AND tab = ? AND tableId = ?', [newTableId, rId, tab, oldTableId]);
  runSql('UPDATE insulation_meta SET tableId = ? WHERE recordId = ? AND tab = ? AND tableId = ?', [newTableId, rId, tab, oldTableId]);
  saveSync();
  return { success: true };
}

function deleteInsulationTable(recordId, tab, tableId) {
  const rId = Number(recordId);
  runSql('DELETE FROM insulation_tests WHERE recordId = ? AND tab = ? AND tableId = ?', [rId, tab, tableId]);
  runSql('DELETE FROM insulation_meta WHERE recordId = ? AND tab = ? AND tableId = ?', [rId, tab, tableId]);
  saveSync();
  return { success: true };
}

function saveInsulationMeta(recordId, tab, tableId, meta) {
  runSql(`
    INSERT OR REPLACE INTO insulation_meta (recordId, tab, tableId, metaJson)
    VALUES (?, ?, ?, ?)
  `, [Number(recordId), tab, tableId, JSON.stringify(meta)]);
  saveSync();
  return { success: true };
}

function saveMultimeterField(recordId, field, value, temperature, frequency) {
  const rId = Number(recordId);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const existing = queryOne('SELECT * FROM multimeter_tests WHERE recordId = ? AND field = ?', [rId, field]) || {};
    const updates = value;
    const newValue = (updates.hasOwnProperty('value') && updates.value !== undefined)
      ? updates.value
      : existing.value;
    const newTemp = updates.hasOwnProperty('temperature')
      ? updates.temperature
      : (existing.temperature || 0);
    const newFreq = updates.hasOwnProperty('frequency')
      ? updates.frequency
      : existing.frequency;

    if (newValue === undefined || newValue === null) {
      runSql('DELETE FROM multimeter_tests WHERE recordId = ? AND field = ?', [rId, field]);
    } else {
      runSql(`
        INSERT OR REPLACE INTO multimeter_tests (recordId, field, value, temperature, frequency)
        VALUES (?, ?, ?, ?, ?)
      `, [rId, field, String(newValue), String(newTemp), String(newFreq)]);
    }
  } else {
    if (value !== undefined && value !== null) {
      const existing = queryOne('SELECT * FROM multimeter_tests WHERE recordId = ? AND field = ?', [rId, field]) || {};
      const newTemp = temperature !== undefined && temperature !== null ? temperature : (existing.temperature || 0);
      const newFreq = frequency !== undefined && frequency !== null ? frequency : existing.frequency;
      runSql(`
        INSERT OR REPLACE INTO multimeter_tests (recordId, field, value, temperature, frequency)
        VALUES (?, ?, ?, ?, ?)
      `, [rId, field, String(value), String(newTemp), String(newFreq)]);
    } else {
      runSql('DELETE FROM multimeter_tests WHERE recordId = ? AND field = ?', [rId, field]);
    }
  }
  saveSync();
  return { success: true };
}

function getMultimeterData(recordId) {
  const result = {};
  const rows = queryAll('SELECT * FROM multimeter_tests WHERE recordId = ?', [Number(recordId)]);
  for (const r of rows) {
    result[r.field] = {
      value: r.value,
      temperature: r.temperature,
      frequency: r.frequency
    };
  }
  return result;
}

function clearRecordTestData(recordId) {
  const rId = Number(recordId);
  runSql('DELETE FROM insulation_tests WHERE recordId = ?', [rId]);
  runSql('DELETE FROM insulation_meta WHERE recordId = ?', [rId]);
  runSql('DELETE FROM multimeter_tests WHERE recordId = ?', [rId]);
  saveSync();
  return { success: true };
}

module.exports = {
  init,
  flush,
  getStorageInfo,
  getAllRecords,
  createRecord,
  getRecord,
  updateRecord,
  duplicateRecord,
  deleteRecord,
  saveInsulationRow,
  getInsulationData,
  clearInsulationTab,
  renameInsulationTable,
  deleteInsulationTable,
  saveInsulationMeta,
  saveMultimeterField,
  getMultimeterData,
  clearRecordTestData,
};
