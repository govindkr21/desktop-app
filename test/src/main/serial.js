// ─────────────────────────────────────────────
// src/main/serial.js  —  USB Serial Communication
// ─────────────────────────────────────────────
// Phase 5 file — wire this up when you have real devices.
// The simulator below lets you test WITHOUT real hardware.
// ─────────────────────────────────────────────

const { SerialPort } = require('serialport');
const net = require('net');
const { EventEmitter } = require('events');

// Shared event bus that index.js IPC handlers use to detect connection outcomes.
// Emits: 'megger:connected', 'multimeter:connected', 'device:error'
const deviceEvents = new EventEmitter();
deviceEvents.setMaxListeners(20);

let meggerPort = null;
let multimeterPort = null;
let meggerSocket = null;
let multimeterSocket = null;
let mainWindow = null;
let meggerRxBuffer = '';
let multimeterRxBuffer = '';
let multimeterInterval = null;
let multimeterMode = 'R';

// Track current physical state of multimeter to prevent redundant/rapid SCPI calls
let currentMultimeterMode = '';
let currentMultimeterFreq = '';
let currentMultimeterSec = '';
let currentMultimeterEquiv = '';

let multimeterCommandQueue = [];
let isProcessingMultimeterQueue = false;

function clearMultimeterState() {
  currentMultimeterMode = '';
  currentMultimeterFreq = '';
  currentMultimeterSec = '';
  currentMultimeterEquiv = '';
  multimeterCommandQueue = [];
  isProcessingMultimeterQueue = false;
}

// MIT 525 stream: **,HH:MM:SS,nomV,actV,current,resistance,mode,pass,
const MEGGER_RECORD_RE = /\*\*,\d{2}:\d{2}:\d{2},\d+,\d+,[^,\r\n]+,[^,\r\n]+,\d+,[YNyn],/i;

function emitDeviceRaw(device, chunk) {
  // Serial reads are bytes. If baud/format is wrong, decoding as UTF-8 looks like "garbage".
  // Detect low-printable content and show HEX so users can immediately see it's a settings issue.
  const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
  const asUtf8 = buf.toString('utf8');

  let printable = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    // printable ASCII + common whitespace
    if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) printable++;
  }
  const ratio = buf.length ? printable / buf.length : 1;
  const text = ratio < 0.75
    ? `[HEX ${buf.length}B] ` + buf.toString('hex').match(/.{1,2}/g).join(' ')
    : asUtf8;

  console.log(`[${device}] SERIAL:`, text);
  if (mainWindow) mainWindow.webContents.send(`${device}:raw`, text);
  return ratio < 0.75 ? '' : asUtf8;
}

function splitRxBuffer(buffer) {
  const lines = [];
  let rest = buffer;
  let match;
  const delimRe = /\r\n|\n|\r/g;
  while ((match = delimRe.exec(rest)) !== null) {
    const line = rest.slice(0, match.index);
    if (line.length > 0) lines.push(line);
    rest = rest.slice(match.index + match[0].length);
    delimRe.lastIndex = 0;
  }
  return { lines, rest };
}

function extractMeggerRecordsFromBuffer() {
  let match;
  const records = [];
  while ((match = meggerRxBuffer.match(MEGGER_RECORD_RE))) {
    records.push(match[0]);
    const start = meggerRxBuffer.indexOf(match[0]);
    meggerRxBuffer = meggerRxBuffer.slice(0, start) + meggerRxBuffer.slice(start + match[0].length);
  }
  return records;
}

function handleMeggerPayload(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  console.log('[Megger] Complete record:', trimmed);
  const row = parseMeggerLine(trimmed);
  if (row && mainWindow) {
    mainWindow.webContents.send('megger:data', row);
  }
}

function processMeggerRx(chunk) {
  const text = emitDeviceRaw('megger', chunk);
  meggerRxBuffer += text;

  const upperBuf = meggerRxBuffer.toUpperCase();
  if (upperBuf.includes('TEST COMPLETED') || upperBuf.includes('TEST COMPLETE')) {
    console.log('[Megger] Test completed message received. Stopping data acquisition.');
    if (mainWindow) {
      mainWindow.webContents.send('megger:stopped', { completed: true, reason: 'FINISHED' });
    }
    meggerRxBuffer = '';
    disconnectMegger();
    return;
  }

  const { lines, rest } = splitRxBuffer(meggerRxBuffer);
  meggerRxBuffer = rest;
  for (const line of lines) {
    handleMeggerPayload(line);
  }

  for (const record of extractMeggerRecordsFromBuffer()) {
    handleMeggerPayload(record.replace(/,\s*$/, ''));
  }
}

function handleMultimeterPayload(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  console.log('[Multimeter] Line:', trimmed);
  const value = parseMultimeterLine(trimmed);
  if (value !== null && mainWindow) {
    mainWindow.webContents.send('multimeter:live', value);
  }
}

function processMultimeterRx(chunk) {
  const text = emitDeviceRaw('multimeter', chunk);
  multimeterRxBuffer += text;

  const { lines, rest } = splitRxBuffer(multimeterRxBuffer);
  multimeterRxBuffer = rest;
  for (const line of lines) {
    handleMultimeterPayload(line);
  }
}

function wireMeggerInput(stream) {
  meggerRxBuffer = '';
  stream.removeAllListeners('data');
  stream.on('data', processMeggerRx);
}

function wireMultimeterInput(stream) {
  multimeterRxBuffer = '';
  stream.removeAllListeners('data');
  stream.on('data', processMultimeterRx);
}

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
  disconnectMegger();

  if (connectionType === 'tcp') {
    const parsed = parseHostAndPort(host, port);
    host = parsed.host;
    port = parsed.port;

    meggerSocket = new net.Socket();

    meggerSocket.on('error', (err) => {
      console.error('[Megger TCP] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger TCP: ' + err.message);
      deviceEvents.emit('device:error', 'Megger TCP: ' + err.message);
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
        deviceEvents.emit('megger:connected');
      });
    } catch (err) {
      console.error('[Megger TCP] Synchronous connect error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger TCP Connect Error: ' + err.message);
      deviceEvents.emit('device:error', 'Megger TCP Connect Error: ' + err.message);
    }

    wireMeggerInput(meggerSocket);

  } else {
    meggerPort = new SerialPort({
      path: portPath,
      baudRate: baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false,
    });

    meggerPort.on('open', () => {
      console.log('[Megger] Connected on', portPath);
      if (mainWindow) mainWindow.webContents.send('megger:connected');
      deviceEvents.emit('megger:connected');
    });

    wireMeggerInput(meggerPort);

    meggerPort.on('error', (err) => {
      console.error('[Megger] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Megger: ' + err.message);
      deviceEvents.emit('device:error', 'Megger: ' + err.message);
    });

    meggerPort.on('close', () => {
      console.log('[Megger] Disconnected');
      if (mainWindow) mainWindow.webContents.send('megger:stopped');
      setImmediate(() => {
        disconnectMegger();
      });
    });

    meggerPort.open((err) => {
      if (err) {
        console.error('[Megger] Open error:', err.message);
        if (mainWindow) mainWindow.webContents.send('device:error', 'Megger: ' + err.message);
        disconnectMegger();
      }
    });
  }
}

// ── Replace this with actual Megger data format ──
// ── Parse actual Megger MIT 525 8-column data streams ──
function parseMeggerLine(line) {
  let cleanLine = line.trim();
  if (cleanLine.toUpperCase().startsWith('SERIAL:')) {
    cleanLine = cleanLine.slice(7).trim();
  }

  const parts = cleanLine.split(',').map(p => p.trim());

  if (parts.length < 6) return null;

  // Leading "**" marker (MIT 525 CSV stream)
  const offset = parts[0] === '**' ? 1 : 0;
  if (parts.length < offset + 6) return null;

  // 1. Time parsing (hh:mm:ss -> total seconds)
  const timeStr = parts[offset] || '';
  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) return null;
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

  // 2. Voltages (Nominal, Actual)
  const voltage = parseFloat(parts[offset + 1]) || 500;
  const actualVoltage = parseFloat(parts[offset + 2]) || voltage;

  // 3. Leakage Current (Amps -> micro-Amps uA)
  const rawCurrent = parts[offset + 3] || '0';
  const currentInAmps = parseFloat(rawCurrent) || 0;
  const currentInMicroAmps = parseFloat((currentInAmps * 1e6).toFixed(6));

  // 4. Insulation Resistance (Ohms -> Mega-Ohms MΩ); may be >1E12 or <1E6
  let rawResist = parts[offset + 4] || '0';
  // Strip "greater than" (>) or "less than" (<) operators
  rawResist = rawResist.replace(/[><]/g, '').trim();
  const resistanceInOhms = parseFloat(rawResist) || 0;
  const resistanceInMegaOhms = parseFloat((resistanceInOhms / 1e6).toFixed(4));

  return {
    time:          timeInSeconds,
    voltage:       voltage,
    actualVoltage: actualVoltage,
    current:       currentInMicroAmps,
    resistance:    resistanceInMegaOhms
  };
}

function disconnectMegger() {
  meggerRxBuffer = '';
  if (meggerPort) {
    const portToClose = meggerPort;
    meggerPort = null;
    try {
      portToClose.removeAllListeners();
      if (portToClose.isOpen) {
        portToClose.close((err) => {
          if (err) console.error('[Megger] Close callback error:', err.message);
        });
      }
    } catch(e) {
      console.error('[Megger] Close error:', e.message);
    }
  }
  if (meggerSocket) {
    try { meggerSocket.destroy(); } catch(e) { console.error('[Megger TCP] Destroy error:', e.message); }
    meggerSocket = null;
    if (mainWindow) mainWindow.webContents.send('megger:stopped');
  }
}

// ─────────────────────────────────────────────
// LCR MULTIMETER
// ─────────────────────────────────────────────
// NOTE: Replace 'COM4' with actual port.
// Replace command strings with values from multimeter manual.

function startMultimeterPolling() {
  stopMultimeterPolling();
  multimeterInterval = setInterval(() => {
    if (isProcessingMultimeterQueue) {
      console.log('[Multimeter] Config commands in progress. Skipping poll tick.');
      return;
    }
    const query = 'FETCh?\r\n';
    if (multimeterPort && multimeterPort.isOpen) {
      multimeterPort.write(query, (err) => {
        if (err) console.error('[Multimeter] Poll write error:', err.message);
      });
    } else if (multimeterSocket && !multimeterSocket.destroyed) {
      multimeterSocket.write(query, (err) => {
        if (err) console.error('[Multimeter TCP] Poll write error:', err.message);
      });
    }
  }, 1000);
}

function stopMultimeterPolling() {
  if (multimeterInterval) {
    clearInterval(multimeterInterval);
    multimeterInterval = null;
  }
}

function connectMultimeter(options) {
  clearMultimeterState();
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
  disconnectMultimeter();

  if (connectionType === 'tcp') {
    const parsed = parseHostAndPort(host, port);
    host = parsed.host;
    port = parsed.port;

    multimeterSocket = new net.Socket();

    multimeterSocket.on('error', (err) => {
      console.error('[Multimeter TCP] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter TCP: ' + err.message);
      deviceEvents.emit('device:error', 'Multimeter TCP: ' + err.message);
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
        deviceEvents.emit('multimeter:connected');
        startMultimeterPolling();
      });
    } catch (err) {
      console.error('[Multimeter TCP] Synchronous connect error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter TCP Connect Error: ' + err.message);
      deviceEvents.emit('device:error', 'Multimeter TCP Connect Error: ' + err.message);
    }

    wireMultimeterInput(multimeterSocket);

  } else {
    multimeterPort = new SerialPort({
      path: portPath,
      baudRate: baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false,
    });

    multimeterPort.on('open', () => {
      console.log('[Multimeter] Connected on', portPath);
      if (mainWindow) mainWindow.webContents.send('multimeter:connected');
      deviceEvents.emit('multimeter:connected');
      startMultimeterPolling();
    });

    wireMultimeterInput(multimeterPort);

    multimeterPort.on('error', (err) => {
      console.error('[Multimeter] Error:', err.message);
      if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter: ' + err.message);
      deviceEvents.emit('device:error', 'Multimeter: ' + err.message);
    });

    multimeterPort.on('close', () => {
      console.log('[Multimeter] Disconnected');
      if (mainWindow) mainWindow.webContents.send('multimeter:stopped');
      setImmediate(() => {
        disconnectMultimeter();
      });
    });

    multimeterPort.open((err) => {
      if (err) {
        console.error('[Multimeter] Open error:', err.message);
        if (mainWindow) mainWindow.webContents.send('device:error', 'Multimeter: ' + err.message);
        disconnectMultimeter();
      }
    });
  }
}

// ── Send command to multimeter to change mode ──
// Replace command strings with actual commands from device manual
function sendMultimeterCommand(mode, frequency, secondary, equivalent) {
  const cmds = [];
  const modeVal = mode ? mode.toUpperCase() : 'C';
  if (modeVal !== currentMultimeterMode) {
    cmds.push(`FUNC:impa ${modeVal}`);
    // Changing primary parameter changes physical secondary default; invalidate tracking
    currentMultimeterSec = '';
  }
  
  let freqVal = '1000';
  if (frequency) {
    const f = frequency.toLowerCase();
    if (f.includes('100hz')) freqVal = '100';
    else if (f.includes('120hz')) freqVal = '120';
    else if (f.includes('1khz')) freqVal = '1000';
    else if (f.includes('10khz')) freqVal = '10000';
    else if (f.includes('100khz')) freqVal = '100000';
  }
  if (freqVal !== currentMultimeterFreq) {
    cmds.push(`FREQ ${freqVal}`);
  }
  
  let secVal = 'D';
  if (modeVal === 'R' || modeVal === 'Z') {
    secVal = 'THETA';
  } else if (modeVal === 'L') {
    secVal = 'Q';
  }
  if (secondary) {
    const s = secondary.toUpperCase();
    if (s === 'R' || s === 'ESR') {
      secVal = 'ESR';
    } else if (s === 'DEG' || s === 'THETA') {
      secVal = 'THETA';
    } else {
      secVal = s;
    }
  }
  if (secVal !== currentMultimeterSec) {
    cmds.push(`FUNC:impb ${secVal}`);
  }
  
  let equivVal = 'SER';
  if (equivalent) {
    equivVal = equivalent.toUpperCase() === 'PAL' ? 'PAL' : 'SER';
  }
  if (equivVal !== currentMultimeterEquiv) {
    cmds.push(`FUNC:EQU ${equivVal}`);
  }
  
  if (cmds.length === 0) {
    console.log('[Multimeter] State already matches requested settings. Skipping commands.');
    return;
  }

  // Discard any unsent pending commands from previous requests to avoid backlog
  multimeterCommandQueue = [];
  multimeterCommandQueue.push(...cmds);

  if (!isProcessingMultimeterQueue) {
    processNextMultimeterCommand();
  }
}

function processNextMultimeterCommand() {
  if (multimeterCommandQueue.length === 0) {
    isProcessingMultimeterQueue = false;
    return;
  }

  isProcessingMultimeterQueue = true;
  const cmd = multimeterCommandQueue.shift();
  const cmdString = cmd + '\r\n';
  
  const isModeChange = cmd.toUpperCase().startsWith('FUNC:IMPA');
  const delay = isModeChange ? 1200 : 200;

  const handleWriteResult = (err) => {
    if (err) {
      console.error('[Multimeter] Write error:', err.message);
      setTimeout(processNextMultimeterCommand, delay);
    } else {
      console.log('[Multimeter] Command sent:', cmd.trim());
      setTimeout(() => {
        const upperCmd = cmd.toUpperCase().trim();
        if (upperCmd.startsWith('FUNC:IMPA')) {
          const newMode = upperCmd.slice(9).trim();
          currentMultimeterMode = newMode;
          multimeterMode = newMode;
          console.log('[Multimeter] Physical mode change settled. Parser scaling updated to:', newMode);
        } else if (upperCmd.startsWith('FREQ')) {
          currentMultimeterFreq = upperCmd.slice(4).trim();
          console.log('[Multimeter] Frequency changed to:', currentMultimeterFreq);
        } else if (upperCmd.startsWith('FUNC:IMPB')) {
          currentMultimeterSec = upperCmd.slice(9).trim();
          console.log('[Multimeter] Secondary parameter changed to:', currentMultimeterSec);
        } else if (upperCmd.startsWith('FUNC:EQU')) {
          currentMultimeterEquiv = upperCmd.slice(8).trim();
          console.log('[Multimeter] Equivalent circuit changed to:', currentMultimeterEquiv);
        }
        processNextMultimeterCommand();
      }, delay);
    }
  };

  if (multimeterPort && multimeterPort.isOpen) {
    multimeterPort.write(cmdString, handleWriteResult);
  } else if (multimeterSocket && !multimeterSocket.destroyed) {
    multimeterSocket.write(cmdString, handleWriteResult);
  } else {
    setTimeout(processNextMultimeterCommand, delay);
  }
}

// ── Replace with actual command format from manual ──
function buildCommand(mode, frequency, secondary, equivalent) {
  // mode: 'L', 'C', 'R', 'Z', 'DCR'
  // frequency: '100Hz', '120Hz', '1kHz', '10kHz', '100kHz'
  // secondary: 'Q', 'D', 'R', 'DEG'
  // equivalent: 'SER', 'PAL'

  let modeVal = 'C';
  if (mode) {
    modeVal = mode.toUpperCase();
  }

  if (modeVal === 'DCR') {
    return 'FUNC:impa DCR';
  }

  let freqVal = '1000';
  if (frequency) {
    const f = frequency.toLowerCase();
    if (f.includes('100hz')) freqVal = '100';
    else if (f.includes('120hz')) freqVal = '120';
    else if (f.includes('1khz')) freqVal = '1000';
    else if (f.includes('10khz')) freqVal = '10000';
    else if (f.includes('100khz')) freqVal = '100000';
  }

  // Set secondary parameter defaults based on primary mode to avoid invalid parameter errors
  let secVal = 'D';
  if (modeVal === 'R' || modeVal === 'Z') {
    secVal = 'THETA';
  } else if (modeVal === 'L') {
    secVal = 'Q';
  }

  if (secondary) {
    const s = secondary.toUpperCase();
    if (s === 'R' || s === 'ESR') {
      secVal = 'ESR';
    } else if (s === 'DEG' || s === 'THETA') {
      secVal = 'THETA';
    } else {
      secVal = s;
    }
  }

  let equivVal = 'SER';
  if (equivalent) {
    equivVal = equivalent.toUpperCase() === 'PAL' ? 'PAL' : 'SER';
  }

  // BK Precision 880 SCPI configuration command chain
  return `FUNC:impa ${modeVal};:FUNC:impb ${secVal};:FUNC:EQU ${equivVal};:FREQ ${freqVal}`;
}

function parseMultimeterLine(line) {
  let clean = line.trim();
  if (clean.toUpperCase().startsWith('SERIAL:')) {
    clean = clean.slice(7).trim();
  }
  
  // The LCR meter returns a comma-separated string: <PrimaryValue>,<SecondaryValue>
  // e.g. +9.92758e-15,-9.73668e+01
  const parts = clean.split(',');
  let val = parseFloat(parts[0]);
  if (isNaN(val)) return null;

  // Scale the parsed value according to the active multimeterMode
  if (multimeterMode === 'C') {
    // Convert Farads to nanofarads (nF)
    val = val * 1e9;
  } else if (multimeterMode === 'L') {
    // Convert Henries to millihenries (mH)
    val = val * 1e3;
  }

  let secVal = parseFloat(parts[1]);
  if (isNaN(secVal)) secVal = 0;

  return { primary: val, secondary: secVal };
}

function disconnectMultimeter() {
  stopMultimeterPolling();
  clearMultimeterState();
  multimeterRxBuffer = '';
  if (multimeterPort) {
    const portToClose = multimeterPort;
    multimeterPort = null;
    try {
      portToClose.removeAllListeners();
      if (portToClose.isOpen) {
        portToClose.close((err) => {
          if (err) console.error('[Multimeter] Close callback error:', err.message);
        });
      }
    } catch(e) {
      console.error('[Multimeter] Close error:', e.message);
    }
  }
  if (multimeterSocket) {
    try { multimeterSocket.destroy(); } catch(e) { console.error('[Multimeter TCP] Destroy error:', e.message); }
    multimeterSocket = null;
    if (mainWindow) mainWindow.webContents.send('multimeter:stopped');
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
    mainWindow.webContents.send('multimeter:live', { primary: value, secondary: 0.005 });
  }, 400);
}

function stopMultimeterSimulator() {
  clearInterval(multiSimInterval);
}

module.exports = {
  deviceEvents,
  setWindow,
  listPorts,
  connectMegger,
  disconnectMegger,
  connectMultimeter,
  sendMultimeterCommand,
  disconnectMultimeter,
  parseMeggerLine,
  startMeggerSimulator,
  stopMeggerSimulator,
  startMultimeterSimulator,
  stopMultimeterSimulator,
};
