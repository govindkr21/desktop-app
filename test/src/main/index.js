// ─────────────────────────────────────────────
// src/main/index.js  —  Electron Main Process
// ─────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// Keep a global reference so window is not garbage collected
let mainWindow;

const createWindow = () => {
  console.log('Main Window Entry:', MAIN_WINDOW_WEBPACK_ENTRY);
  console.log('Preload Entry:', MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 650,
    title: 'Electrical Testing Suite',
    backgroundColor: '#f1f5f9',
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

  // Open DevTools in development — comment this out for production
  mainWindow.webContents.openDevTools();
};

// ── App lifecycle ─────────────────────────────
app.on('ready', () => {
  // Init database first
  const db = require('./database');
  db.init();

  createWindow();
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
ipcMain.handle('db:getAllRecords',    ()           => db().getAllRecords());
ipcMain.handle('db:createRecord',    (_, data)    => db().createRecord(data));
ipcMain.handle('db:getRecord',       (_, id)      => db().getRecord(id));
ipcMain.handle('db:updateRecord',    (_, id, data)=> db().updateRecord(id, data));
ipcMain.handle('db:duplicateRecord', (_, id)      => db().duplicateRecord(id));
ipcMain.handle('db:deleteRecord',    (_, id)      => db().deleteRecord(id));

// ── Insulation data ───────────────────────────
ipcMain.handle('db:saveInsulationRow',  (_, recordId, tab, tableId, row) => db().saveInsulationRow(recordId, tab, tableId, row));
ipcMain.handle('db:getInsulationData',  (_, recordId)                    => db().getInsulationData(recordId));
ipcMain.handle('db:clearInsulationTab', (_, recordId, tab, tableId)      => db().clearInsulationTab(recordId, tab, tableId));

// ── Multimeter data ───────────────────────────
ipcMain.handle('db:saveMultimeterField', (_, recordId, field, value, temp) => db().saveMultimeterField(recordId, field, value, temp));
ipcMain.handle('db:getMultimeterData',   (_, recordId)                      => db().getMultimeterData(recordId));
ipcMain.handle('db:clearRecordTestData', (_, recordId)                      => db().clearRecordTestData(recordId));

// ── Reports ───────────────────────────────────
ipcMain.handle('report:exportExcel', async (_, recordId) => {
  try {
    const reports = require('./reports');
    return await reports.exportExcel(recordId, mainWindow);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('report:exportPDF', async (_, recordId) => {
  try {
    const reports = require('./reports');
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
