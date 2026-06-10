// ─────────────────────────────────────────────
// src/main/index.js  —  Electron Main Process
// ─────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, dialog, shell, powerMonitor } = require('electron');
const path = require('path');

// Must match packagerConfig.name so dev (`npm start`) and installed .exe share one data folder.
app.setName('Sarox Winding & Insulation Tester');

// Initialize file logging
const logger = require('./logger');
logger.init();

// ── Top-level requires so webpack asset-relocator traces native deps correctly ──
const _serial = require('./serial'); const serial = _serial.default || _serial;
const _reports = require('./reports'); const reports = _reports.default || _reports;

// Keep a global reference so window is not garbage collected
let mainWindow;

// Catch uncaught exceptions and unhandled rejections gracefully to prevent crash popups
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('device:error', 'Main Process Error: ' + err.message);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled Rejection:', reason);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('device:error', 'Main Process Rejection: ' + (reason ? reason.message || reason : 'Unknown rejection'));
  }
});

const createWindow = () => {
  console.log('Main Window Entry:', MAIN_WINDOW_WEBPACK_ENTRY);
  console.log('Preload Entry:', MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 650,
    title: 'Sarox Technology Inc.',
    backgroundColor: '#f1f5f9',
    icon: path.join(app.getAppPath(), 'src/assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open DevTools in development — uncomment for debugging
  // mainWindow.webContents.openDevTools();
};

// ── App lifecycle ─────────────────────────────
app.on('ready', () => {
  // Init database first
  const db = require('./database');
  db.init();

  createWindow();

  // Cleanly close serial ports when the laptop goes to sleep / suspends
  powerMonitor.on('suspend', () => {
    console.log('[Main] System suspending. Closing all active device connections.');
    try {
      serial.disconnectMegger();
      serial.disconnectMultimeter();
    } catch (err) {
      console.error('[Main] Error closing connections on suspend:', err.message);
    }
  });
});

app.on('before-quit', () => {
  try {
    require('./database').flush();
  } catch (e) {
    console.error('[DB] Flush on quit failed:', e.message);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─────────────────────────────────────────────
// IPC HANDLERS — called from React via window.electronAPI
// ─────────────────────────────────────────────

const db = () => require('./database');

// ── Records ───────────────────────────────────
ipcMain.handle('db:getAllRecords', () => db().getAllRecords());
ipcMain.handle('db:getStorageInfo', () => db().getStorageInfo());
ipcMain.handle('db:createRecord', (_, data) => db().createRecord(data));
ipcMain.handle('db:getRecord', (_, id) => db().getRecord(id));
ipcMain.handle('db:updateRecord', (_, id, data) => db().updateRecord(id, data));
ipcMain.handle('db:duplicateRecord', (_, id) => db().duplicateRecord(id));
ipcMain.handle('db:deleteRecord', (_, id) => db().deleteRecord(id));

// ── Insulation data ───────────────────────────
ipcMain.handle('db:saveInsulationRow', (_, recordId, tab, tableId, row) => db().saveInsulationRow(recordId, tab, tableId, row));
ipcMain.handle('db:getInsulationData', (_, recordId) => db().getInsulationData(recordId));
ipcMain.handle('db:clearInsulationTab', (_, recordId, tab, tableId) => db().clearInsulationTab(recordId, tab, tableId));
ipcMain.handle('db:renameInsulationTable', (_, recordId, tab, oldTableId, newTableId) => db().renameInsulationTable(recordId, tab, oldTableId, newTableId));
ipcMain.handle('db:deleteInsulationTable', (_, recordId, tab, tableId) => db().deleteInsulationTable(recordId, tab, tableId));
ipcMain.handle('db:saveInsulationMeta', (_, recordId, tab, tableId, meta) => db().saveInsulationMeta(recordId, tab, tableId, meta));

// ── Multimeter data ───────────────────────────
ipcMain.handle('db:saveMultimeterField', (_, recordId, field, value, temp, frequency) => db().saveMultimeterField(recordId, field, value, temp, frequency));
ipcMain.handle('db:getMultimeterData', (_, recordId) => db().getMultimeterData(recordId));
ipcMain.handle('db:clearRecordTestData', (_, recordId) => db().clearRecordTestData(recordId));

// ── Reports ───────────────────────────────────
ipcMain.handle('report:exportExcel', async (_, recordId) => {
  try {
    return await reports.exportExcel(recordId, mainWindow);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('report:exportPDF', async (_, recordId) => {
  try {
    return await reports.exportPDF(recordId, mainWindow);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Open file in explorer ─────────────────────
ipcMain.handle('shell:openPath', (_, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

ipcMain.handle('shell:openLogs', () => {
  const logPath = logger.getLogPath();
  if (logPath) {
    shell.showItemInFolder(logPath);
    return { success: true, logPath };
  }
  return { success: false, error: 'Logger not initialized' };
});

// ── Serial / Device connection ─────────────────
ipcMain.handle('serial:listPorts', async () => {
  try {
    const ports = await serial.listPorts();
    return { success: true, ports };
  } catch (err) {
    return { success: false, error: err.message, ports: [] };
  }
});

ipcMain.handle('serial:connectMegger', (_, options) => {
  try {
    serial.setWindow(mainWindow);
    serial.connectMegger(options);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('serial:disconnectMegger', () => {
  try {
    serial.disconnectMegger();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('serial:connectMultimeter', (_, options) => {
  try {
    serial.setWindow(mainWindow);
    serial.connectMultimeter(options);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('serial:disconnectMultimeter', () => {
  try {
    serial.disconnectMultimeter();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('serial:sendMultimeterCommand', (_, { mode, freq, secondary, equivalent }) => {
  try {
    serial.sendMultimeterCommand(mode, freq, secondary, equivalent);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

