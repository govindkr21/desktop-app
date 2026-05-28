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

// ── Helper to parse host and port robustly from user input ──
function parseHostAndPort(inputHost, inputPort) {
  let host = String(inputHost || '127.0.0.1').trim();
  let port = parseInt(inputPort) || 5000;

  // Strip protocol prefix (e.g. tcp://, http://, etc.)
  if (host.includes('://')) {
    host = host.split('://')[1].trim();
  }

  // Strip trailing slashes or paths if user entered a URL by mistake
  if (host.includes('/')) {
    host = host.split('/')[0].trim();
  }

  // Check if port is appended in host (e.g. host:port)
  if (host.includes(':')) {
    const parts = host.split(':');
    host = parts[0].trim();
    const parsedPort = parseInt(parts[1].trim());
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      port = parsedPort;
    }
  }

  // Final validation
  if (isNaN(port) || port <= 0 || port > 65535) {
    port = 5000;
  }

  return { host, port };
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
    const parsed = parseHostAndPort(host, port);
    host = parsed.host;
    port = parsed.port;

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
    try {
      meggerSocket.connect({ host, port }, () => {
        console.log(`[Megger TCP] Connected to ${host}:${port}`);
        if (mainWindow) mainWindow.webContents.send('megger:connected');
      });
    } catch (err) {
      console.error('[Megger TCP] Synchronous connect error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger TCP Connect Error: ' + err.message);
    }

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
// ── Parse actual Megger MIT 525 8-column data streams ──
function parseMeggerLine(line) {
  const cleanLine = line.trim();
  const parts = cleanLine.split(',');
  
  if (parts.length < 6) return null;

  // 1. Time parsing (hh:mm:ss -> total seconds)
  const timeStr = parts[1] || '';
  let timeInSeconds = 0;
  if (timeStr.includes(':')) {
    const timeParts = timeStr.split(':');
    const hrs = parseInt(timeParts[0]) || 0;
    const mins = parseInt(timeParts[1]) || 0;
    const secs = parseInt(timeParts[2]) || 0;
    timeInSeconds = hrs * 3600 + mins * 60 + secs;
  } else {
    timeInSeconds = parseInt(timeStr) || 0;
  }

  // 2. Voltages (Nominal in parts[2], Actual in parts[3])
  const voltage = parseFloat(parts[2]) || 500;
  const actualVoltage = parseFloat(parts[3]) || voltage;

  // 3. Leakage Current (convert Amps in scientific notation to micro-Amps uA)
  const rawCurrent = parts[4] || '0';
  const currentInAmps = parseFloat(rawCurrent) || 0;
  const currentInMicroAmps = parseFloat((currentInAmps * 1e6).toFixed(6));

  // 4. Insulation Resistance (convert Ohms in scientific notation to Mega-Ohms MΩ)
  let rawResist = parts[5] || '0';
  // Strip "greater than" (>) or "less than" (<) operators
  rawResist = rawResist.replace(/[><]/g, '').trim();
  const resistanceInOhms = parseFloat(rawResist) || 0;
  const resistanceInMegaOhms = Math.round(resistanceInOhms / 1e6);

  return {
    time:          timeInSeconds,
    voltage:       voltage,
    actualVoltage: actualVoltage,
    current:       currentInMicroAmps,
    resistance:    resistanceInMegaOhms
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
    const parsed = parseHostAndPort(host, port);
    host = parsed.host;
    port = parsed.port;

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
    try {
      multimeterSocket.connect({ host, port }, () => {
        console.log(`[Multimeter TCP] Connected to ${host}:${port}`);
        if (mainWindow) mainWindow.webContents.send('multimeter:connected');
      });
    } catch (err) {
      console.error('[Multimeter TCP] Synchronous connect error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter TCP Connect Error: ' + err.message);
    }

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
