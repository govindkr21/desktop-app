// ─────────────────────────────────────────────
// src/main/database.js — JSON-File Based Storage
// ─────────────────────────────────────────────
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = 'testing_records_v1.json';

let dataPath = '';
let data = { records: [], insulation: {}, multimeter: {} };

function getLegacyDataPaths() {
  const appData = app.getPath('appData');
  const folderNames = [
    'ElectricalTestingSuite',
    'electrical-testing-suite',
    'Electrical Testing Suite',
    'Sarox Technology Inc.',
    'sarox-technology-inc',
    'Electron',
  ];
  const seen = new Set();
  const paths = [];
  for (const name of folderNames) {
    const p = path.join(appData, name, DATA_FILE);
    if (!seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase());
      paths.push(p);
    }
  }
  return paths;
}

function loadFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.records) parsed.records = [];
  if (!parsed.insulation) parsed.insulation = {};
  if (!parsed.multimeter) parsed.multimeter = {};
  return parsed;
}

function mergeFromLegacy() {
  const legacyPaths = getLegacyDataPaths().filter(p => {
    if (!fs.existsSync(p)) return false;
    try {
      return path.resolve(p) !== path.resolve(dataPath);
    } catch {
      return true;
    }
  });

  let mergedCount = 0;
  for (const legacyPath of legacyPaths) {
    try {
      const loaded = loadFromFile(legacyPath);
      let fileMergedCount = 0;
      if (loaded.records && Array.isArray(loaded.records)) {
        for (const rec of loaded.records) {
          // Check if record already exists in current data
          const exists = data.records.some(r => r.id === rec.id);
          if (!exists) {
            data.records.push(rec);
            fileMergedCount++;
            mergedCount++;
            
            // Copy insulation data if available
            if (loaded.insulation && loaded.insulation[rec.id]) {
              data.insulation[rec.id] = loaded.insulation[rec.id];
            }
            // Copy multimeter data if available
            if (loaded.multimeter && loaded.multimeter[rec.id]) {
              data.multimeter[rec.id] = loaded.multimeter[rec.id];
            }
          }
        }
      }
      if (fileMergedCount > 0) {
        console.log(`[DB] Merged ${fileMergedCount} records from legacy file: ${legacyPath}`);
      }
    } catch (err) {
      console.warn('[DB] Could not read or merge legacy file:', legacyPath, err.message);
    }
  }

  if (mergedCount > 0) {
    // Sort records descending by id
    data.records.sort((a, b) => b.id - a.id);
    save();
    console.log(`[DB] Successfully merged a total of ${mergedCount} legacy records.`);
    return true;
  }
  return false;
}

function init() {
  try {
    dataPath = path.join(app.getPath('userData'), DATA_FILE);
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(dataPath)) {
      try {
        data = loadFromFile(dataPath);
        console.log('[DB] Loaded', data.records.length, 'record(s) from:', dataPath);
      } catch (parseErr) {
        const backupPath = `${dataPath}.corrupt-${Date.now()}.bak`;
        try {
          fs.copyFileSync(dataPath, backupPath);
          console.error('[DB] Corrupt data file backed up to:', backupPath);
        } catch (copyErr) {
          console.error('[DB] Could not backup corrupt file:', copyErr.message);
        }
        data = { records: [], insulation: {}, multimeter: {} };
      }
    } else {
      data = { records: [], insulation: {}, multimeter: {} };
      console.log('[DB] No data file yet at:', dataPath);
    }

    // Always attempt to merge legacy data to ensure all records from packaged/development runs are present
    mergeFromLegacy();

    if (!data.records.length) {
      console.log('[DB] No records found. Data will be saved to:', dataPath);
    }
  } catch (err) {
    console.error('[DB] Failed to initialize storage:', err);
    data = { records: [], insulation: {}, multimeter: {} };
  }
}

function save() {
  if (!dataPath) return;
  try {
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${dataPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, dataPath);
  } catch (err) {
    console.error('[DB] Failed to save database:', err);
    throw err;
  }
}

function flush() {
  save();
}

function getStorageInfo() {
  return {
    dataPath,
    recordCount: data.records.length,
    userDataDir: app.getPath('userData'),
  };
}

function getAllRecords() {
  return [...data.records].sort((a, b) => b.id - a.id);
}

function createRecord(d) {
  const rec = {
    id: Date.now(),
    projectName: d.projectName || '',
    customerName: d.customerName || '',
    clientName: d.clientName || '',
    clientAddress: d.clientAddress || '',
    clientPhone: d.clientPhone || '',
    clientEmail: d.clientEmail || '',
    clientContactName: d.clientContactName || '',
    clientContactEmail: d.clientContactEmail || '',
    clientNotes: d.clientNotes || '',

    facilityName: d.facilityName || '',
    facilityAddress: d.facilityAddress || '',
    facilityManager: d.facilityManager || '',
    facilityPhone: d.facilityPhone || '',
    facilityNotes: d.facilityNotes || '',

    location: d.location || '',
    motorUtilityTag: d.motorUtilityTag || '',
    motorSerialNumber: d.motorSerialNumber || '',
    motorManufacturer: d.motorManufacturer || '',
    motorModelNumber: d.motorModelNumber || '',
    manufacturingStandard: d.manufacturingStandard || '',
    date: d.date || '',
    operatorName: d.operatorName || '',

    equipmentType: d.equipmentType || 'Induction Motor',
    powerKw: d.powerKw || '',
    speedRpm: d.speedRpm || '',
    lineVoltage: d.lineVoltage || '',
    cosFi: d.cosFi || '',
    nominalCurrent: d.nominalCurrent || '',
    statorConnection: d.statorConnection || 'Star',
    rotorConnection: d.rotorConnection || 'Star',
    rotorVoltage: d.rotorVoltage || '',
    rotorCurrent: d.rotorCurrent || '',
    efficiency: d.efficiency || '',
    insulationClass: d.insulationClass || 'A',
    rotorBars: d.rotorBars || '',
    remark: d.remark || '',

    testingLocation: d.testingLocation || 'Motor Junction Box',
    wireMarkingT1: d.wireMarkingT1 || '',
    wireMarkingT2: d.wireMarkingT2 || '',
    wireMarkingT3: d.wireMarkingT3 || '',
    testVoltagePiDar: d.testVoltagePiDar || '500V',
    testVoltageStep: d.testVoltageStep || '',
    testVoltageRamp: d.testVoltageRamp || '',

    correctWindingTo20: d.correctWindingTo20 || false,
    correctInsulationTo40: d.correctInsulationTo40 || false,

    temperature: d.temperature || '',

    notes: d.notes || '',
    createdAt: new Date().toISOString(),
  };
  data.records.push(rec);
  save();
  return rec;
}

function getRecord(id) {
  const numId = Number(id);
  return data.records.find(r => Number(r.id) === numId) || null;
}

function updateRecord(id, d) {
  const numId = Number(id);
  const idx = data.records.findIndex(r => Number(r.id) === numId);
  if (idx === -1) return null;
  const originalId = data.records[idx].id;
  data.records[idx] = { ...data.records[idx], ...d, id: originalId };
  save();
  return data.records[idx];
}

function duplicateRecord(id) {
  const original = getRecord(id);
  if (!original) return null;
  const { id: _, createdAt: __, ...rest } = original;
  return createRecord({ ...rest, projectName: rest.projectName + ' (Copy)' });
}

function deleteRecord(id) {
  const numId = Number(id);
  data.records = data.records.filter(r => Number(r.id) !== numId);
  delete data.insulation[numId];
  delete data.multimeter[numId];
  save();
  return { success: true };
}

function saveInsulationRow(recordId, tab, tableId, row) {
  if (!data.insulation[recordId]) data.insulation[recordId] = {};
  if (!data.insulation[recordId][tab]) data.insulation[recordId][tab] = {};
  if (!data.insulation[recordId][tab][tableId]) data.insulation[recordId][tab][tableId] = [];
  data.insulation[recordId][tab][tableId].push(row);
  save();
  return { success: true };
}

function getInsulationData(recordId) {
  return data.insulation[recordId] || {};
}

function clearInsulationTab(recordId, tab, tableId) {
  if (data.insulation[recordId] && data.insulation[recordId][tab]) {
    if (tableId) {
      data.insulation[recordId][tab][tableId] = [];
    } else {
      data.insulation[recordId][tab] = {};
    }
    save();
  }
  return { success: true };
}

function renameInsulationTable(recordId, tab, oldTableId, newTableId) {
  if (data.insulation[recordId] && data.insulation[recordId][tab]) {
    const tableMap = data.insulation[recordId][tab];
    if (tableMap[oldTableId]) {
      tableMap[newTableId] = tableMap[oldTableId];
      delete tableMap[oldTableId];
      
      // Also rename metadata if it exists
      if (tableMap[oldTableId + '_meta']) {
        tableMap[newTableId + '_meta'] = tableMap[oldTableId + '_meta'];
        delete tableMap[oldTableId + '_meta'];
      }
      
      save();
      return { success: true };
    }
  }
  return { success: false, error: 'Table not found' };
}

function deleteInsulationTable(recordId, tab, tableId) {
  if (data.insulation[recordId] && data.insulation[recordId][tab]) {
    delete data.insulation[recordId][tab][tableId];
    delete data.insulation[recordId][tab][tableId + '_meta'];
    save();
  }
  return { success: true };
}

function saveInsulationMeta(recordId, tab, tableId, meta) {
  if (!data.insulation[recordId]) data.insulation[recordId] = {};
  if (!data.insulation[recordId][tab]) data.insulation[recordId][tab] = {};
  data.insulation[recordId][tab][tableId + '_meta'] = meta;
  save();
  return { success: true };
}

function saveMultimeterField(recordId, field, value, temperature, frequency) {
  if (!data.multimeter[recordId]) data.multimeter[recordId] = {};
  const existing = data.multimeter[recordId][field] || {};

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const updates = value;
    data.multimeter[recordId][field] = {
      value: updates.hasOwnProperty('value') ? updates.value : existing.value,
      temperature: updates.hasOwnProperty('temperature') ? updates.temperature : (existing.temperature || 0),
      frequency: updates.hasOwnProperty('frequency') ? updates.frequency : existing.frequency,
    };
  } else {
    data.multimeter[recordId][field] = {
      value: value !== undefined && value !== null ? value : existing.value,
      temperature: temperature !== undefined && temperature !== null ? temperature : (existing.temperature || 0),
      frequency: frequency !== undefined && frequency !== null ? frequency : existing.frequency,
    };
  }
  save();
  return { success: true };
}

function getMultimeterData(recordId) {
  return data.multimeter[recordId] || {};
}

function clearRecordTestData(recordId) {
  data.insulation[recordId] = {};
  data.multimeter[recordId] = {};
  save();
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
