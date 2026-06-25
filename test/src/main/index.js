// ─────────────────────────────────────────────
// src/main/index.js  —  Electron Main Process
// ─────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, dialog, shell, powerMonitor } = require('electron');
const path = require('path');

// Must match packagerConfig.name so dev (`npm start`) and installed .exe share one data folder.
app.setName('Sarox Winding & Insulation Tester V2');

// Initialize file logging
const logger = require('./logger');
logger.init();

// ── Top-level requires so webpack asset-relocator traces native deps correctly ──
const _serial = require('./serial'); const serial = _serial.default || _serial;
const _reports = require('./reports'); const reports = _reports.default || _reports;

// Keep a global reference so window is not garbage collected
let mainWindow;

// ── Crash safety: flush DB before any unhandled crash or rejection ──────────
//
// With sync writes (database.js) data is already on disk when this fires.
// These handlers are an extra safety net for any edge case.

function safeFlush(label) {
  try {
    require('./database').flush();
    console.log(`[DB] Flushed on ${label}.`);
  } catch (e) {
    console.error(`[DB] Flush on ${label} failed:`, e.message);
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err);
  safeFlush('uncaughtException');
  if (mainWindow && mainWindow.webContents) {
    try { mainWindow.webContents.send('device:error', 'Main Process Error: ' + err.message); } catch (_) {}
  }
  // Do not re-throw: keep the app running if possible so the user can save their work.
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason);
  safeFlush('unhandledRejection');
  if (mainWindow && mainWindow.webContents) {
    try { mainWindow.webContents.send('device:error', 'Main Process Rejection: ' + (reason ? reason.message || reason : 'Unknown rejection')); } catch (_) {}
  }
});

// process.on('exit') is the absolute last-resort — it fires synchronously on
// every exit path including SIGKILL. Only synchronous operations work here.
process.on('exit', (code) => {
  safeFlush('process exit (code=' + code + ')');
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
app.on('ready', async () => {
  // Init database first
  const db = require('./database');
  await db.init();

  createWindow();

  // Cleanly close serial ports when the laptop goes to sleep / suspends.
  // Also flush DB so data is safe if the system doesn't resume cleanly.
  powerMonitor.on('suspend', () => {
    console.log('[Main] System suspending. Flushing DB and closing device connections.');
    safeFlush('system suspend');
    try {
      serial.disconnectMegger();
      serial.disconnectMultimeter();
    } catch (err) {
      console.error('[Main] Error closing connections on suspend:', err.message);
    }
  });
});

app.on('before-quit', () => safeFlush('before-quit'));

// Flush on SIGTERM (system shutdown / Task Manager) and SIGINT (Ctrl+C).
// before-quit does NOT fire on these signals in some Electron versions.
['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, () => {
    console.log(`[Main] ${signal} received. Flushing database before exit.`);
    safeFlush(signal);
    process.exit(0);
  });
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
ipcMain.handle('report:exportExcel', async (_, recordId, chartImages) => {
  try {
    return await reports.exportExcel(recordId, mainWindow, chartImages);
  } catch (err) {
    console.error('Export Excel failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('report:exportPDF', async (_, recordId) => {
  try {
    return await reports.exportPDF(recordId, mainWindow);
  } catch (err) {
    console.error('Export PDF failed:', err);
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

ipcMain.handle('app:relaunch', () => {
  console.log('[Main] Relaunching application...');
  try {
    serial.disconnectMegger();
  } catch (_) {}
  try {
    serial.disconnectMultimeter();
  } catch (_) {}
  safeFlush('relaunch');
  if (app.isPackaged) {
    app.relaunch();
    app.exit(0);
  } else {
    if (mainWindow) {
      mainWindow.webContents.reload();
    }
  }
});

ipcMain.handle('serial:listPorts', async () => {
  try {
    const ports = await serial.listPorts();
    return { success: true, ports };
  } catch (err) {
    return { success: false, error: err.message, ports: [] };
  }
});

// Helper: wait for a connection result on the serial EventEmitter, or timeout.
// serial.deviceEvents emits 'megger:connected', 'multimeter:connected', 'device:error'.
function waitForConnection(successEvent, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const emitter = serial.deviceEvents;
    if (!emitter) { resolve(false); return; }
    let settled = false;

    const onSuccess = () => { if (!settled) { settled = true; cleanup(); resolve(true); } };
    const onError   = (msg) => { if (!settled) { settled = true; cleanup(); resolve(false); } };
    const cleanup = () => {
      emitter.removeListener(successEvent, onSuccess);
      emitter.removeListener('device:error',  onError);
    };

    emitter.once(successEvent, onSuccess);
    emitter.once('device:error', onError);

    setTimeout(() => {
      if (!settled) { settled = true; cleanup(); resolve(false); }
    }, timeoutMs);
  });
}

ipcMain.handle('serial:connectMegger', async (_, options) => {
  try {
    serial.setWindow(mainWindow);
    serial.connectMegger(options);

    // Wait up to 8s for the megger:connected event (or a device error).
    const connected = await waitForConnection('megger:connected', 8000);

    if (!connected) {
      try { serial.disconnectMegger(); } catch (_) {}
      const errMsg = 'Connection timed out. Check the COM port, baud rate, and that the Megger is powered on and set to TRANSMIT.';
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger: ' + errMsg);
      return { success: false, error: errMsg };
    }
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

ipcMain.handle('serial:connectMultimeter', async (_, options) => {
  try {
    serial.setWindow(mainWindow);
    serial.connectMultimeter(options);

    // Wait up to 8s for the multimeter:connected event (or a device error).
    const connected = await waitForConnection('multimeter:connected', 8000);

    if (!connected) {
      try { serial.disconnectMultimeter(); } catch (_) {}
      const errMsg = 'Connection timed out. Check the COM port, baud rate, and that the multimeter is powered on.';
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter: ' + errMsg);
      return { success: false, error: errMsg };
    }
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

