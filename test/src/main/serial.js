// ─────────────────────────────────────────────
// src/main/serial.js  —  USB Serial Communication
// ─────────────────────────────────────────────
// Phase 5 file — wire this up when you have real devices.
// The simulator below lets you test WITHOUT real hardware.
// ─────────────────────────────────────────────

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const net = require('net');
const readline = require('readline');

let meggerPort = null;
let multimeterPort = null;
let meggerSocket = null;
let multimeterSocket = null;
let mainWindow = null;

// ── Set reference to main window for sending events ──
function setWindow(win) {
  mainWindow = win;
}

// ── List all connected COM ports ──────────────
async function listPorts() {
  const ports = await SerialPort.list();
  console.log('[Serial] Available ports:', ports);
  return ports;
}

// ─────────────────────────────────────────────
// MEGGER MIT 525
// ─────────────────────────────────────────────
// NOTE: Replace 'COM3' with actual port.
// Replace baud rate with value from Megger manual.
// Replace parser logic with actual data format from manual.

function connectMegger(options) {
  let connectionType = 'serial';
  let portPath = 'COM3';
  let baudRate = 9600;
  let host = '127.0.0.1';
  let port = 5000;

  if (typeof options === 'string') {
    portPath = options;
  } else if (options && typeof options === 'object') {
    connectionType = options.connectionType || 'serial';
    portPath = options.portPath || 'COM3';
    baudRate = options.baudRate || 9600;
    host = options.host || '127.0.0.1';
    port = options.port || 5000;
  }

  // Always clean up existing connections first
  if (meggerPort && meggerPort.isOpen) {
    try { meggerPort.close(); } catch(e) { console.error('[Megger] Close error:', e.message); }
  }
  if (meggerSocket) {
    try { meggerSocket.destroy(); } catch(e) { console.error('[Megger TCP] Destroy error:', e.message); }
    meggerSocket = null;
  }

  if (connectionType === 'tcp') {
    let cleanHost = String(host).trim();
    let cleanPort = parseInt(port) || 5000;

    if (cleanHost.includes('://')) {
      cleanHost = cleanHost.split('://')[1];
    }
    if (cleanHost.includes(':')) {
      const parts = cleanHost.split(':');
      cleanHost = parts[0];
      cleanPort = parseInt(parts[1]) || cleanPort;
    }

    host = cleanHost;
    port = cleanPort;

    meggerSocket = new net.Socket();

    meggerSocket.on('error', (err) => {
      console.error('[Megger TCP] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger TCP: ' + err.message);
    });

    meggerSocket.on('close', () => {
      console.log('[Megger TCP] Connection closed');
      if (mainWindow) mainWindow.webContents.send('megger:stopped');
    });

    console.log(`[Megger TCP] Connecting to ${host}:${port}...`);
    meggerSocket.connect({ host, port }, () => {
      console.log(`[Megger TCP] Connected to ${host}:${port}`);
      if (mainWindow) mainWindow.webContents.send('megger:connected');
    });

    const rl = readline.createInterface({
      input: meggerSocket,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        console.log('[Megger TCP] Raw line:', line);
        const row = parseMeggerLine(line);
        if (row && mainWindow) {
          mainWindow.webContents.send('megger:data', row);
        }
      } catch (err) {
        console.error('[Megger TCP] Parse error:', err.message);
      }
    });

  } else {
    // Legacy Serial port connection
    meggerPort = new SerialPort({
      path: portPath,
      baudRate: baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: true,
    });

    const parser = meggerPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    meggerPort.on('open', () => {
      console.log('[Megger] Connected on', portPath);
      if (mainWindow) mainWindow.webContents.send('megger:connected');
    });

    // ── Parse incoming Megger data ─────────────
    parser.on('data', (line) => {
      try {
        console.log('[Megger] Raw data:', line);
        const row = parseMeggerLine(line);
        if (row && mainWindow) {
          mainWindow.webContents.send('megger:data', row);
        }
      } catch (err) {
        console.error('[Megger] Parse error:', err.message);
      }
    });

    meggerPort.on('error', (err) => {
      console.error('[Megger] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger: ' + err.message);
    });

    meggerPort.on('close', () => {
      console.log('[Megger] Disconnected');
      if (mainWindow) mainWindow.webContents.send('megger:stopped');
    });
  }
}

// ── Replace this with actual Megger data format ──
function parseMeggerLine(line) {
  // EXAMPLE FORMAT — update based on actual device manual
  // "60,500,0.05,5000" means time=60s, voltage=500V, current=0.05mA, resistance=5000MΩ
  const parts = line.trim().split(',');
  if (parts.length < 4) return null;
  return {
    time:       parseFloat(parts[0]),
    voltage:    parseFloat(parts[1]),
    current:    parseFloat(parts[2]),
    resistance: parseFloat(parts[3]),
  };
}

function disconnectMegger() {
  if (meggerPort && meggerPort.isOpen) {
    try { meggerPort.close(); } catch(e) { console.error('[Megger] Close error:', e.message); }
  }
  if (meggerSocket) {
    try { meggerSocket.destroy(); } catch(e) { console.error('[Megger TCP] Destroy error:', e.message); }
    meggerSocket = null;
  }
}

// ─────────────────────────────────────────────
// LCR MULTIMETER
// ─────────────────────────────────────────────
// NOTE: Replace 'COM4' with actual port.
// Replace command strings with values from multimeter manual.

function connectMultimeter(options) {
  let connectionType = 'serial';
  let portPath = 'COM4';
  let baudRate = 9600;
  let host = '127.0.0.1';
  let port = 5000;

  if (typeof options === 'string') {
    portPath = options;
  } else if (options && typeof options === 'object') {
    connectionType = options.connectionType || 'serial';
    portPath = options.portPath || 'COM4';
    baudRate = options.baudRate || 9600;
    host = options.host || '127.0.0.1';
    port = options.port || 5000;
  }

  // Always clean up existing connections first
  if (multimeterPort && multimeterPort.isOpen) {
    try { multimeterPort.close(); } catch(e) { console.error('[Multimeter] Close error:', e.message); }
  }
  if (multimeterSocket) {
    try { multimeterSocket.destroy(); } catch(e) { console.error('[Multimeter TCP] Destroy error:', e.message); }
    multimeterSocket = null;
  }

  if (connectionType === 'tcp') {
    let cleanHost = String(host).trim();
    let cleanPort = parseInt(port) || 5000;

    if (cleanHost.includes('://')) {
      cleanHost = cleanHost.split('://')[1];
    }
    if (cleanHost.includes(':')) {
      const parts = cleanHost.split(':');
      cleanHost = parts[0];
      cleanPort = parseInt(parts[1]) || cleanPort;
    }

    host = cleanHost;
    port = cleanPort;

    multimeterSocket = new net.Socket();

    multimeterSocket.on('error', (err) => {
      console.error('[Multimeter TCP] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter TCP: ' + err.message);
    });

    multimeterSocket.on('close', () => {
      console.log('[Multimeter TCP] Connection closed');
      if (mainWindow) mainWindow.webContents.send('multimeter:stopped');
    });

    console.log(`[Multimeter TCP] Connecting to ${host}:${port}...`);
    multimeterSocket.connect({ host, port }, () => {
      console.log(`[Multimeter TCP] Connected to ${host}:${port}`);
      if (mainWindow) mainWindow.webContents.send('multimeter:connected');
    });

    const rl = readline.createInterface({
      input: multimeterSocket,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        const value = parseMultimeterLine(line);
        if (value !== null && mainWindow) {
          mainWindow.webContents.send('multimeter:live', value);
        }
      } catch (err) {
        console.error('[Multimeter TCP] Parse error:', err.message);
      }
    });

  } else {
    // Legacy Serial port connection
    multimeterPort = new SerialPort({
      path: portPath,
      baudRate: baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: true,
    });

    const parser = multimeterPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    multimeterPort.on('open', () => {
      console.log('[Multimeter] Connected on', portPath);
      if (mainWindow) mainWindow.webContents.send('multimeter:connected');
    });

    parser.on('data', (line) => {
      try {
        const value = parseMultimeterLine(line);
        if (value !== null && mainWindow) {
          mainWindow.webContents.send('multimeter:live', value);
        }
      } catch (err) {
        console.error('[Multimeter] Parse error:', err.message);
      }
    });

    multimeterPort.on('error', (err) => {
      console.error('[Multimeter] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter: ' + err.message);
    });

    multimeterPort.on('close', () => {
      console.log('[Multimeter] Disconnected');
      if (mainWindow) mainWindow.webContents.send('multimeter:stopped');
    });
  }
}

// ── Send command to multimeter to change mode ──
// Replace command strings with actual commands from device manual
function sendMultimeterCommand(mode, frequency, secondary) {
  const command = buildCommand(mode, frequency, secondary);
  
  if (multimeterPort && multimeterPort.isOpen) {
    multimeterPort.write(command + '\r\n', (err) => {
      if (err) console.error('[Multimeter] Write error:', err.message);
      else console.log('[Multimeter] Command sent:', command);
    });
  }

  if (multimeterSocket && !multimeterSocket.destroyed) {
    multimeterSocket.write(command + '\r\n', (err) => {
      if (err) console.error('[Multimeter TCP] Write error:', err.message);
      else console.log('[Multimeter TCP] Command sent:', command);
    });
  }
}

// ── Replace with actual command format from manual ──
function buildCommand(mode, frequency, secondary) {
  // EXAMPLE — update with actual device protocol
  return `SET:${mode}:${frequency}:${secondary}`;
}

function parseMultimeterLine(line) {
  const val = parseFloat(line.trim());
  return isNaN(val) ? null : val;
}

function disconnectMultimeter() {
  if (multimeterPort && multimeterPort.isOpen) {
    try { multimeterPort.close(); } catch(e) { console.error('[Multimeter] Close error:', e.message); }
  }
  if (multimeterSocket) {
    try { multimeterSocket.destroy(); } catch(e) { console.error('[Multimeter TCP] Destroy error:', e.message); }
    multimeterSocket = null;
  }
}

// ─────────────────────────────────────────────
// SIMULATOR (for testing without real devices)
// ─────────────────────────────────────────────
// Call startMeggerSimulator() from index.js instead of
// connectMegger() to test the full app without hardware.

let simInterval = null;

function startMeggerSimulator(win) {
  mainWindow = win;
  let t = 15;
  simInterval = setInterval(() => {
    if (!mainWindow) return;
    const row = {
      time:       t,
      voltage:    500 + Math.round(Math.random() * 10 - 5),
      current:    parseFloat((0.04 + Math.random() * 0.18).toFixed(3)),
      resistance: Math.round(2000 + Math.random() * 8000),
    };
    mainWindow.webContents.send('megger:data', row);
    t += 15;
  }, 1500);
  mainWindow.webContents.send('megger:connected');
  console.log('[Simulator] Megger simulator started');
}

function stopMeggerSimulator() {
  clearInterval(simInterval);
  if (mainWindow) mainWindow.webContents.send('megger:stopped');
  console.log('[Simulator] Megger simulator stopped');
}

let multiSimInterval = null;

function startMultimeterSimulator(win, mode = 'R') {
  mainWindow = win;
  const base = mode === 'R' ? 1000 : mode === 'L' ? 0.05 : 0.0001;
  multiSimInterval = setInterval(() => {
    if (!mainWindow) return;
    const value = parseFloat((base + (Math.random() - 0.5) * base * 0.08).toFixed(
      mode === 'C' ? 6 : mode === 'L' ? 4 : 1
    ));
    mainWindow.webContents.send('multimeter:live', value);
  }, 400);
}

function stopMultimeterSimulator() {
  clearInterval(multiSimInterval);
}

module.exports = {
  setWindow,
  listPorts,
  connectMegger,
  disconnectMegger,
  connectMultimeter,
  sendMultimeterCommand,
  disconnectMultimeter,
  // Simulators for testing without devices:
  startMeggerSimulator,
  stopMeggerSimulator,
  startMultimeterSimulator,
  stopMultimeterSimulator,
};
