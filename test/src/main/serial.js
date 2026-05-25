// ─────────────────────────────────────────────
// src/main/serial.js  —  USB Serial Communication
// ─────────────────────────────────────────────
// Phase 5 file — wire this up when you have real devices.
// The simulator below lets you test WITHOUT real hardware.
// ─────────────────────────────────────────────

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let meggerPort = null;
let multimeterPort = null;
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

function connectMegger(portPath = 'COM3', baudRate = 9600) {
  if (meggerPort && meggerPort.isOpen) {
    meggerPort.close();
  }

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
  // TODO: Replace this parser with actual Megger MIT 525 protocol
  // Actual format from manual may look like: "T=60,V=500,I=0.05,R=5000"
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
    meggerPort.close();
  }
}

// ─────────────────────────────────────────────
// LCR MULTIMETER
// ─────────────────────────────────────────────
// NOTE: Replace 'COM4' with actual port.
// Replace command strings with values from multimeter manual.

function connectMultimeter(portPath = 'COM4', baudRate = 9600) {
  if (multimeterPort && multimeterPort.isOpen) {
    multimeterPort.close();
  }

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
}

// ── Send command to multimeter to change mode ──
// Replace command strings with actual commands from device manual
function sendMultimeterCommand(mode, frequency, secondary) {
  if (!multimeterPort || !multimeterPort.isOpen) return;
  const command = buildCommand(mode, frequency, secondary);
  multimeterPort.write(command + '\r\n', (err) => {
    if (err) console.error('[Multimeter] Write error:', err.message);
    else console.log('[Multimeter] Command sent:', command);
  });
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
    multimeterPort.close();
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
