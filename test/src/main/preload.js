// ─────────────────────────────────────────────
// src/main/preload.js  —  Secure IPC Bridge
// ─────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Records ─────────────────────────────────
  getAllRecords:    ()               => ipcRenderer.invoke('db:getAllRecords'),
  createRecord:    (data)           => ipcRenderer.invoke('db:createRecord', data),
  getRecord:       (id)             => ipcRenderer.invoke('db:getRecord', id),
  updateRecord:    (id, data)       => ipcRenderer.invoke('db:updateRecord', id, data),
  duplicateRecord: (id)             => ipcRenderer.invoke('db:duplicateRecord', id),
  deleteRecord:    (id)             => ipcRenderer.invoke('db:deleteRecord', id),

  // ── Insulation data ──────────────────────────
  saveInsulationRow:  (recordId, tab, tableId, row) => ipcRenderer.invoke('db:saveInsulationRow', recordId, tab, tableId, row),
  getInsulationData:  (recordId)                    => ipcRenderer.invoke('db:getInsulationData', recordId),
  clearInsulationTab: (recordId, tab, tableId)      => ipcRenderer.invoke('db:clearInsulationTab', recordId, tab, tableId),

  // ── Multimeter data ──────────────────────────
  saveMultimeterField: (recordId, field, value, temp, frequency) => ipcRenderer.invoke('db:saveMultimeterField', recordId, field, value, temp, frequency),
  getMultimeterData:   (recordId)                      => ipcRenderer.invoke('db:getMultimeterData', recordId),
  clearRecordTestData: (recordId)                      => ipcRenderer.invoke('db:clearRecordTestData', recordId),

  // ── Reports ──────────────────────────────────
  exportExcel: (recordId) => ipcRenderer.invoke('report:exportExcel', recordId),
  exportPDF:   (recordId) => ipcRenderer.invoke('report:exportPDF', recordId),

  // ── Shell ────────────────────────────────────
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // ── Serial port events (Phase 5 - device communication) ──
  // These will be wired up when serial.js is implemented
  onMeggerData:      (callback) => ipcRenderer.on('megger:data',      (_, row)   => callback(row)),
  onMeggerConnected: (callback) => ipcRenderer.on('megger:connected', ()         => callback()),
  onMeggerStopped:   (callback) => ipcRenderer.on('megger:stopped',   ()         => callback()),
  onMultimeterLive:  (callback) => ipcRenderer.on('multimeter:live',  (_, value) => callback(value)),
  onMultimeterConnected: (callback) => ipcRenderer.on('multimeter:connected', ()         => callback()),
  onMultimeterStopped:   (callback) => ipcRenderer.on('multimeter:stopped',   ()         => callback()),
  onDeviceError:     (callback) => ipcRenderer.on('device:error',     (_, msg)   => callback(msg)),
  removeAllListeners:(channel)  => ipcRenderer.removeAllListeners(channel),

  // ── Serial port management ───────────────────
  listSerialPorts:       ()                   => ipcRenderer.invoke('serial:listPorts'),
  connectMegger:         (portOrOpts, baudRate) => {
    if (typeof portOrOpts === 'object') {
      return ipcRenderer.invoke('serial:connectMegger', portOrOpts);
    }
    return ipcRenderer.invoke('serial:connectMegger', { portPath: portOrOpts, baudRate });
  },
  disconnectMegger:      ()                   => ipcRenderer.invoke('serial:disconnectMegger'),
  connectMultimeter:     (portOrOpts, baudRate) => {
    if (typeof portOrOpts === 'object') {
      return ipcRenderer.invoke('serial:connectMultimeter', portOrOpts);
    }
    return ipcRenderer.invoke('serial:connectMultimeter', { portPath: portOrOpts, baudRate });
  },
  disconnectMultimeter:  ()                   => ipcRenderer.invoke('serial:disconnectMultimeter'),
  sendMultimeterCommand: (mode, freq, secondary) => ipcRenderer.invoke('serial:sendMultimeterCommand', { mode, freq, secondary }),
});
