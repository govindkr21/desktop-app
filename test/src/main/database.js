// ─────────────────────────────────────────────
// src/main/database.js — JSON-File Based Storage
// ─────────────────────────────────────────────
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let dataPath = '';
let data = { records: [], insulation: {}, multimeter: {} };

function init() {
  try {
    dataPath = path.join(app.getPath('userData'), 'testing_records_v1.json');
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      data = JSON.parse(raw);
    }
    if (!data.records) data.records = [];
    if (!data.insulation) data.insulation = {};
    if (!data.multimeter) data.multimeter = {};
    console.log('[DB] JSON storage ready at:', dataPath);
  } catch (err) {
    console.error('Failed to load database:', err);
    data = { records: [], insulation: {}, multimeter: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

function getAllRecords() {
  return [...data.records].sort((a,b) => b.id - a.id);
}

function createRecord(d) {
  const rec = {
    id: Date.now(),
    projectName: d.projectName || '',
    customerName: d.customerName || '',
    // Client Info:
    clientName: d.clientName || '',
    clientAddress: d.clientAddress || '',
    clientPhone: d.clientPhone || '',
    clientEmail: d.clientEmail || '',
    clientContactName: d.clientContactName || '',
    clientContactEmail: d.clientContactEmail || '',
    clientNotes: d.clientNotes || '',

    // Facility Info:
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

    // Nameplate Data:
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

    // Offline Tests Config:
    testingLocation: d.testingLocation || 'Motor Junction Box',
    wireMarkingT1: d.wireMarkingT1 || '',
    wireMarkingT2: d.wireMarkingT2 || '',
    wireMarkingT3: d.wireMarkingT3 || '',
    testVoltagePiDar: d.testVoltagePiDar || '500V',
    testVoltageStep: d.testVoltageStep || '',
    testVoltageRamp: d.testVoltageRamp || '',

    // Baseline Toggles:
    correctWindingTo20: d.correctWindingTo20 || false,
    correctInsulationTo40: d.correctInsulationTo40 || false,

    // Test temperature (used by insulation IEEE 43 correction)
    temperature: d.temperature || '',

    notes: d.notes || '',
    createdAt: new Date().toISOString()
  };
  data.records.push(rec);
  save();
  return rec;
}

function getRecord(id) {
  return data.records.find(r => r.id === id) || null;
}

function updateRecord(id, d) {
  const idx = data.records.findIndex(r => r.id === id);
  if (idx === -1) return null;
  data.records[idx] = { ...data.records[idx], ...d, id };
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
  data.records = data.records.filter(r => r.id !== id);
  delete data.insulation[id];
  delete data.multimeter[id];
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

function saveMultimeterField(recordId, field, value, temperature) {
  if (!data.multimeter[recordId]) data.multimeter[recordId] = {};
  data.multimeter[recordId][field] = { value, temperature: temperature || 0 };
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
  getAllRecords, createRecord, getRecord, updateRecord, duplicateRecord, deleteRecord,
  saveInsulationRow, getInsulationData, clearInsulationTab,
  saveMultimeterField, getMultimeterData, clearRecordTestData
};
