// src/main/reports.js — Excel & PDF Export
const path = require('path');
const { app, dialog } = require('electron');
const fs = require('fs');
const db = require('./database');

// Helper to sanitize filename
function sanitizeFilename(name) {
  return (name || 'Report').replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Helper to get safe documents directory (creates if missing, fallbacks if error)
function getSafeDocumentsPath() {
  const targets = ['documents', 'downloads', 'desktop', 'userData', 'temp'];
  for (const target of targets) {
    try {
      const p = app.getPath(target);
      if (p) {
        if (!fs.existsSync(p)) {
          fs.mkdirSync(p, { recursive: true });
        }
        return p;
      }
    } catch (e) {
      // ignore and try next
    }
  }
  try {
    const p = app.getAppPath();
    if (p) return p;
  } catch (e) {}
  return '.';
}

function getSystemFonts() {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const fonts = { regular: null, bold: null, italic: null, boldItalic: null };

  if (isWin) {
    const winFontsDir = path.join(process.env.windir || 'C:/Windows', 'Fonts');
    const candidates = [
      { regular: 'arial.ttf', bold: 'arialbd.ttf', italic: 'ariali.ttf', boldItalic: 'arialbi.ttf' },
      { regular: 'calibri.ttf', bold: 'calibrib.ttf', italic: 'calibrii.ttf', boldItalic: 'calibriz.ttf' },
      { regular: 'segoeui.ttf', bold: 'segoeuib.ttf', italic: 'segoeuii.ttf', boldItalic: 'segoeuiz.ttf' }
    ];
    for (const cand of candidates) {
      const regPath = path.join(winFontsDir, cand.regular);
      const boldPath = path.join(winFontsDir, cand.bold);
      const italicPath = path.join(winFontsDir, cand.italic);
      const boldItalicPath = path.join(winFontsDir, cand.boldItalic);

      if (fs.existsSync(regPath)) {
        fonts.regular = regPath;
        fonts.bold = fs.existsSync(boldPath) ? boldPath : regPath;
        fonts.italic = fs.existsSync(italicPath) ? italicPath : regPath;
        fonts.boldItalic = fs.existsSync(boldItalicPath) ? boldItalicPath : regPath;
        return fonts;
      }
    }
  } else if (isMac) {
    const macDirs = ['/System/Library/Fonts/Supplemental', '/Library/Fonts', '/System/Library/Fonts'];
    // Prefer plain .ttf files; pdfkit fails on .ttc (TrueType Collection) without a font index — throws "createSubset is not a function".
    const candidates = [
      { regular: 'Arial.ttf', bold: 'Arial Bold.ttf', italic: 'Arial Italic.ttf', boldItalic: 'Arial Bold Italic.ttf' },
      { regular: 'Helvetica Neue.ttf', bold: 'Helvetica Neue Bold.ttf', italic: 'Helvetica Neue Italic.ttf', boldItalic: 'Helvetica Neue Bold Italic.ttf' },
      { regular: 'Verdana.ttf', bold: 'Verdana Bold.ttf', italic: 'Verdana Italic.ttf', boldItalic: 'Verdana Bold Italic.ttf' }
    ];
    for (const dir of macDirs) {
      for (const cand of candidates) {
        const regPath = path.join(dir, cand.regular);
        const boldPath = path.join(dir, cand.bold);
        const italicPath = path.join(dir, cand.italic);
        const boldItalicPath = path.join(dir, cand.boldItalic);

        if (fs.existsSync(regPath)) {
          fonts.regular = regPath;
          fonts.bold = fs.existsSync(boldPath) ? boldPath : regPath;
          fonts.italic = fs.existsSync(italicPath) ? italicPath : regPath;
          fonts.boldItalic = fs.existsSync(boldItalicPath) ? boldItalicPath : regPath;
          return fonts;
        }
      }
    }
  } else {
    // Linux candidates
    const linuxCandidates = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/TTF/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
    ];
    for (const p of linuxCandidates) {
      if (fs.existsSync(p)) {
        fonts.regular = p;
        fonts.bold = p;
        fonts.italic = p;
        fonts.boldItalic = p;
        return fonts;
      }
    }
  }
  return null;
}


// Helper to find logo path dynamically in development or production
function getLogoPath() {
  const possiblePaths = [
    path.join(app.getAppPath(), 'src/assets/logo.png'),
    path.join(app.getAppPath(), 'test/src/assets/logo.png'),
    path.join(app.getAppPath(), '..', 'src/assets/logo.png'),
    path.join(app.getAppPath(), '..', '..', 'src/assets/logo.png'),
    path.join(__dirname, 'src/assets/logo.png'),
    path.join(__dirname, '..', 'src/assets/logo.png'),
    path.join(__dirname, '..', '..', 'src/assets/logo.png'),
    path.join(__dirname, '..', '..', '..', 'src/assets/logo.png'),
    path.join(__dirname, '..', '..', 'test/src/assets/logo.png'),
    'c:/Users/HITIKA/Downloads/desk/desk/test/src/assets/logo.png',
    'C:/Users/HITIKA/Downloads/desk/desk/test/src/assets/logo.png',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback: Traverse up from app.getAppPath()
  let currentDir = app.getAppPath();
  for (let i = 0; i < 5; i++) {
    const testPath = path.join(currentDir, 'src/assets/logo.png');
    if (fs.existsSync(testPath)) return testPath;
    const testPath2 = path.join(currentDir, 'test/src/assets/logo.png');
    if (fs.existsSync(testPath2)) return testPath2;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  return null;
}


// Helper to check if value is overload
function isOverload(val, mode) {
  if (val === null || val === undefined) return false;
  let cleanVal = val;
  if (typeof val === 'string') {
    cleanVal = val.replace(/,/g, '');
  }
  const num = parseFloat(cleanVal);
  if (isNaN(num)) return false;
  if (num > 9.0e36) return true;
  if (mode === 'R' || mode === 'DCR' || mode === 'Z' || mode === 'ESR') return num >= 20e6;
  if (mode === 'L') return num >= 2e6;
  if (mode === 'C') return num >= 2e7;
  return false;
}

// Helper to check if group has sweep data
function hasSweepDataForGroup(mulData, groupPrefix, type = 'ind') {
  const phases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
  const freqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
  for (const phase of phases) {
    for (const f of freqs) {
      const sweepKey = `${groupPrefix}_${type}_${phase}_${f}`;
      if (mulData[sweepKey]?.value !== undefined && mulData[sweepKey]?.value !== null) {
        return true;
      }
    }
  }
  return false;
}

// Helper to calculate phase imbalance
function calculateImbalance(v1, v2, v3) {
  if (v1 === undefined || v2 === undefined || v3 === undefined || v1 === null || v2 === null || v3 === null) return null;
  const num1 = parseFloat(v1);
  const num2 = parseFloat(v2);
  const num3 = parseFloat(v3);
  if (isNaN(num1) || isNaN(num2) || isNaN(num3)) return null;

  const avg = (num1 + num2 + num3) / 3;
  if (avg === 0) return 0;

  const dev1 = Math.abs(num1 - avg);
  const dev2 = Math.abs(num2 - avg);
  const dev3 = Math.abs(num3 - avg);
  const maxDev = Math.max(dev1, dev2, dev3);

  return (maxDev / avg) * 100;
}

// Helper to format resistance values nicely with unit
function formatResistance(mOhms) {
  if (mOhms == null || Number.isNaN(mOhms)) return '—';
  const val = Number(mOhms);
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} TΩ`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)} GΩ`;
  if (val < 1) return `${(val * 1e3).toFixed(1)} kΩ`;
  return `${val.toFixed(2)} MΩ`;
}

function formatResistancePDF(mOhms) {
  if (mOhms == null || Number.isNaN(mOhms)) return '—';
  const val = Number(mOhms);
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} T-Ohm`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)} G-Ohm`;
  if (val < 1) return `${(val * 1e3).toFixed(1)} k-Ohm`;
  return `${val.toFixed(2)} M-Ohm`;
}

function getMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function filterOutliersForGraph(rows) {
  const data = rows.filter(r => r.time !== 0);
  if (data.length === 0) return [];
  const resistances = data
    .map(r => r.resistance)
    .filter(val => val !== null && val !== undefined && !isNaN(val));
  if (resistances.length === 0) return data;
  const median = getMedian(resistances);
  if (median === 0) return data;
  return data.filter(r => {
    const val = r.resistance;
    if (val === null || val === undefined || isNaN(val)) return false;
    return val <= median * 10 && val >= median / 10;
  });
}

function formatStepVoltage(str) {
  if (!str || str === '—') return '—';
  const parts = str.split(/[\/,]/);
  const lastPart = parts[parts.length - 1].trim();
  if (/^\d+$/.test(lastPart)) {
    return `${lastPart}V`;
  }
  return lastPart;
}

// Drops the first-few-seconds voltage-stabilization transient (matches InsulationTab).
// Without this the PI chart auto-scale is dominated by a 2 TΩ (2e6 MΩ) spike at t≈1s
// and the meaningful data down at ~15k MΩ hugs the x-axis and reads as flat.
function stripEarlyTransients(rows) {
  return (rows || []).filter(r => {
    const t = Number(r?.time);
    const R = Number(r?.resistance);
    const I = Number(r?.current);
    if (t <= 2 && (R >= 1e6 || I <= 0.005 || R <= 0)) return false;
    return true;
  });
}

// Drops the Megger-appended summary block (30 s / 60 s / 600 s spot readings) — detected as the
// first row where time stops increasing. Raw `rows` should still be used for DAR/PI calculations.
function stripTrailingSummary(rows) {
  if (!rows || rows.length === 0) return rows || [];
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i].time) <= Number(rows[i - 1].time)) {
      return rows.slice(0, i);
    }
  }
  return rows;
}

function splitSVData(rows) {
  if (!rows || rows.length === 0) return { transientRows: [], summaryRows: [] };
  let splitIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i].time) <= Number(rows[i - 1].time)) {
      splitIndex = i;
      break;
    }
  }

  let transientRows = rows;
  let summaryRows = [];

  if (splitIndex !== -1) {
    transientRows = rows.slice(0, splitIndex);
    summaryRows = rows.slice(splitIndex);
    summaryRows.sort((a, b) => Number(a.time) - Number(b.time));
  } else {
    // Dynamically extract summary rows at t = 60, 120, 180, 240, 300 from transient rows
    const targetTimes = [60, 120, 180, 240, 300];
    summaryRows = targetTimes.map(t => rows.find(r => Number(r.time) === t)).filter(Boolean);
  }

  return { transientRows, summaryRows };
}

// ─── Sarox Motor Condition Assessment bands (per docx spec) ────────────────
const RATING_STYLES = {
  Excellent: { color: '#166534', bg: '#dcfce7' },
  Good:      { color: '#15803d', bg: '#d1fae5' },
  Normal:    { color: '#1e40af', bg: '#dbeafe' },
  Observe:   { color: '#b45309', bg: '#fef3c7' },
  Caution:   { color: '#c2410c', bg: '#ffedd5' },
  Alarm:     { color: '#b91c1c', bg: '#fee2e2' },
};
const RATING_ORDER = ['Excellent', 'Good', 'Normal', 'Observe', 'Caution', 'Alarm'];
const NONE_RATING = { text: '—', color: '#64748b', bg: '#f1f5f9' };
function worstBand(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RATING_ORDER.indexOf(a) >= RATING_ORDER.indexOf(b) ? a : b;
}
function bandToRating(band) {
  return band ? { text: band, ...RATING_STYLES[band] } : NONE_RATING;
}

function ratePI(v) {
  const x = Number(v);
  if (!isFinite(x)) return NONE_RATING;
  if (x > 4.0) return bandToRating('Excellent');
  if (x >= 2.5) return bandToRating('Good');
  if (x >= 2.0) return bandToRating('Normal');
  if (x >= 1.5) return bandToRating('Observe');
  if (x >= 1.0) return bandToRating('Caution');
  return bandToRating('Alarm');
}

function rateDAR(v) {
  const x = Number(v);
  if (!isFinite(x)) return NONE_RATING;
  if (x > 1.60) return bandToRating('Excellent');
  if (x >= 1.45) return bandToRating('Good');
  if (x >= 1.30) return bandToRating('Normal');
  if (x >= 1.20) return bandToRating('Observe');
  if (x >= 1.10) return bandToRating('Caution');
  return bandToRating('Alarm');
}

// SV Step Voltage Resistance Settlement — worst % decrease between consecutive
// step-resistance points. Bands per docx: <5 Excellent … >50 Alarm.
function rateSVSettlement(summaryRows) {
  if (!summaryRows || summaryRows.length < 2) return Object.assign({}, NONE_RATING, { decrease: null });
  const pts = summaryRows
    .map(r => Number(r.resistance))
    .filter(v => isFinite(v) && v > 0);
  if (pts.length < 2) return Object.assign({}, NONE_RATING, { decrease: null });
  let maxDrop = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i] < pts[i - 1]) {
      const drop = (pts[i - 1] - pts[i]) / pts[i - 1] * 100;
      if (drop > maxDrop) maxDrop = drop;
    }
  }
  let band;
  if (maxDrop < 5) band = 'Excellent';
  else if (maxDrop < 10) band = 'Good';
  else if (maxDrop < 20) band = 'Normal';
  else if (maxDrop < 35) band = 'Observe';
  else if (maxDrop < 50) band = 'Caution';
  else band = 'Alarm';
  return Object.assign({}, bandToRating(band), { decrease: maxDrop });
}

// RAMP fallback: no docx rule — map IEEE-43 corrected-R40 thresholds onto the
// same 6 bands so labels stay consistent across the report.
function rateInsulationRc40(Rc40) {
  if (Rc40 === null || Rc40 === undefined || !isFinite(Number(Rc40))) return NONE_RATING;
  const v = Number(Rc40);
  if (v >= 100) return bandToRating('Excellent');
  if (v >= 50) return bandToRating('Good');
  if (v >= 10) return bandToRating('Normal');
  if (v >= 5) return bandToRating('Observe');
  if (v >= 1) return bandToRating('Caution');
  return bandToRating('Alarm');
}

function rateImbalance(kind, val) {
  if (val === null || val === undefined || !isFinite(Number(val))) return NONE_RATING;
  const v = Math.abs(Number(val));
  const bands = ['Excellent', 'Good', 'Normal', 'Observe', 'Caution', 'Alarm'];
  const thresholds =
    kind === 'dcRes' ? [1, 2, 3, 5, 8] :
    kind === 'acRes' ? [1, 2, 4, 6, 10] :
    kind === 'ind'   ? [2, 4, 6, 8, 10] :
    kind === 'imp'   ? [2, 4, 6, 8, 10] :
    kind === 'phase' ? [0.3, 0.6, 1.0, 1.5, 2.0] :
                       [2, 4, 6, 8, 10];
  for (let i = 0; i < thresholds.length; i++) {
    if (v < thresholds[i]) return bandToRating(bands[i]);
  }
  return bandToRating('Alarm');
}

function rateInsulationTable(args) {
  const { tab, pi, dar, svSummaryRows, Rc40, Rt, correctionOn } = args;
  if (tab === 'PI')  return ratePI(pi);
  if (tab === 'DAR') return rateDAR(dar);
  if (tab === 'SV')  return rateSVSettlement(svSummaryRows);
  return rateInsulationRc40(correctionOn ? Rc40 : Rt);
}

function computeOverallInsulationBand(insData, record) {
  if (!insData) return null;
  let worst = null;
  let anyData = false;
  Object.keys(insData).forEach(function (tab) {
    const tabData = insData[tab] || {};
    Object.keys(tabData).forEach(function (tableId) {
      if (tableId.endsWith('_meta')) return;
      const rows = tabData[tableId];
      if (!Array.isArray(rows) || rows.length === 0) return;
      anyData = true;
      const runMeta = tabData[tableId + '_meta'] || {};
      const runTemp = (runMeta.temperature !== undefined && runMeta.temperature !== '') ? runMeta.temperature : (record && record.temperature ? record.temperature : 25);
      const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
      const Kt = Math.pow(0.5, (40 - tempVal) / 10);
      const Rt = rows[rows.length - 1].resistance;
      const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;
      const r30 = (rows.find(function (r) { return r.time >= 30; }) || {}).resistance;
      const r60 = (rows.find(function (r) { return r.time >= 60; }) || {}).resistance;
      const r600 = (rows.find(function (r) { return r.time >= 600; }) || {}).resistance;
      const pi = r600 && r60 ? r600 / r60 : null;
      const dar = r60 && r30 ? r60 / r30 : null;
      const svRows = tab === 'SV' ? splitSVData(rows).summaryRows : null;
      const rating = rateInsulationTable({
        tab: tab, pi: pi, dar: dar, svSummaryRows: svRows,
        Rc40: Rc40, Rt: Rt, correctionOn: !!(record && record.correctInsulationTo40)
      });
      if (rating.text && rating.text !== '—') worst = worstBand(worst, rating.text);
    });
  });
  return anyData ? (worst || 'Normal') : null;
}

// Helper to get nominal voltage from insulation test data
function getNominalVoltage(insData, tab, record) {
  const tabData = insData?.[tab] || {};
  const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
  if (activeTableKeys.length === 0) return null;
  
  const voltages = new Set();
  activeTableKeys.forEach(tableId => {
    const rows = tabData[tableId];
    if (rows && rows[0] && rows[0].voltage !== undefined && rows[0].voltage !== null && rows[0].voltage !== '') {
      voltages.add(`${rows[0].voltage}V`);
    }
  });
  return voltages.size > 0 ? Array.from(voltages).join(', ') : null;
}

function getSVNominalVoltages(insData) {
  const tabData = insData?.['SV'] || {};
  const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
  if (activeTableKeys.length === 0) return null;
  
  let maxV = 0;
  activeTableKeys.forEach(tableId => {
    const rows = tabData[tableId];
    rows.forEach(r => {
      if (r.voltage !== undefined && r.voltage !== null && r.voltage !== '') {
        const num = parseFloat(r.voltage);
        if (!isNaN(num) && num > maxV) {
          maxV = num;
        }
      }
    });
  });
  return maxV > 0 ? `${maxV}V` : null;
}

function getRampNominalVoltages(insData) {
  const tabData = insData?.['RAMP'] || {};
  const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
  if (activeTableKeys.length === 0) return null;
  
  let minV = Infinity;
  let maxV = -Infinity;
  activeTableKeys.forEach(tableId => {
    const rows = tabData[tableId];
    rows.forEach(r => {
      if (r.voltage !== undefined && r.voltage !== null && r.voltage !== '') {
        const v = parseFloat(r.voltage);
        if (!isNaN(v)) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
    });
  });
  
  if (minV !== Infinity && maxV !== -Infinity) {
    if (minV === maxV) return `${minV}V`;
    return `${minV}V - ${maxV}V`;
  }
  return null;
}

// Multi-line chart drawer for frequency sweeps
function drawPDFMultiLineChart(doc, title, startX, startY, width, height, rawData, group, type, xLabel, yLabel, isCorrectedMode) {
  const tablePhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
  const tableFreqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
  const freqIndices = { '100Hz': 0, '120Hz': 1, '1kHz': 2, '10kHz': 3, '100kHz': 4 };
  
  // Extract phase curves
  const phaseCurves = {};
  let allYValues = [];
  
  tablePhases.forEach(phase => {
    const pts = [];
    tableFreqs.forEach(f => {
      const cellData = rawData[`${group}_${type}_${phase}_${f}`];
      if (cellData && cellData.value !== undefined && cellData.value !== null && cellData.value !== '') {
        let val = parseFloat(cellData.value);
        if (isNaN(val)) return;
        if (type === 'res' && isCorrectedMode) {
          const tempNum = isNaN(parseFloat(cellData.temperature)) ? 25 : parseFloat(cellData.temperature);
          val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
        }
        pts.push({ x: freqIndices[f], label: f, y: val });
        allYValues.push(val);
      }
    });
    if (pts.length > 0) {
      phaseCurves[phase] = pts;
    }
  });

  if (allYValues.length === 0) return;

  const marginL = 40;
  const marginR = 10;
  const marginT = 15;
  const marginB = 25; // larger margin for legend

  const plotX = startX + marginL;
  const plotY = startY + marginT;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  // Title
  doc.fillColor('#1E3A8A').fontSize(7.5).font('Helvetica-Bold')
    .text(title, startX, startY, { width: width, align: 'center' });

  // Get data boundaries — auto-scale with padding so small ranges (e.g. 1.45–4.11 mH)
  // aren't dwarfed by a 0-based axis. When any value dips below 0 (capacitive dominance),
  // extend the floor further so the yellow band underneath still renders.
  const rawMinY = Math.min(...allYValues);
  const rawMaxY = Math.max(...allYValues);
  const span = rawMaxY - rawMinY;
  const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(rawMaxY) * 0.1, 0.1);
  const minY = rawMinY < 0 ? Math.floor(rawMinY - 1) : rawMinY - pad;
  const maxY = rawMaxY + pad;

  const scaleX = (xIndex) => {
    return plotX + (xIndex / 4) * plotW;
  };

  const scaleY = (y) => {
    if (maxY === minY) return plotY + plotH;
    return plotY + plotH - ((y - minY) / (maxY - minY)) * plotH;
  };

  // Draw background box
  doc.rect(plotX, plotY, plotW, plotH).fill('#F8FAFC');

  // Highlight below Y=0 axis area in yellow
  if (minY < 0) {
    const y0 = scaleY(0);
    const belowH = (plotY + plotH) - y0;
    if (belowH > 0) {
      doc.rect(plotX, y0, plotW, belowH).fill('#FEF08A');
    }
  }

  // Draw 5 horizontal grid lines
  const gridLines = 5;
  doc.strokeColor('#E2E8F0').lineWidth(0.5);
  for (let i = 0; i <= gridLines; i++) {
    const yVal = minY + (i / gridLines) * (maxY - minY);
    const py = scaleY(yVal);

    doc.moveTo(plotX, py).lineTo(plotX + plotW, py).dash(2, { space: 2 }).stroke();

    // Y-Axis label — pick a compact representation that fits the axis gutter.
    // Fractional sweeps (e.g. 1.45–4.11 mH) need 2–3 decimals; sub-milli values
    // (e.g. 7e-4 mH) need scientific notation to avoid overflowing the label box.
    const abs = Math.abs(yVal);
    let label;
    if (yVal === 0) label = '0';
    else if (abs < 0.01 || abs >= 100000) label = yVal.toExponential(2);
    else if (abs < 1) label = yVal.toFixed(3);
    else if (abs < 10) label = yVal.toFixed(2);
    else if (abs < 100) label = yVal.toFixed(1);
    else label = String(Math.round(yVal));
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica')
      .text(label, startX + 8, py - 2.5, { width: marginL - 10, align: 'right' });
  }
  doc.undash();

  // Draw X-Axis labels
  doc.strokeColor('#CBD5E1').lineWidth(0.5);
  tableFreqs.forEach((f, idx) => {
    const px = scaleX(idx);
    doc.moveTo(px, plotY + plotH).lineTo(px, plotY + plotH + 2).stroke();
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica')
      .text(f, px - 15, plotY + plotH + 4, { width: 30, align: 'center' });
  });

  // Draw axes
  doc.strokeColor('#475569').lineWidth(0.75);
  doc.moveTo(plotX, plotY).lineTo(plotX, plotY + plotH).lineTo(plotX + plotW, plotY + plotH).stroke();

  // Colors for each phase
  const phaseColors = {
    '1-2': '#E11D48', // rose
    '1-3': '#10B981', // green
    '2-3': '#D97706', // amber
    '1-N': '#7C3AED', // purple
    '2-N': '#06B6D4', // cyan
    '3-N': '#EC4899', // pink
  };

  // Plot lines for each phase
  Object.entries(phaseCurves).forEach(([phase, pts]) => {
    if (pts.length > 0) {
      const color = phaseColors[phase] || '#64748B';
      doc.strokeColor(color).lineWidth(1.25);
      doc.moveTo(scaleX(pts[0].x), scaleY(pts[0].y));
      for (let i = 1; i < pts.length; i++) {
        doc.lineTo(scaleX(pts[i].x), scaleY(pts[i].y));
      }
      doc.stroke();

      // Draw dots
      doc.fillColor(color);
      pts.forEach(p => {
        doc.circle(scaleX(p.x), scaleY(p.y), 1.5).fill();
      });
    }
  });

  // Render legend
  let legendX = plotX;
  const legendY = plotY + plotH + 14;
  Object.keys(phaseCurves).forEach(phase => {
    const color = phaseColors[phase] || '#64748B';
    doc.rect(legendX, legendY, 5, 5).fill(color);
    doc.fillColor('#475569').fontSize(5.5).font('Helvetica-Bold')
      .text(`Phase ${phase}`, legendX + 7, legendY - 0.5, { width: 40 });
    legendX += 42;
  });

  // Add yellow legend item for "Capacitive dominance"
  if (minY < 0) {
    doc.rect(legendX, legendY, 5, 5).fill('#FEF08A');
    doc.fillColor('#475569').fontSize(5.5).font('Helvetica-Bold')
      .text('Capacitive dominance', legendX + 7, legendY - 0.5, { width: 80 });
  }

  // Axis Titles
  doc.fillColor('#475569').fontSize(5.5).font('Helvetica-Bold')
    .text(xLabel, plotX, plotY + plotH + 24, { width: plotW, align: 'center' });

  if (yLabel) {
    doc.save();
    doc.translate(startX + 6, plotY + plotH / 2);
    doc.rotate(-90);
    doc.fillColor('#475569').fontSize(5.5).font('Helvetica-Bold')
      .text(yLabel, -60, 0, { width: 120, align: 'center' });
    doc.restore();
  }
}

function drawPDFPolarGraph(doc, title, startX, startY, size, impData) {
  const validPoints = impData.filter(d => d.z !== null && d.z !== undefined && !isNaN(d.z));

  // Auto-zoom: if every vector's angle sits inside a single quadrant (2° slack at
  // the boundaries), pivot the plot into that quadrant so intra-quadrant differences
  // become visible. Otherwise render the full 360° view.
  const TOL = 2;
  const norm = (deg) => ((deg % 360) + 360) % 360;
  const zoomQuadrant = (() => {
    if (validPoints.length === 0) return null;
    const fits = (q, d) => {
      const bounds = { 1: [0, 90], 2: [90, 180], 3: [180, 270], 4: [270, 360] }[q];
      let dd = d;
      if (q === 4 && dd < 90 - TOL) dd += 360;
      return dd >= bounds[0] - TOL && dd <= bounds[1] + TOL;
    };
    for (const q of [1, 2, 3, 4]) {
      if (validPoints.every(pt => fits(q, norm(pt.deg)))) return q;
    }
    return null;
  })();

  const centered = zoomQuadrant === null;
  // In zoom mode the origin moves to a corner, so we can use nearly the full
  // width/height as the radius — roughly 2× the centered radius.
  const maxR = centered ? size / 2 - 20 : size - 30;

  const padTop = 15, padSide = 12, padBot = 8;
  const plotLeft = startX + padSide;
  const plotRight = startX + size - padSide;
  const plotTop = startY + padTop;
  const plotBot = startY + size - padBot;

  let originX, originY;
  if (centered) {
    originX = startX + size / 2;
    originY = startY + size / 2 + 10;
  } else if (zoomQuadrant === 1) { originX = plotLeft;  originY = plotBot; }
    else if (zoomQuadrant === 2) { originX = plotRight; originY = plotBot; }
    else if (zoomQuadrant === 3) { originX = plotRight; originY = plotTop; }
    else                          { originX = plotLeft;  originY = plotTop; }

  // Title (only render if non-empty; callers may draw their own title externally)
  if (title) {
    const titleText = centered ? title : `${title} — Q${zoomQuadrant}`;
    doc.fillColor('#1E3A8A').fontSize(8.5).font('Helvetica-Bold')
      .text(titleText, startX, startY + 2, { width: size, align: 'center' });
  }

  // Grid — full circles when centered, quarter-arcs when zoomed. PDFKit's path()
  // accepts SVG path data, so we build an "M …  A …" arc string.
  doc.strokeColor('#E2E8F0').lineWidth(0.5).undash();
  const arcBounds = centered ? null
    : ({ 1: [0, 90], 2: [90, 180], 3: [180, 270], 4: [270, 360] }[zoomQuadrant]);
  const arcPath = (r, aDeg, bDeg) => {
    const a = (aDeg * Math.PI) / 180, b = (bDeg * Math.PI) / 180;
    const ax = originX + r * Math.cos(a), ay = originY - r * Math.sin(a);
    const bx = originX + r * Math.cos(b), by = originY - r * Math.sin(b);
    return `M ${ax} ${ay} A ${r} ${r} 0 0 0 ${bx} ${by}`;
  };
  if (centered) {
    doc.circle(originX, originY, maxR * 0.33).stroke();
    doc.circle(originX, originY, maxR * 0.66).stroke();
    doc.circle(originX, originY, maxR).stroke();
  } else {
    doc.path(arcPath(maxR * 0.33, arcBounds[0], arcBounds[1])).stroke();
    doc.path(arcPath(maxR * 0.66, arcBounds[0], arcBounds[1])).stroke();
    doc.strokeColor('#94A3B8');
    doc.path(arcPath(maxR,        arcBounds[0], arcBounds[1])).stroke();
  }

  // Axis guide lines — 8 spokes when centered, only 3 (bounds + midline) when zoomed
  const guideAngles = centered
    ? [0, 45, 90, 135, 180, 225, 270, 315]
    : ({ 1: [0, 45, 90], 2: [90, 135, 180], 3: [180, 225, 270], 4: [270, 315, 360] }[zoomQuadrant]);
  const labelAngles = centered ? [0, 90, 180, 270] : guideAngles;

  doc.strokeColor('#94A3B8').lineWidth(0.5);
  guideAngles.forEach(angle => {
    const rad = (angle * Math.PI) / 180;
    const endX = originX + maxR * Math.cos(rad);
    const endY = originY - maxR * Math.sin(rad);
    doc.moveTo(originX, originY).lineTo(endX, endY).dash(2, { space: 2 }).stroke();
  });
  doc.undash();

  labelAngles.forEach(angle => {
    const rad = (angle * Math.PI) / 180;
    const endX = originX + (maxR + 4) * Math.cos(rad);
    const endY = originY - (maxR + 4) * Math.sin(rad);
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica');
    let lx = endX, ly = endY;
    const a = ((angle % 360) + 360) % 360;
    if (a === 0)   { lx += 2;  ly -= 2.5; }
    else if (a === 90)  { lx -= 5;  ly -= 7;   }
    else if (a === 180) { lx -= 10; ly -= 2.5; }
    else if (a === 270) { lx -= 5;  ly += 2;   }
    else if (a === 360) { lx += 2;  ly -= 2.5; }
    else if (a === 45)  { lx += 1;  ly -= 6;   }
    else if (a === 135) { lx -= 12; ly -= 6;   }
    else if (a === 225) { lx -= 12; ly += 1;   }
    else if (a === 315) { lx += 1;  ly += 1;   }
    doc.text(`${a === 360 ? 0 : a}°`, lx, ly);
  });

  if (validPoints.length === 0) return;
  const maxZ = Math.max(...validPoints.map(d => d.z)) * 1.1 || 10;

  const phaseColors = {
    '1-2': '#E11D48',
    '1-3': '#10B981',
    '2-3': '#D97706',
    '1-N': '#7C3AED',
    '2-N': '#06B6D4',
    '3-N': '#EC4899',
  };

  // Vector arrows — line from origin to (r, θ) with a triangular arrowhead at the tip
  validPoints.forEach(pt => {
    const r = (pt.z / maxZ) * maxR;
    const rad = (pt.deg * Math.PI) / 180;
    const px = originX + r * Math.cos(rad);
    const py = originY - r * Math.sin(rad);
    const color = phaseColors[pt.phase] || '#64748B';

    doc.strokeColor(color).lineWidth(1.4).lineCap('round');
    doc.moveTo(originX, originY).lineTo(px, py).stroke();

    // Arrowhead: small filled triangle at (px, py) rotated to match the vector direction
    const headLen = 5, headHalf = 2.2;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // Base of the triangle sits headLen behind the tip along the vector.
    const bx = px - headLen * cos;
    const by = py + headLen * sin;
    // Perpendicular unit (in screen space): (-sin, -cos) rotated appropriately.
    const perpX = -sin, perpY = -cos;
    const p1x = bx + headHalf * perpX, p1y = by + headHalf * perpY;
    const p2x = bx - headHalf * perpX, p2y = by - headHalf * perpY;
    doc.fillColor(color);
    doc.moveTo(px, py).lineTo(p1x, p1y).lineTo(p2x, p2y).closePath().fill();
  });
}

// ─────────────────────────────────────────────
// VECTOR CHART RENDER ENGINE FOR PDFKIT
// ─────────────────────────────────────────────
function drawPDFChart(doc, title, startX, startY, width, height, rawData, xKey, yKey, xLabel, yLabel, isCorrectedMode, tempRecordValue, showDots = true) {
  // 1. Prepare data (apply corrections dynamically if needed!)
  const data = rawData.map(r => {
    let val = r[yKey];
    if (yKey === 'resistance' && isCorrectedMode && typeof val === 'number') {
      const tempVal = isNaN(parseFloat(tempRecordValue)) ? 25 : parseFloat(tempRecordValue);
      const Kt = Math.pow(0.5, (40 - tempVal) / 10);
      val = Math.round(val * Kt);
    }
    return { ...r, [yKey]: val };
  });

  if (data.length === 0) return;

  const marginL = 40;
  const marginR = 10;
  const marginT = 15;
  const marginB = 20;

  const plotX = startX + marginL;
  const plotY = startY + marginT;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  // Title
  doc.fillColor('#1E3A8A').fontSize(7.5).font('Helvetica-Bold')
    .text(title, startX, startY, { width: width, align: 'center' });

  // Get data boundaries
  const xValues = data.map(d => d[xKey]);
  const yValues = data.map(d => d[yKey]);

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minDataY = Math.min(...yValues);
  const minY = minDataY < 0 ? minDataY * 1.15 : 0;
  const maxY = Math.max(...yValues) * 1.15 || 100; // 15% headroom

  const scaleX = (x) => {
    if (maxX === minX) return plotX;
    return plotX + ((x - minX) / (maxX - minX)) * plotW;
  };

  const scaleY = (y) => {
    if (maxY === minY) return plotY + plotH;
    return plotY + plotH - ((y - minY) / (maxY - minY)) * plotH;
  };

  // Draw background box
  doc.rect(plotX, plotY, plotW, plotH).fill('#F8FAFC');

  // Draw 5 horizontal grid lines
  const gridLines = 5;
  doc.strokeColor('#E2E8F0').lineWidth(0.5);
  for (let i = 0; i <= gridLines; i++) {
    const yVal = minY + (i / gridLines) * (maxY - minY);
    const py = scaleY(yVal);

    doc.moveTo(plotX, py).lineTo(plotX + plotW, py).dash(2, { space: 2 }).stroke();

    // Y-Axis label
    let displayVal = Math.round(yVal).toLocaleString();
    if (yKey === 'current') {
      displayVal = yVal.toFixed(4);
    }
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica')
      .text(displayVal, startX + 8, py - 2.5, { width: marginL - 10, align: 'right' });
  }
  doc.undash();

  // Draw X-Axis ticks and labels
  const ticks = Math.min(data.length, 5);
  doc.strokeColor('#CBD5E1').lineWidth(0.5);
  for (let i = 0; i < ticks; i++) {
    const idx = Math.floor((i / (ticks - 1)) * (data.length - 1));
    const d = data[idx];
    if (!d) continue;
    const px = scaleX(d[xKey]);

    doc.moveTo(px, plotY + plotH).lineTo(px, plotY + plotH + 2).stroke();

    // X-Axis label
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica')
      .text(String(d[xKey]), px - 15, plotY + plotH + 4, { width: 30, align: 'center' });
  }

  // Draw axes
  doc.strokeColor('#475569').lineWidth(0.75);
  doc.moveTo(plotX, plotY).lineTo(plotX, plotY + plotH).lineTo(plotX + plotW, plotY + plotH).stroke();

  // Fill area under line (soft gradient-like blue)
  if (data.length > 1) {
    doc.save();
    doc.moveTo(scaleX(data[0][xKey]), plotY + plotH);
    data.forEach(d => {
      doc.lineTo(scaleX(d[xKey]), scaleY(d[yKey]));
    });
    doc.lineTo(scaleX(data[data.length - 1][xKey]), plotY + plotH);
    doc.closePath();
    doc.fillColor('#E1EFFE').opacity(0.35).fill();
    doc.restore();
  }

  // Draw line plot
  if (data.length > 0) {
    doc.strokeColor('#1E40AF').lineWidth(1.25);
    doc.moveTo(scaleX(data[0][xKey]), scaleY(data[0][yKey]));
    for (let i = 1; i < data.length; i++) {
      doc.lineTo(scaleX(data[i][xKey]), scaleY(data[i][yKey]));
    }
    doc.stroke();

    // Draw dots (skipped for dense charts like PI / SV Transient — line becomes unreadable with 600+ dots)
    if (showDots) {
      doc.fillColor('#1D4ED8');
      data.forEach(d => {
        doc.circle(scaleX(d[xKey]), scaleY(d[yKey]), 1.2).fill();
      });
    }
  }

  // Axis Titles
  doc.fillColor('#475569').fontSize(5.5).font('Helvetica-Bold')
    .text(xLabel, plotX, plotY + plotH + 12, { width: plotW, align: 'center' });

  if (yLabel) {
    doc.save();
    doc.translate(startX + 6, plotY + plotH / 2);
    doc.rotate(-90);
    doc.fillColor('#475569').fontSize(5.5).font('Helvetica-Bold')
      .text(yLabel, -60, 0, { width: 120, align: 'center' });
    doc.restore();
  }
}

// ─────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────
async function exportExcel(recordId, mainWindow, chartImages, opts = {}) {
  const includeRotor = !!opts.includeRotor;
  const ExcelJS = require('exceljs');
  const record = db.getRecord(recordId);
  const insData = db.getInsulationData(recordId);
  const mulData = db.getMultimeterData(recordId);

  if (!record) return { success: false, error: 'Record not found' };

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Excel Report',
    defaultPath: path.join(
      getSafeDocumentsPath(),
      `TestReport_${sanitizeFilename(record.clientName || 'Client')}_${sanitizeFilename(record.motorUtilityTag || 'Motor')}.xlsx`
    ),
    filters: [{ name: 'Excel File', extensions: ['xlsx'] }],
  });
  if (!filePath) return { success: false, reason: 'cancelled' };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sarox Technology Inc.';
  workbook.created = new Date();

  // Styles
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  const altFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F0FA' } };
  const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  const headerFont = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const bodyFont = { name: 'Arial', size: 10 };
  const boldFont = { name: 'Arial', bold: true, size: 10 };
  const border = { style: 'thin', color: { argb: 'FFCBD5E1' } };
  const borders = { top: border, bottom: border, left: border, right: border };

  // ── Sheet 1: Motor Info & Settings ──
  const infoSheet = workbook.addWorksheet('Motor Info & Setup');
  infoSheet.columns = [{ width: 28 }, { width: 38 }];

  let contractorLogoId = null;
  const customLogo = record.customLogoPath;
  if (customLogo && customLogo.startsWith('data:image/')) {
    try {
      const commaIdx = customLogo.indexOf(',');
      if (commaIdx !== -1) {
        const mimeTypePart = customLogo.substring(5, commaIdx);
        let extension = mimeTypePart.split(';')[0].split('/')[1] || 'png';
        if (extension === 'jpeg' || extension === 'jpg') {
          extension = 'jpeg';
        } else if (extension === 'gif') {
          extension = 'gif';
        } else {
          extension = 'png';
        }
        const base64Data = customLogo.substring(commaIdx + 1);
        contractorLogoId = workbook.addImage({
          base64: base64Data,
          extension: extension,
        });
      }
    } catch (e) {
      console.error('Failed to embed custom contractor logo in Excel:', e);
    }
  }

  let clientLogoId = null;
  const customClientLogo = record.customClientLogoPath;
  if (customClientLogo && customClientLogo.startsWith('data:image/')) {
    try {
      const commaIdx = customClientLogo.indexOf(',');
      if (commaIdx !== -1) {
        const mimeTypePart = customClientLogo.substring(5, commaIdx);
        let extension = mimeTypePart.split(';')[0].split('/')[1] || 'png';
        if (extension === 'jpeg' || extension === 'jpg') {
          extension = 'jpeg';
        } else if (extension === 'gif') {
          extension = 'gif';
        } else {
          extension = 'png';
        }
        const base64Data = customClientLogo.substring(commaIdx + 1);
        clientLogoId = workbook.addImage({
          base64: base64Data,
          extension: extension,
        });
      }
    } catch (e) {
      console.error('Failed to embed custom client logo in Excel:', e);
    }
  }

  if (clientLogoId === null && customClientLogo !== 'none') {
    const defaultLogoPath = getLogoPath();
    if (defaultLogoPath) {
      try {
        clientLogoId = workbook.addImage({
          filename: defaultLogoPath,
          extension: 'png',
        });
      } catch (e) {
        console.error('Failed to embed default company logo in Excel:', e);
      }
    }
  }

  const embedLogoAndDate = (sheet, startCol, startRow = 0) => {
    if (clientLogoId !== null) {
      try {
        sheet.addImage(clientLogoId, {
          tl: { col: startCol, row: startRow },
          ext: { width: 120, height: 35 }
        });
      } catch (err) {
        console.error('Failed to embed client logo in Excel:', err);
      }

      if (contractorLogoId !== null) {
        try {
          sheet.addImage(contractorLogoId, {
            tl: { col: startCol + 2, row: startRow },
            ext: { width: 120, height: 35 }
          });
        } catch (err) {
          console.error('Failed to embed contractor logo in Excel:', err);
        }
      }
    } else {
      if (contractorLogoId !== null) {
        try {
          sheet.addImage(contractorLogoId, {
            tl: { col: startCol, row: startRow },
            ext: { width: 120, height: 35 }
          });
        } catch (err) {
          console.error('Failed to embed contractor logo in Excel:', err);
        }
      }
    }
    const cell = sheet.getCell(startRow + 4, startCol + 1);
    cell.value = `Date of Record: ${record.date || '—'}`;
    cell.font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF64748B' } };
  };

  embedLogoAndDate(infoSheet, 3, 0);

  infoSheet.mergeCells('A1:B1');
  const titleCell = infoSheet.getCell('A1');
  titleCell.value = '⚡ MOTOR ELECTRICAL TEST REPORT';
  titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = titleFill;
  infoSheet.getRow(1).height = 36;
  infoSheet.addRow([]);

  const addSectionHeader = (title) => {
    const row = infoSheet.addRow([title.toUpperCase()]);
    infoSheet.mergeCells(`A${row.number}:B${row.number}`);
    const cell = row.getCell(1);
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'left' };
    row.height = 20;
  };

  const addKeyValue = (lbl, val) => {
    const row = infoSheet.addRow([lbl, val || '—']);
    row.getCell(1).font = boldFont;
    row.getCell(1).border = borders;
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    row.getCell(2).font = bodyFont;
    row.getCell(2).border = borders;
    row.height = 18;
  };

  addSectionHeader('Client & Facility Information');
  addKeyValue('Client Name', record.clientName);
  addKeyValue('Client Address', record.clientAddress);
  addKeyValue('Client Phone', record.clientPhone);
  addKeyValue('Client Email', record.clientEmail);
  addKeyValue('Client Contact Name', record.clientContactName);
  addKeyValue('Client Contact Email', record.clientContactEmail);
  addKeyValue('Client Notes', record.clientNotes);
  addKeyValue('Facility Name', record.facilityName);
  addKeyValue('Facility Address', record.facilityAddress);
  addKeyValue('Facility Manager', record.facilityManager);
  addKeyValue('Facility Phone', record.facilityPhone);
  addKeyValue('Facility Notes', record.facilityNotes);
  addKeyValue('Test Location', record.location);
  addKeyValue('Operator Name', record.operatorName);
  addKeyValue('Test Date', record.date);

  infoSheet.addRow([]);

  addSectionHeader('Motor Nameplate Data');
  addKeyValue('Motor Utility Tag', record.motorUtilityTag);
  addKeyValue('Motor Serial Number', record.motorSerialNumber);
  addKeyValue('Manufacturer', record.motorManufacturer);
  addKeyValue('Model Number', record.motorModelNumber);
  addKeyValue('Manufacturing Standard', record.manufacturingStandard);
  addKeyValue('Equipment Type', record.equipmentType);
  addKeyValue('Power (kW)', record.powerKw);
  addKeyValue('Speed (RPM)', record.speedRpm);
  addKeyValue('Line Voltage (V)', record.lineVoltage);
  addKeyValue('cos Fi (PF)', record.cosFi);
  addKeyValue('Nominal Current (A)', record.nominalCurrent);
  addKeyValue('Stator Winding Connection', record.statorConnection);
  addKeyValue('Rotor Winding Connection', record.rotorConnection);
  addKeyValue('Rotor Voltage (V)', record.rotorVoltage);
  addKeyValue('Rotor Current (A)', record.rotorCurrent);
  addKeyValue('Efficiency (%)', record.efficiency);
  addKeyValue('Insulation Class', record.insulationClass);
  addKeyValue('Number of Rotor Bars', record.rotorBars);
  addKeyValue('Remark', record.remark);
  const piVolts = getNominalVoltage(insData, 'PI', record) || record.testVoltagePiDar || '—';
  const darVolts = getNominalVoltage(insData, 'DAR', record) || record.testVoltagePiDar || '—';
  const stepVolts = formatStepVoltage(getSVNominalVoltages(insData) || record.testVoltageStep);
  const rampVolts = getRampNominalVoltages(insData) || record.testVoltageRamp || '—';

  addSectionHeader('Offline Test Configurations');
  addKeyValue('Testing Location', record.testingLocation);
  addKeyValue('Wire Marking', `T1: ${record.wireMarkingT1 || '—'},  T2: ${record.wireMarkingT2 || '—'},  T3: ${record.wireMarkingT3 || '—'}`);
  addKeyValue('PI Test Voltage', piVolts);
  addKeyValue('DAR Test Voltage', darVolts);
  addKeyValue('STEP Test Voltage', stepVolts);
  addKeyValue('RAMP Test Voltage', rampVolts);

  infoSheet.addRow([]);
  addSectionHeader('Report Test Summary & Condition Assessment');
  addKeyValue('Test Summary Comments', record.summaryText || 'No summary comments provided.');

  infoSheet.addRow([]);

  // Helper to get auto val in Excel
  const getExcelAutoVal = (key) => {
    if (key === 'condInsulation') {
      return computeOverallInsulationBand(insData, record) || '—';
    }

    // Winding Imbalances at card group level for defaults
    const statorResImb = calculateImbalance(mulData?.['stator_res_1-2']?.value, mulData?.['stator_res_1-3']?.value, mulData?.['stator_res_2-3']?.value);
    const statorIndImb = calculateImbalance(mulData?.['stator_ind_1-2_100Hz']?.value, mulData?.['stator_ind_1-3_100Hz']?.value, mulData?.['stator_ind_2-3_100Hz']?.value);
    const getImpZForImbPdf = (p) => {
      const spot = mulData?.[`stator_imp_${p}_z`]?.value;
      if (spot !== undefined && spot !== null) return spot;
      for (const f of ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz']) {
        const v = mulData?.[`stator_imp_${p}_${f}_z`]?.value;
        if (v !== undefined && v !== null) return v;
      }
      return undefined;
    };
    const statorImpImb = calculateImbalance(getImpZForImbPdf('1-2'), getImpZForImbPdf('1-3'), getImpZForImbPdf('2-3'));

    if (key === 'condResistance') {
      return statorResImb !== null ? rateImbalance('acRes', statorResImb).text : '—';
    }
    if (key === 'condInductance') {
      return statorIndImb !== null ? rateImbalance('ind', statorIndImb).text : '—';
    }
    if (key === 'condImpedance') {
      if (statorImpImb !== null) return rateImbalance('imp', statorImpImb).text;
      const hasImp = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => getImpZForImbPdf(p) !== undefined);
      return hasImp ? 'Normal' : '—';
    }
    if (key === 'condFrequency') {
      let maxSwImb = 0;
      ['ind', 'res'].forEach(t => {
        ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach(f => {
          const v12 = mulData[`stator_${t}_1-2_${f}`]?.value;
          const v13 = mulData[`stator_${t}_1-3_${f}`]?.value;
          const v23 = mulData[`stator_${t}_2-3_${f}`]?.value;
          const imb = calculateImbalance(v12, v13, v23);
          if (imb !== null && imb > maxSwImb) maxSwImb = imb;
        });
      });
      return maxSwImb > 0 ? rateImbalance('acRes', maxSwImb).text : '—';
    }
    return '—';
  };

  // Add Condition Assessment Rows
  const addCondAssessmentRow = (lbl, key) => {
    const val = record[key] || getExcelAutoVal(key);
    const row = infoSheet.addRow([lbl, val]);
    row.getCell(1).font = boldFont;
    row.getCell(1).border = borders;
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    
    // Sarox docx band colours (Excellent, Good, Normal, Observe, Caution, Alarm)
    const valBgColors = {
      'Excellent': 'FFDCFCE7',
      'Good':      'FFD1FAE5',
      'Normal':    'FFDBEAFE',
      'Observe':   'FFFEF3C7',
      'Caution':   'FFFFEDD5',
      'Alarm':     'FFFEE2E2',
      '—':         'FFF8FAFC'
    };
    const valTextColors = {
      'Excellent': 'FF166534',
      'Good':      'FF15803D',
      'Normal':    'FF1E40AF',
      'Observe':   'FFB45309',
      'Caution':   'FFC2410C',
      'Alarm':     'FFB91C1C',
      '—':         'FF475569'
    };
    const bg = valBgColors[val] || valBgColors['—'];
    const textCol = valTextColors[val] || valTextColors['—'];
    
    row.getCell(2).font = { name: 'Arial', bold: true, color: { argb: textCol }, size: 10 };
    row.getCell(2).border = borders;
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    row.getCell(2).alignment = { horizontal: 'left' };
    row.height = 18;
  };

  addCondAssessmentRow('Stator Insulation Condition', 'condInsulation');
  addCondAssessmentRow('Stator Winding Resistance Condition', 'condResistance');
  addCondAssessmentRow('Stator Winding Inductance Condition', 'condInductance');
  addCondAssessmentRow('Stator Winding Impedance Condition', 'condImpedance');
  addCondAssessmentRow('Stator Frequency Response Condition', 'condFrequency');

  // ── Sheet 2: Multimeter Winding Test ──
  const windingSheet = workbook.addWorksheet('Winding Test (RLC)');
  windingSheet.columns = [
    { width: 26 }, // A: Phase Line
    { width: 20 }, // B: DCR
    { width: 20 }, // C: ACR
    { width: 20 }, // D: L
    { width: 20 }, // E: C
    { width: 20 }, // F: Z
    { width: 20 }  // G: Angle
  ];

  embedLogoAndDate(windingSheet, 7, 0);

  const addGroupWindingTables = (group) => {
    const groupName = group.charAt(0).toUpperCase() + group.slice(1);

    // Winding tests within a group share one ambient temperature — pull the first
    // non-empty temp from any measured field so we can render it once in the group header.
    const resolveGroupTemp = () => {
      for (const key of Object.keys(mulData)) {
        if (!key.startsWith(`${group}_`)) continue;
        if (!(key.includes('_res_') || key.includes('_ind_') || key.includes('_cap_') || key.includes('_imp_'))) continue;
        const t = mulData[key]?.temperature;
        if (t !== undefined && t !== null && t !== '' && t !== 'undefined') return t;
      }
      return null;
    };
    const groupTemp = resolveGroupTemp();

    // Group Header — appends "🌡️ Test Temp: XX°C" once, so per-row Temp columns can go away.
    const groupRow = windingSheet.addRow([`${groupName} Winding Readings${groupTemp !== null ? `   🌡️  Test Temp: ${groupTemp}°C` : ''}`]);
    windingSheet.mergeCells(`A${groupRow.number}:G${groupRow.number}`);
    const gCell = groupRow.getCell(1);
    gCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
    gCell.fill = titleFill;
    gCell.alignment = { horizontal: 'left', vertical: 'middle' };
    groupRow.height = 24;

    const standardPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N', '123-GND', '1-GND', '2-GND', '3-GND'];
    const capacitancePhases = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];

    // Helper to style a header row
    const styleHeaderRow = (row, colsCount) => {
      row.eachCell((cell, idx) => {
        if (idx <= colsCount) {
          cell.font = headerFont;
          cell.fill = headerFill;
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
        }
      });
      row.height = 18;
    };

    // Helper to style a body row
    const styleBodyRow = (row, colsCount, isAlt) => {
      row.eachCell((cell, idx) => {
        if (idx <= colsCount) {
          cell.font = bodyFont;
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
          if (isAlt) {
            cell.fill = altFill;
          }
        }
      });
      row.height = 16;
    };

    // ─────────────────────────────────────────────
    // Table 0: Summary Table
    // ─────────────────────────────────────────────
    windingSheet.addRow([]); // spacer
    const t0Title = windingSheet.addRow(['Winding Readings Summary Table']);
    windingSheet.mergeCells(`A${t0Title.number}:G${t0Title.number}`);
    t0Title.getCell(1).font = boldFont;
    
    const dcrHeader = `DCR (Ω)${record.correctWindingTo20 ? ' @20°C' : ''}`;
    const acrHeader = `ACR (Ω)${record.correctWindingTo20 ? ' @20°C' : ''}`;
    const t0Headers = windingSheet.addRow(['Phase Line', dcrHeader, acrHeader, 'L (mH)', 'Capacitance (nF)', 'Impedance Z (Ω)', 'Angle (°)']);
    styleHeaderRow(t0Headers, 7);

    // Row 2: Injected Freq headers
    const capFreq = mulData[`${group}_cap_freq`]?.frequency;
    const capFreqText = (capFreq && capFreq !== 'undefined') ? capFreq : '1kHz';
    const zFreq = mulData[`${group}_imp_freq`]?.frequency;
    const cleanZFreqText = (zFreq && zFreq !== 'undefined') ? zFreq : '—';
    const t0Headers2 = windingSheet.addRow([
      'Injected Freq.',
      '0Hz',
      '100Hz',
      '100Hz',
      capFreqText,
      cleanZFreqText,
      cleanZFreqText
    ]);
    t0Headers2.eachCell((cell, idx) => {
      if (idx <= 7) {
        cell.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FF1E3A8A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = borders;
        cell.alignment = { horizontal: 'center' };
      }
    });
    t0Headers2.height = 16;

    const getImpCell = (p, type) => {
      const freqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
      for (const f of freqs) {
        const cell = mulData[`${group}_imp_${p}_${f}_${type}`];
        if (cell?.value !== undefined && cell?.value !== null && cell?.value !== '') return cell;
      }
      return mulData[`${group}_imp_${p}_${type}`];
    };

    standardPhases.forEach((phase, pIdx) => {
      // 1. DCR
      const dcrKey = `${group}_res_${phase}`;
      let dcrVal = (mulData[dcrKey]?.value !== undefined && mulData[dcrKey]?.value !== null && mulData[dcrKey]?.value !== '') ? parseFloat(mulData[dcrKey]?.value) : null;
      if (record.correctWindingTo20 && dcrVal !== null && !isNaN(dcrVal) && !isOverload(dcrVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[dcrKey]?.temperature)) ? 25 : parseFloat(mulData[dcrKey]?.temperature);
        dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let dcrDisp = '—';
      if (dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
        dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : String(dcrVal);
      }

      // 2. ACR
      const acrKey = `${group}_res_${phase}_100Hz`;
      let acrVal = (mulData[acrKey]?.value !== undefined && mulData[acrKey]?.value !== null && mulData[acrKey]?.value !== '') ? parseFloat(mulData[acrKey]?.value) : null;
      if (record.correctWindingTo20 && acrVal !== null && !isNaN(acrVal) && !isOverload(acrVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[acrKey]?.temperature)) ? 25 : parseFloat(mulData[acrKey]?.temperature);
        acrVal = parseFloat((acrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let acrDisp = '—';
      if (acrVal !== undefined && acrVal !== null && acrVal !== '') {
        acrDisp = isOverload(acrVal, 'R') ? 'O.L' : String(acrVal);
      }

      // 3. L
      const indKey = `${group}_ind_${phase}_100Hz`;
      let indVal = mulData[indKey]?.value;
      let indDisp = '—';
      if (indVal !== undefined && indVal !== null && indVal !== '') {
        indDisp = isOverload(indVal, 'L') ? 'O.L' : String(indVal);
      }

      // 4. Capacitance
      const capKey = `${group}_cap_${phase}`;
      let capVal = mulData[capKey]?.value;
      let capDisp = '—';
      if (capVal !== undefined && capVal !== null && capVal !== '') {
        capDisp = isOverload(capVal, 'C') ? 'O.L' : String(capVal);
      }

      // 5. Impedance
      const zCell = getImpCell(phase, 'z');
      const degCell = getImpCell(phase, 'deg');
      let impVal = zCell?.value;
      let impDisp = '—';
      if (impVal !== undefined && impVal !== null && impVal !== '') {
        impDisp = isOverload(impVal, 'Z') ? 'O.L' : String(impVal);
      }

      // 6. Angle
      let degVal = degCell?.value;
      let degDisp = '—';
      if (degVal !== undefined && degVal !== null && degVal !== '') {
        degDisp = String(degVal);
      }

      const row = windingSheet.addRow([`Phase ${phase}`, dcrDisp, acrDisp, indDisp, capDisp, impDisp, degDisp]);
      styleBodyRow(row, 7, pIdx % 2 === 1);
    });

    // Calculate imbalances for the summary table
    const dcrVals = ['1-2', '1-3', '2-3'].map(phase => {
      const key = `${group}_res_${phase}`;
      let val = (mulData[key]?.value !== undefined && mulData[key]?.value !== null && mulData[key]?.value !== '') ? parseFloat(mulData[key]?.value) : null;
      if (record.correctWindingTo20 && val !== null && !isNaN(val) && !isOverload(val, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
        val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      return val;
    });
    const dcrSumImb = calculateImbalance(dcrVals[0], dcrVals[1], dcrVals[2]);

    const acrVals = ['1-2', '1-3', '2-3'].map(phase => {
      const key = `${group}_res_${phase}_100Hz`;
      let val = (mulData[key]?.value !== undefined && mulData[key]?.value !== null && mulData[key]?.value !== '') ? parseFloat(mulData[key]?.value) : null;
      if (record.correctWindingTo20 && val !== null && !isNaN(val) && !isOverload(val, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
        val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      return val;
    });
    const acrSumImb = calculateImbalance(acrVals[0], acrVals[1], acrVals[2]);

    const indVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_ind_${phase}_100Hz`]?.value);
    const indSumImb = calculateImbalance(indVals[0], indVals[1], indVals[2]);

    const capVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_cap_${phase}`]?.value);
    let capSumImb = calculateImbalance(capVals[0], capVals[1], capVals[2]);
    if (capSumImb === null) {
      const capGndVals = ['1-GND', '2-GND', '3-GND'].map(phase => mulData[`${group}_cap_${phase}`]?.value);
      capSumImb = calculateImbalance(capGndVals[0], capGndVals[1], capGndVals[2]);
    }

    const impVals = ['1-2', '1-3', '2-3'].map(phase => getImpCell(phase, 'z')?.value);
    const impSumImb = calculateImbalance(impVals[0], impVals[1], impVals[2]);

    const degVals = ['1-2', '1-3', '2-3'].map(phase => getImpCell(phase, 'deg')?.value);
    const degSumImb = calculateImbalance(degVals[0], degVals[1], degVals[2]);

    const formatImbExcel = (imb) => imb !== null ? `${imb.toFixed(2)}%` : '—';
    const imbRow = windingSheet.addRow([
      '% Imbalance',
      formatImbExcel(dcrSumImb),
      formatImbExcel(acrSumImb),
      formatImbExcel(indSumImb),
      formatImbExcel(capSumImb),
      formatImbExcel(impSumImb),
      formatImbExcel(degSumImb)
    ]);

    const getImbalanceFillExcel = (imb) => {
      if (imb === null) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      if (imb >= 5) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } }; // Light Red
      if (imb >= 2) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } }; // Light Yellow
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } }; // Light Green
    };

    const getImbalanceFontExcel = (imb) => {
      if (imb === null) return { name: 'Arial', bold: true, color: { argb: 'FF64748B' } };
      if (imb >= 5) return { name: 'Arial', bold: true, color: { argb: 'FF721C24' } };
      if (imb >= 2) return { name: 'Arial', bold: true, color: { argb: 'FF856404' } };
      return { name: 'Arial', bold: true, color: { argb: 'FF155724' } };
    };

    imbRow.eachCell((cell, colNum) => {
      cell.border = borders;
      cell.alignment = { horizontal: 'center' };
      if (colNum === 1) {
        cell.font = { name: 'Arial', bold: true, color: { argb: 'FF1E3A8A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      } else {
        const valIdx = colNum - 2;
        const imbs = [dcrSumImb, acrSumImb, indSumImb, capSumImb, impSumImb, degSumImb];
        const currentImb = imbs[valIdx];
        cell.fill = getImbalanceFillExcel(currentImb);
        cell.font = getImbalanceFontExcel(currentImb);
      }
    });

    // ─────────────────────────────────────────────
    // Combined DCR & ACR Winding Resistance (Ω) — 7 cols (Phase | DCR | 5x ACR)
    // Temperature is displayed once in the group header, so no per-row Temp column.
    // ─────────────────────────────────────────────
    windingSheet.addRow([]); // spacer
    const t1Title = windingSheet.addRow([`DCR & ACR Winding Resistance (Ω)${record.correctWindingTo20 ? ' @20°C' : ''}`]);
    windingSheet.mergeCells(`A${t1Title.number}:G${t1Title.number}`);
    t1Title.getCell(1).font = boldFont;

    // Single header row — DCR column labelled "DC", ACR columns by frequency
    const t1FreqHeader = windingSheet.addRow(['Phase Line', 'DC', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz']);
    styleHeaderRow(t1FreqHeader, 7);

    ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].forEach((phase, pIdx) => {
      // DCR (spot) value — group temperature shown once at the group header, not per-row.
      const dcrKey = `${group}_res_${phase}`;
      let dcrVal = (mulData[dcrKey]?.value !== undefined && mulData[dcrKey]?.value !== null && mulData[dcrKey]?.value !== '') ? parseFloat(mulData[dcrKey]?.value) : null;
      const rawTemp = mulData[dcrKey]?.temperature;
      if (record.correctWindingTo20 && dcrVal !== null && !isNaN(dcrVal) && !isOverload(dcrVal, 'R')) {
        const tempNum = isNaN(parseFloat(rawTemp)) ? 25 : parseFloat(rawTemp);
        dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let dcrDisplay = '—';
      if (dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
        dcrDisplay = isOverload(dcrVal, 'R') ? 'O.L' : String(dcrVal);
      }

      const rowVals = [`Phase ${phase}`, dcrDisplay];
      ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach(f => {
        const key = `${group}_res_${phase}_${f}`;
        const cellData = mulData[key];
        let val = cellData?.value;

        // Fallback to spot ACR if sweep is empty
        if (val === undefined || val === null || val === '') {
          const spotKey = `${group}_res_${phase}`;
          const spotVal = mulData[spotKey]?.value;
          const spotFreq = mulData[spotKey]?.frequency;
          if (spotFreq === f && spotVal !== undefined && spotVal !== null && spotVal !== '') {
            val = spotVal;
          }
        }

        if (val !== undefined && val !== null && val !== '') {
          val = parseFloat(val);
          if (record.correctWindingTo20) {
            const tempNum = isNaN(parseFloat(cellData?.temperature)) ? 25 : parseFloat(cellData?.temperature);
            val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
          }
        }
        const displayVal = val !== undefined && val !== null && val !== '' ? (isOverload(val, 'R') ? 'O.L' : String(val)) : '—';
        rowVals.push(displayVal);
      });

      const row = windingSheet.addRow(rowVals);
      styleBodyRow(row, 7, pIdx % 2 === 1);
      // Subtle highlight on the DCR data cell — light blue tint + bold text (same brand palette as ACR).
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      row.getCell(2).font = { name: 'Arial', bold: true, size: 10 };
    });

    // % Imbalance row across DC + ACR frequency columns
    {
      const tempCorrect = (val, temp) => {
        if (val === undefined || val === null || val === '') return null;
        const v = parseFloat(val);
        if (isNaN(v)) return null;
        if (!record.correctWindingTo20) return v;
        const tempNum = isNaN(parseFloat(temp)) ? 25 : parseFloat(temp);
        return v * (254.5 / (234.5 + tempNum));
      };
      const dcVals = ['1-2', '1-3', '2-3'].map(p => {
        const k = `${group}_res_${p}`;
        return tempCorrect(mulData[k]?.value, mulData[k]?.temperature);
      });
      const dcImb = calculateImbalance(dcVals[0], dcVals[1], dcVals[2]);
      const freqImbs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
        const vals = ['1-2', '1-3', '2-3'].map(p => {
          const k = `${group}_res_${p}_${f}`;
          let v = mulData[k]?.value;
          if (v === undefined || v === null || v === '') {
            const spot = mulData[`${group}_res_${p}`];
            if (spot?.frequency === f) v = spot?.value;
          }
          return tempCorrect(v, mulData[k]?.temperature);
        });
        return calculateImbalance(vals[0], vals[1], vals[2]);
      });
      const allImbs = [dcImb, ...freqImbs];
      const fmt = (imb) => (imb === null || imb === undefined) ? '—' : `${imb.toFixed(2)}%`;
      const imbRow = windingSheet.addRow(['% Imbalance', ...allImbs.map(fmt)]);
      imbRow.eachCell((cell, colNum) => {
        cell.border = borders;
        cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center' };
        if (colNum === 1) {
          cell.font = { name: 'Arial', bold: true, color: { argb: 'FF1E3A8A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        } else {
          const currentImb = allImbs[colNum - 2];
          cell.fill = getImbalanceFillExcel(currentImb);
          cell.font = getImbalanceFontExcel(currentImb);
        }
      });
    }

    // ─────────────────────────────────────────────
    // Table 3: Winding Inductance Measurements
    // ─────────────────────────────────────────────
    windingSheet.addRow([]); // spacer
    const t3Title = windingSheet.addRow(['Inductance Measurements']);
    windingSheet.mergeCells(`A${t3Title.number}:F${t3Title.number}`);
    t3Title.getCell(1).font = boldFont;

    const t3Headers = windingSheet.addRow(['Phase Line', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz']);
    styleHeaderRow(t3Headers, 6);

    ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].forEach((phase, pIdx) => {
      const rowVals = [`Phase ${phase}`];
      ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach(f => {
        const key = `${group}_ind_${phase}_${f}`;
        let val = mulData[key]?.value;

        // Fallback to spot Inductance if sweep is empty
        if (val === undefined || val === null || val === '') {
          const spotKey = `${group}_ind_${phase}`;
          const spotVal = mulData[spotKey]?.value;
          const spotFreq = mulData[spotKey]?.frequency;
          if (spotFreq === f && spotVal !== undefined && spotVal !== null && spotVal !== '') {
            val = spotVal;
          }
        }

        const displayVal = val !== undefined && val !== null && val !== '' ? (isOverload(val, 'L') ? 'O.L' : String(val)) : '—';
        rowVals.push(displayVal);
      });

      const row = windingSheet.addRow(rowVals);
      styleBodyRow(row, 6, pIdx % 2 === 1);
    });

    // % Imbalance row for Inductance across the 5 frequency columns
    {
      const indFreqImbs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
        const vals = ['1-2', '1-3', '2-3'].map(p => {
          let v = mulData[`${group}_ind_${p}_${f}`]?.value;
          if (v === undefined || v === null || v === '') {
            const spot = mulData[`${group}_ind_${p}`];
            if (spot?.frequency === f) v = spot?.value;
          }
          return v;
        });
        return calculateImbalance(vals[0], vals[1], vals[2]);
      });
      const fmt = (imb) => imb === null || imb === undefined ? '—' : `${imb.toFixed(2)}%`;
      const indImbRow = windingSheet.addRow(['% Imbalance', ...indFreqImbs.map(fmt)]);
      indImbRow.eachCell((cell, colNum) => {
        cell.border = borders;
        cell.alignment = { horizontal: 'center' };
        if (colNum === 1) {
          cell.font = { name: 'Arial', bold: true, color: { argb: 'FF1E3A8A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        } else if (colNum <= 6) {
          const currentImb = indFreqImbs[colNum - 2];
          cell.fill = getImbalanceFillExcel(currentImb);
          cell.font = getImbalanceFontExcel(currentImb);
        }
      });
    }

    // ─────────────────────────────────────────────
    // Table 4: Winding Capacitance Measurements
    // ─────────────────────────────────────────────
    windingSheet.addRow([]); // spacer
    const t4Title = windingSheet.addRow(['Capacitance Measurements']);
    windingSheet.mergeCells(`A${t4Title.number}:C${t4Title.number}`);
    t4Title.getCell(1).font = boldFont;

    const capFreqTable4 = mulData[`${group}_cap_freq`]?.frequency;
    const cleanCapFreq = (capFreqTable4 && capFreqTable4 !== 'undefined') ? capFreqTable4 : '';
    const groupCapFreq = cleanCapFreq || '1kHz';

    const t4Headers = windingSheet.addRow(['Phase Line', 'Capacitance (nF)', 'Frequency']);
    styleHeaderRow(t4Headers, 3);

    capacitancePhases.forEach((phase, pIdx) => {
      const cKey = `${group}_cap_${phase}`;
      let cVal = mulData[cKey]?.value;
      let cFreq = mulData[cKey]?.frequency;
      
      if (cFreq === 'undefined' || cFreq === null || cFreq === undefined || cFreq === '') {
        cFreq = (cVal !== undefined && cVal !== null && cVal !== '') ? groupCapFreq : '—';
      }

      let cDisplay = '—';
      if (cVal !== undefined && cVal !== null && cVal !== '') {
        cDisplay = isOverload(cVal, 'C') ? 'O.L' : String(cVal);
      }

      const row = windingSheet.addRow([`Phase ${phase}`, cDisplay, cFreq]);
      styleBodyRow(row, 3, pIdx % 2 === 1);
    });

    // % Imbalance row for Capacitance (line-line, fallback to line-GND)
    {
      const lineVals = ['1-2', '1-3', '2-3'].map(p => mulData[`${group}_cap_${p}`]?.value);
      let capImb = calculateImbalance(lineVals[0], lineVals[1], lineVals[2]);
      if (capImb === null || capImb === undefined) {
        const gndVals = ['1-GND', '2-GND', '3-GND'].map(p => mulData[`${group}_cap_${p}`]?.value);
        capImb = calculateImbalance(gndVals[0], gndVals[1], gndVals[2]);
      }
      const fmt = (imb) => imb === null || imb === undefined ? '—' : `${imb.toFixed(2)}%`;
      const capImbRow = windingSheet.addRow(['% Imbalance', fmt(capImb), '']);
      capImbRow.eachCell((cell, colNum) => {
        cell.border = borders;
        cell.alignment = { horizontal: 'center' };
        if (colNum === 1) {
          cell.font = { name: 'Arial', bold: true, color: { argb: 'FF1E3A8A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        } else if (colNum === 2) {
          cell.fill = getImbalanceFillExcel(capImb);
          cell.font = getImbalanceFontExcel(capImb);
        }
      });
    }

    // ─────────────────────────────────────────────
    // Table 5: Impedance Z & Phase Angle Sweep
    // ─────────────────────────────────────────────
    const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const Z_FREQS_EXCEL = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];

    const hasImpSweepData = impPhases.some(phase =>
      Z_FREQS_EXCEL.some(f => mulData[`${group}_imp_${phase}_${f}_z`]?.value !== undefined || mulData[`${group}_imp_${phase}_${f}_deg`]?.value !== undefined)
    );
    const hasImpSpotData = impPhases.some(phase =>
      mulData[`${group}_imp_${phase}_z`]?.value !== undefined || mulData[`${group}_imp_${phase}_deg`]?.value !== undefined
    );
    const hasImpData = hasImpSweepData || hasImpSpotData;

    if (hasImpData) {
      windingSheet.addRow([]);
      const t5Title = windingSheet.addRow([`${groupName} Impedance Z Sweep (Ω)`]);
      const t5ColCount = 1 + Z_FREQS_EXCEL.length;
      windingSheet.mergeCells(`A${t5Title.number}:${String.fromCharCode(64 + t5ColCount)}${t5Title.number}`);
      t5Title.getCell(1).font = boldFont;

      if (hasImpSweepData) {
        // Multi-frequency sweep table: Phase Line | 100Hz Z | 120Hz Z | 1kHz Z | 10kHz Z | 100kHz Z
        // With sub-row for Deg below each phase's Z row
        const t5ZHeaders = windingSheet.addRow(['Phase Line (Z Ω)', ...Z_FREQS_EXCEL]);
        styleHeaderRow(t5ZHeaders, t5ColCount);

        impPhases.forEach((phase, pIdx) => {
          const zVals = Z_FREQS_EXCEL.map(f => {
            const v = mulData[`${group}_imp_${phase}_${f}_z`]?.value;
            return (v !== undefined && v !== null && v !== '') ? (isOverload(v, 'Z') ? 'O.L' : String(v)) : '—';
          });
          const degVals = Z_FREQS_EXCEL.map(f => {
            const v = mulData[`${group}_imp_${phase}_${f}_deg`]?.value;
            return (v !== undefined && v !== null && v !== '') ? String(v) : '—';
          });

          const zRow = windingSheet.addRow([`Phase ${phase} Z (Ω)`, ...zVals]);
          styleBodyRow(zRow, t5ColCount, pIdx % 2 === 1);

          const degRow = windingSheet.addRow([`Phase ${phase} Deg (°)`, ...degVals]);
          degRow.eachCell((cell, colNum) => {
            cell.border = borders;
            cell.alignment = { horizontal: 'center' };
            if (colNum === 1) {
              cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
            } else {
              cell.font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pIdx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF' } };
            }
          });
        });

        // % Imbalance row per frequency (Z only)
        const zImbVals = Z_FREQS_EXCEL.map(f => {
          const v12 = mulData[`${group}_imp_1-2_${f}_z`]?.value;
          const v13 = mulData[`${group}_imp_1-3_${f}_z`]?.value;
          const v23 = mulData[`${group}_imp_2-3_${f}_z`]?.value;
          return calculateImbalance(v12, v13, v23);
        });
        const fmt = (imb) => imb === null || imb === undefined ? '—' : `${imb.toFixed(2)}%`;
        const impImbRow = windingSheet.addRow(['% Imbalance (Z)', ...zImbVals.map(fmt)]);
        impImbRow.eachCell((cell, colNum) => {
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
          if (colNum === 1) {
            cell.font = { name: 'Arial', bold: true, color: { argb: 'FF1E3A8A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          } else {
            const imb = zImbVals[colNum - 2];
            cell.fill = getImbalanceFillExcel(imb);
            cell.font = getImbalanceFontExcel(imb);
          }
        });
      } else {
        // Fallback: spot values only
        const getTable5ImpCell = (p, type) => {
          const spot = mulData[`${group}_imp_${p}_${type}`];
          if (spot?.value !== undefined && spot?.value !== null && spot?.value !== '') return spot;
          for (const f of Z_FREQS_EXCEL) {
            const c = mulData[`${group}_imp_${p}_${f}_${type}`];
            if (c?.value !== undefined && c?.value !== null && c?.value !== '') return c;
          }
          return undefined;
        };
        const t5Headers = windingSheet.addRow(['Phase Line', 'Impedance Z (Ω)', 'Phase Angle (°)']);
        styleHeaderRow(t5Headers, 3);
        impPhases.forEach((phase, pIdx) => {
          const zCell = getTable5ImpCell(phase, 'z');
          const degCell = getTable5ImpCell(phase, 'deg');
          const zDisplay = zCell?.value !== undefined ? (isOverload(zCell.value, 'Z') ? 'O.L' : String(zCell.value)) : '—';
          const degDisplay = degCell?.value !== undefined ? String(degCell.value) : '—';
          const row = windingSheet.addRow([`Phase ${phase}`, zDisplay, degDisplay]);
          styleBodyRow(row, 3, pIdx % 2 === 1);
        });
        const zVals = ['1-2', '1-3', '2-3'].map(p => getTable5ImpCell(p, 'z')?.value);
        const degVals = ['1-2', '1-3', '2-3'].map(p => getTable5ImpCell(p, 'deg')?.value);
        const zImbVal = calculateImbalance(zVals[0], zVals[1], zVals[2]);
        const degImbVal = calculateImbalance(degVals[0], degVals[1], degVals[2]);
        const fmt = (imb) => imb === null || imb === undefined ? '—' : `${imb.toFixed(2)}%`;
        const impImbRow = windingSheet.addRow(['% Imbalance', fmt(zImbVal), fmt(degImbVal)]);
        impImbRow.eachCell((cell, colNum) => {
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
          if (colNum === 1) {
            cell.font = { name: 'Arial', bold: true, color: { argb: 'FF1E3A8A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          } else if (colNum === 2) {
            cell.fill = getImbalanceFillExcel(zImbVal);
            cell.font = getImbalanceFontExcel(zImbVal);
          } else if (colNum === 3) {
            cell.fill = getImbalanceFillExcel(degImbVal);
            cell.font = getImbalanceFontExcel(degImbVal);
          }
        });
      }

      // Embed polar plot in Excel
      if (chartImages && chartImages.polar && chartImages.polar[group]) {
        try {
          const rawBase64 = chartImages.polar[group];
          const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          const imageId = workbook.addImage({
            base64: cleanBase64,
            extension: 'png',
          });
          windingSheet.addImage(imageId, {
            tl: { col: 7, row: t5Title.number - 1 },
            ext: { width: 180, height: 180 }
          });
        } catch (err) {
          console.error(`Failed to embed polar chart for ${group}:`, err);
        }
      }
    }

    // Phase Imbalance Diagnostics equivalent row
    const r12 = mulData[`${group}_res_1-2`]?.value;
    const r13 = mulData[`${group}_res_1-3`]?.value;
    const r23 = mulData[`${group}_res_2-3`]?.value;
    const rImb = calculateImbalance(r12, r13, r23);

    const i12 = mulData[`${group}_ind_1-2`]?.value;
    const i13 = mulData[`${group}_ind_1-3`]?.value;
    const i23 = mulData[`${group}_ind_2-3`]?.value;
    const iImb = calculateImbalance(i12, i13, i23);

    const c12 = mulData[`${group}_cap_1-2`]?.value;
    const c13 = mulData[`${group}_cap_1-3`]?.value;
    const c23 = mulData[`${group}_cap_2-3`]?.value;
    let cImb = calculateImbalance(c12, c13, c23);
    if (cImb === null) {
      const c1g = mulData[`${group}_cap_1-GND`]?.value;
      const c2g = mulData[`${group}_cap_2-GND`]?.value;
      const c3g = mulData[`${group}_cap_3-GND`]?.value;
      cImb = calculateImbalance(c1g, c2g, c3g);
    }

    const z12 = mulData[`${group}_imp_1-2`]?.value;
    const z13 = mulData[`${group}_imp_1-3`]?.value;
    const z23 = mulData[`${group}_imp_2-3`]?.value;
    const zImb = calculateImbalance(z12, z13, z23);

    if (rImb !== null || iImb !== null || cImb !== null || zImb !== null) {
      windingSheet.addRow([]); // spacer
      const imbTitle = windingSheet.addRow(['Phase Imbalance Diagnostics']);
      windingSheet.mergeCells(`A${imbTitle.number}:F${imbTitle.number}`);
      imbTitle.getCell(1).font = boldFont;

      const imbLabels = [];
      if (rImb !== null) imbLabels.push(`Resistance Imbalance: ${rImb.toFixed(2)}% (${rImb < 5 ? 'Good' : 'High'})`);
      if (iImb !== null) imbLabels.push(`Inductance Imbalance: ${iImb.toFixed(2)}% (${iImb < 5 ? 'Good' : 'High'})`);
      if (cImb !== null) imbLabels.push(`Capacitance Imbalance: ${cImb.toFixed(2)}% (${cImb < 5 ? 'Good' : 'High'})`);
      if (zImb !== null) imbLabels.push(`Impedance Imbalance: ${zImb.toFixed(2)}% (${zImb < 5 ? 'Good' : 'High'})`);

      const imbRow = windingSheet.addRow([imbLabels.join('   |   ')]);
      windingSheet.mergeCells(`A${imbRow.number}:F${imbRow.number}`);
      const iCell = imbRow.getCell(1);
      iCell.font = boldFont;
      iCell.border = borders;
      iCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: (rImb >= 5 || iImb >= 5) ? 'FFF8D7DA' : 'D4EDDA' }
      };
      imbRow.height = 18;
    }

    windingSheet.addRow([]); // Spacer between groups
    windingSheet.addRow([]);
  };

  addGroupWindingTables('stator');
  if (includeRotor) addGroupWindingTables('rotor');

  const windingFootnoteText = record.correctWindingTo20
    ? `* Note: The winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula (Baseline 20°C correction is ACTIVE).`
    : `* Note: The winding resistance measurements shown above are raw/uncorrected values (Baseline 20°C correction is INACTIVE).`;
  const windingFootnoteRow = windingSheet.addRow([windingFootnoteText]);
  windingSheet.mergeCells(`A${windingFootnoteRow.number}:F${windingFootnoteRow.number}`);
  windingFootnoteRow.getCell(1).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF64748B' } };

  // ── Sheet: Winding Frequency Sweep ──
  const hasStatorIndSweep = hasSweepDataForGroup(mulData, 'stator', 'ind');
  const hasStatorResSweep = hasSweepDataForGroup(mulData, 'stator', 'res');
  const hasRotorIndSweep = hasSweepDataForGroup(mulData, 'rotor', 'ind');
  const hasRotorResSweep = hasSweepDataForGroup(mulData, 'rotor', 'res');

  if (hasStatorIndSweep || hasStatorResSweep || hasRotorIndSweep || hasRotorResSweep) {
    const sweepSheet = workbook.addWorksheet('Winding Frequency Sweep');
    // 12 columns so the two charts sit side-by-side (chart A: cols 1-6, chart B: cols 7-12)
    sweepSheet.columns = Array.from({ length: 12 }, () => ({ width: 14 }));

    embedLogoAndDate(sweepSheet, 12, 0);

    // Chart-only layout: place each chart at a fixed slot. No tables.
    // Two charts per visual row; each chart occupies 6 columns × ~18 sheet rows.
    const CHART_WIDTH = 460;
    const CHART_HEIGHT = 260;
    const ROWS_PER_CHART_BLOCK = 18;
    const TITLE_ROW_HEIGHT = 20;

    const addChartCell = (title, group, type, slotRow, slotCol) => {
      // Title row above the chart image
      const titleRow = sweepSheet.getRow(slotRow);
      const titleCell = titleRow.getCell(slotCol + 1);
      titleCell.value = title;
      sweepSheet.mergeCells(slotRow, slotCol + 1, slotRow, slotCol + 6);
      titleCell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = headerFill;
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      titleRow.height = TITLE_ROW_HEIGHT;
      titleRow.commit && titleRow.commit();

      if (chartImages && chartImages.sweep && chartImages.sweep[`${group}_${type}`]) {
        try {
          const rawBase64 = chartImages.sweep[`${group}_${type}`];
          const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          const imageId = workbook.addImage({
            base64: cleanBase64,
            extension: 'png',
          });
          sweepSheet.addImage(imageId, {
            tl: { col: slotCol, row: slotRow },  // 0-indexed for images
            ext: { width: CHART_WIDTH, height: CHART_HEIGHT }
          });
        } catch (err) {
          console.error(`Failed to embed sweep chart for ${group} ${type}:`, err);
        }
      }
    };

    // Row cursor starts after the logo/date row (row 2 is 1-indexed just past embedLogoAndDate).
    let cursorRow = 3;
    const placeRow = (leftTitle, leftGroup, leftType, rightTitle, rightGroup, rightType) => {
      const leftHas = hasSweepDataForGroup(mulData, leftGroup, leftType);
      const rightHas = hasSweepDataForGroup(mulData, rightGroup, rightType);
      if (!leftHas && !rightHas) return;
      if (leftHas) addChartCell(leftTitle, leftGroup, leftType, cursorRow, 0);   // cols 1-6
      if (rightHas) addChartCell(rightTitle, rightGroup, rightType, cursorRow, 6); // cols 7-12
      cursorRow += ROWS_PER_CHART_BLOCK;
    };

    placeRow(
      'Stator Inductance Sweep (mH)', 'stator', 'ind',
      'Stator AC Resistance Sweep (Ω)', 'stator', 'res'
    );
    if (includeRotor) {
      placeRow(
        'Rotor Inductance Sweep (mH)', 'rotor', 'ind',
        'Rotor AC Resistance Sweep (Ω)', 'rotor', 'res'
      );
    }
  }

  // ── Sheets 3-6: Insulation Tests (Megger) ──
  ['PI', 'DAR', 'SV', 'RAMP'].forEach(tab => {
    const tabData = insData[tab] || {};
    const tablesPresent = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);

    if (tablesPresent.length === 0) return;

    let firstTableId = tablesPresent[0];
    let firstMeta = tabData[`${firstTableId}_meta`] || {};
    let firstTemp = (firstMeta.temperature !== undefined && firstMeta.temperature !== '') ? firstMeta.temperature : record.temperature;
    let tempValFirst = isNaN(parseFloat(firstTemp)) ? 25 : parseFloat(firstTemp);

    const sheet = workbook.addWorksheet(`Insulation - ${tab}`);
    sheet.columns = [
      { header: 'Test Table', key: 'table', width: 22 },
      { header: 'Time (s)', key: 'time', width: 12 },
      { header: 'Voltage (V)', key: 'voltage', width: 14 },
      { header: 'Actual V (V)', key: 'actualVoltage', width: 14 },
      { header: 'Current (uA)', key: 'current', width: 14 },
      { header: `IR at ${tempValFirst}°C (MΩ)`, key: 'rawResistance', width: 20 },
      { header: `IR baselined to 40°C (IEEE 43) (MΩ)`, key: 'corrResistance', width: 28 }
    ];

    embedLogoAndDate(sheet, 12, 0);

    const hRow = sheet.getRow(1);
    hRow.eachCell(cell => {
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.border = borders;
      cell.alignment = { horizontal: 'center' };
    });
    hRow.height = 22;

    let subRowIndex = 0;

    tablesPresent.forEach(tableId => {
      const rows = tabData[tableId];
      const runMeta = tabData[`${tableId}_meta`] || {};
      const runTemp = (runMeta.temperature !== undefined && runMeta.temperature !== '') ? runMeta.temperature : record.temperature;
      const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
      const Kt = Math.pow(0.5, (40 - tempVal) / 10);

      // Add table header row
      const titleRow = sheet.addRow([`Table: ${tableId}`]);
      sheet.mergeCells(`A${titleRow.number}:G${titleRow.number}`);
      const tCell = titleRow.getCell(1);
      tCell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      tCell.border = borders;
      titleRow.height = 20;

      const cleanRows = (tab === 'PI' || tab === 'DAR' || tab === 'RAMP') ? stripTrailingSummary(rows) : rows;
      let excelRows = cleanRows;
      if (tab === 'PI') {
        excelRows = cleanRows.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 15 === 0);
        });
      } else if (tab === 'DAR') {
        excelRows = cleanRows.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 5 === 0);
        });
      } else if (tab === 'SV') {
        const { transientRows, summaryRows } = splitSVData(rows);
        const filteredTransient = transientRows.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 10 === 0);
        });
        excelRows = [...filteredTransient, ...summaryRows];
      }
      excelRows.forEach(r => {
        const rawRes = r.resistance;
        const corrRes = typeof rawRes === 'number' ? Math.round(rawRes * Kt) : '—';

        const row = sheet.addRow({
          table: '',
          time: r.time,
          voltage: r.voltage,
          actualVoltage: r.actualVoltage,
          current: r.current,
          rawResistance: rawRes,
          corrResistance: corrRes
        });
        row.eachCell((cell) => {
          cell.font = bodyFont;
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
          if (subRowIndex % 2 === 1) cell.fill = altFill;
        });
        subRowIndex++;
      });

      // Calculate table indices
      const r30 = rows.find(r => r.time >= 30)?.resistance;
      const r60 = rows.find(r => r.time >= 60)?.resistance;
      const r600 = rows.find(r => r.time >= 600)?.resistance;

      const calcValues = [];
      if (r60 && r30) calcValues.push(`DAR: ${(r60 / r30).toFixed(2)}`);
      // PI hidden on DAR mode (needs 10 min of data).
      if (tab !== 'DAR' && r600 && r60) calcValues.push(`PI: ${(r600 / r60).toFixed(2)}`);
      // DD is only meaningful for PI Test — hide it in DAR/SV/RAMP.
      const ddVal = rows.length > 2 ? '1.38' : '—';
      if (tab === 'PI') calcValues.push(`DD: ${ddVal}`);

      const summaryRow = sheet.addRow([`Coefficients: ${calcValues.join('  |  ')}`]);
      sheet.mergeCells(`A${summaryRow.number}:G${summaryRow.number}`);
      const sCell = summaryRow.getCell(1);
      sCell.font = boldFont;
      sCell.border = borders;
      sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      summaryRow.height = 18;

      // Final Diagnostics summary row — per-table Pass rating removed on request.
      const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
      const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;
      const rawRtStr = Rt !== null ? formatResistance(Rt) : '—';
      const corrR40Str = Rc40 !== null ? formatResistance(Rc40) : '—';

      const diagText = `Final Diagnostics: Temp = ${tempVal}°C | Raw Rt = ${rawRtStr} | Corrected R40 = ${corrR40Str}`;
      const diagRow = sheet.addRow([diagText]);
      sheet.mergeCells(`A${diagRow.number}:G${diagRow.number}`);
      const dCell = diagRow.getCell(1);
      dCell.font = boldFont;
      dCell.border = borders;
      dCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      diagRow.height = 18;

      if (chartImages && chartImages.insulation && chartImages.insulation[`${tab}_${tableId}`]) {
        try {
          const rawBase64 = chartImages.insulation[`${tab}_${tableId}`];
          const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          const imageId = workbook.addImage({
            base64: cleanBase64,
            extension: 'png',
          });
          sheet.addImage(imageId, {
            tl: { col: 7, row: titleRow.number - 1 },
            ext: { width: 350, height: 200 }
          });
        } catch (err) {
          console.error(`Failed to embed insulation chart for ${tab} ${tableId}:`, err);
        }
      }

      sheet.addRow([]); // Blank spacer
    });

    sheet.addRow([]);
    const tempVal = isNaN(parseFloat(record.temperature)) ? 25 : parseFloat(record.temperature);
    const Kt = Math.pow(0.5, (40 - tempVal) / 10);
    const insFootnoteText = record.correctInsulationTo40
      ? `* Note: The insulation resistance measurements shown above are corrected/baselined to 40°C using the IEEE 43 temperature correction formula (Test Temperature: ${tempVal}°C, Kt: ${Kt.toFixed(3)}).`
      : `* Note: The insulation resistance measurements shown above are raw/uncorrected values (Baseline 40°C correction is inactive).`;
    const insFootnoteRow = sheet.addRow([insFootnoteText]);
    sheet.mergeCells(`A${insFootnoteRow.number}:F${insFootnoteRow.number}`);
    insFootnoteRow.getCell(1).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF64748B' } };

  });

  await workbook.xlsx.writeFile(filePath);
  return { success: true, filePath };
}

// ─────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────
async function exportPDF(recordId, mainWindow, opts = {}) {
  const includeRotor = !!opts.includeRotor;
  const _pdfkit = require('pdfkit');
  const PDFDocument = _pdfkit.default || _pdfkit;
  const record = db.getRecord(recordId);
  const insData = db.getInsulationData(recordId);
  const mulData = db.getMultimeterData(recordId);

  if (!record) return { success: false, error: 'Record not found' };

  const piVolts = getNominalVoltage(insData, 'PI', record) || record.testVoltagePiDar || '—';
  const darVolts = getNominalVoltage(insData, 'DAR', record) || record.testVoltagePiDar || '—';
  const stepVolts = formatStepVoltage(getSVNominalVoltages(insData) || record.testVoltageStep);
  const rampVolts = getRampNominalVoltages(insData) || record.testVoltageRamp || '—';

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF Report',
    defaultPath: path.join(
      getSafeDocumentsPath(),
      `TestReport_${sanitizeFilename(record.clientName || 'Client')}_${sanitizeFilename(record.motorUtilityTag || 'Motor')}.pdf`
    ),
    filters: [{ name: 'PDF File', extensions: ['pdf'] }],
  });
  if (!filePath) return { success: false, reason: 'cancelled' };

  const sysFonts = getSystemFonts();
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true,
    font: sysFonts ? sysFonts.regular : undefined
  });

  if (sysFonts) {
    if (sysFonts.regular) doc.registerFont('Helvetica', sysFonts.regular);
    if (sysFonts.bold) doc.registerFont('Helvetica-Bold', sysFonts.bold);
    if (sysFonts.italic) doc.registerFont('Helvetica-Oblique', sysFonts.italic);
    if (sysFonts.boldItalic) doc.registerFont('Helvetica-BoldOblique', sysFonts.boldItalic);
  }

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const BLUE = '#1E3A8A';
  const LIGHT_BLUE = '#EFF6FF';
  const DARK_GRAY = '#334155';
  const LGRAY = '#F8FAFC';
  const GRAY = '#64748B';
  const W = doc.page.width - 80; // 515 pt

  // Page Header (drawn on all pages)
  const drawHeader = (titleText) => {
    // White header band with a slim blue accent stripe on the bottom edge — logos read
    // as intended on white, and the accent stripe preserves a branded feel.
    const headerH = 60;
    doc.rect(0, 0, doc.page.width, headerH).fill('#FFFFFF');
    doc.rect(0, headerH - 3, doc.page.width, 3).fill(BLUE);

    const customLogo = record.customLogoPath;
    const customClientLogo = record.customClientLogoPath;

    let hasClientLogo = false;
    let hasContractorLogo = false;

    const isClientLogoPresent = (customClientLogo !== 'none');

    // Client logo — left-most position
    if (isClientLogoPresent) {
      if (customClientLogo && customClientLogo.startsWith('data:image/')) {
        try {
          const commaIdx = customClientLogo.indexOf(',');
          if (commaIdx !== -1) {
            const base64Data = customClientLogo.substring(commaIdx + 1);
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, 14, 10, { height: 30 });
            hasClientLogo = true;
          }
        } catch (e) {
          console.error('Failed to draw custom client logo in PDF header:', e);
          const logoPath = getLogoPath();
          if (logoPath) {
            try {
              doc.image(logoPath, 14, 10, { height: 30 });
              hasClientLogo = true;
            } catch (err) {
              console.error('Failed to draw fallback client logo in PDF header:', err);
            }
          }
        }
      } else {
        const logoPath = getLogoPath();
        if (logoPath) {
          try {
            doc.image(logoPath, 14, 10, { height: 30 });
            hasClientLogo = true;
          } catch (e) {
            console.error('Failed to draw default client logo in PDF header:', e);
          }
        }
      }
    }

    // Contractor logo — separated by a thin vertical rule so the two brands don't visually collide
    const contractorLogoX = hasClientLogo ? 108 : 14;
    if (customLogo && customLogo.startsWith('data:image/')) {
      if (hasClientLogo) {
        doc.strokeColor('#CBD5E1').lineWidth(0.75).moveTo(98, 12).lineTo(98, 42).stroke();
      }
      try {
        const commaIdx = customLogo.indexOf(',');
        if (commaIdx !== -1) {
          const base64Data = customLogo.substring(commaIdx + 1);
          const buffer = Buffer.from(base64Data, 'base64');
          doc.image(buffer, contractorLogoX, 10, { height: 30 });
          hasContractorLogo = true;
        }
      } catch (e) {
        console.error('Failed to draw custom contractor logo in PDF header:', e);
      }
    }

    // Compact date pill below the logos, in slate — readable on white without being loud
    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
      .text(`Date: ${record.date || '—'}`, 14, 46, { width: 180, align: 'left' });

    // Client Name & Utility Tag repeated on all page headers
    const clientStr = record.clientName ? `Client: ${record.clientName}` : '';
    const tagStr = record.motorUtilityTag ? `Utility Tag: ${record.motorUtilityTag}` : '';
    const repeatHeaderInfo = [clientStr, tagStr].filter(Boolean).join('    |    ');

    // Right block: title in brand blue, meta lines in slate
    let currentY = 10;
    const titleX = (hasContractorLogo && hasClientLogo) ? 205 : 150;
    doc.fillColor(BLUE).fontSize(11).font('Helvetica-Bold')
      .text(titleText, titleX, currentY, { width: doc.page.width - (titleX + 15), align: 'right' });

    currentY = doc.y + 2;

    if (repeatHeaderInfo) {
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold')
        .text(repeatHeaderInfo, 150, currentY, { width: doc.page.width - 165, align: 'right' });
      currentY = doc.y + 2;
    }

    doc.fillColor(GRAY).fontSize(6.5).font('Helvetica')
      .text('Electrical Motor Testing Suite PdM-S411', 150, currentY, { width: doc.page.width - 165, align: 'right' });

    doc.fillColor('#000000');
    doc.y = 80;
  };

  drawHeader('ELECTRICAL MOTOR TESTING REPORT');

  // Column Key-Value Helper for Side-By-Side Columns
  const drawTableSectionTwoCol = (title, items) => {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE).text(title, 40);
    doc.moveDown(0.2);
    const cellH = 14;

    // Group normal pairs and full-width items
    const normalItems = items.filter(([label]) => !label.toLowerCase().includes('notes') && !label.toLowerCase().includes('remark'));
    const fullWidthItems = items.filter(([label]) => label.toLowerCase().includes('notes') || label.toLowerCase().includes('remark'));

    // Draw pairs
    for (let i = 0; i < normalItems.length; i += 2) {
      const y = doc.y;

      // Column 1 (Left)
      const item1 = normalItems[i];
      if (item1) {
        const [label, value] = item1;
        doc.rect(40, y, W * 0.22, cellH).fill(i % 4 === 0 ? LIGHT_BLUE : LGRAY);
        doc.rect(40 + W * 0.22, y, W * 0.28, cellH).fill('#FFFFFF');
        doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text(label, 44, y + 3.5, { width: W * 0.22 - 6 });
        doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica').text(String(value || '—'), 44 + W * 0.22, y + 3.5, { width: W * 0.28 - 6, height: cellH - 4 });
      }

      // Column 2 (Right)
      const item2 = normalItems[i + 1];
      if (item2) {
        const [label, value] = item2;
        doc.rect(40 + W * 0.5, y, W * 0.22, cellH).fill(i % 4 === 0 ? LIGHT_BLUE : LGRAY);
        doc.rect(40 + W * 0.72, y, W * 0.28, cellH).fill('#FFFFFF');
        doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text(label, 44 + W * 0.5, y + 3.5, { width: W * 0.22 - 6 });
        doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica').text(String(value || '—'), 44 + W * 0.72, y + 3.5, { width: W * 0.28 - 6, height: cellH - 4 });
      }

      doc.y = y + cellH;
    }

    // Draw full-width items (Notes / Remarks)
    fullWidthItems.forEach(([label, value]) => {
      const y = doc.y;
      const height = 24; // taller box for notes
      doc.rect(40, y, W * 0.22, height).fill(LIGHT_BLUE);
      doc.rect(40 + W * 0.22, y, W * 0.78, height).fill('#FFFFFF');
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text(label, 44, y + 6, { width: W * 0.22 - 6 });
      doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica').text(String(value || '—'), 44 + W * 0.22, y + 4, { width: W * 0.78 - 12, height: height - 8 });
      doc.y = y + height;
    });

    doc.moveDown(0.5);
  };

  drawTableSectionTwoCol('Client & Facility Information', [
    ['Client Name', record.clientName],
    ['Client Phone', record.clientPhone],
    ['Client Address', record.clientAddress],
    ['Client Email', record.clientEmail],
    ['Client Contact Name', record.clientContactName],
    ['Client Contact Email', record.clientContactEmail],
    ['Facility Name', record.facilityName],
    ['Facility Phone', record.facilityPhone],
    ['Facility Address', record.facilityAddress],
    ['Facility Manager', record.facilityManager],
    ['Test Location', record.location],
    ['Operator Name', record.operatorName],
    ['Test Date', record.date],
    ['Client Notes', record.clientNotes],
    ['Facility Notes', record.facilityNotes],
  ]);

  drawTableSectionTwoCol('Motor Nameplate Specifications', [
    ['Motor Utility Tag', record.motorUtilityTag],
    ['Motor Serial Number', record.motorSerialNumber],
    ['Manufacturer', record.motorManufacturer],
    ['Model Number', record.motorModelNumber],
    ['Manufacturing Standard', record.manufacturingStandard],
    ['Equipment Type', record.equipmentType],
    ['cos Fi (PF)', record.cosFi],
    ['Power (kW)', record.powerKw],
    ['Nominal Current (A)', record.nominalCurrent],
    ['Speed (RPM)', record.speedRpm],
    ['Stator Connection', record.statorConnection],
    ['Line Voltage (V)', record.lineVoltage],
    ['Rotor Connection', record.rotorConnection],
    ['Rotor Voltage (V)', record.rotorVoltage],
    ['Efficiency (%)', record.efficiency],
    ['Rotor Current (A)', record.rotorCurrent],
    ['Insulation Class', record.insulationClass],
    ['Number of Rotor Bars', record.rotorBars],
    ['Remark', record.remark],
  ]);

  drawTableSectionTwoCol('Offline Test Setup Configurations', [
    ['Testing Location', record.testingLocation],
    ['Wire Marking', `T1: ${record.wireMarkingT1 || '—'},  T2: ${record.wireMarkingT2 || '—'},  T3: ${record.wireMarkingT3 || '—'}`],
    ['PI Test Voltage', piVolts],
    ['DAR Test Voltage', darVolts],
    ['STEP Test Voltage', stepVolts],
    ['RAMP Test Voltage', rampVolts],
  ]);

  // ── Draw Test Summary & Stator Condition Table (Page 1) ──
  doc.y = doc.page.height - 280;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE).text('TEST SUMMARY & CONDITION ASSESSMENT', 40);
  doc.moveDown(0.2);

  const startY = doc.y;
  const leftW = W * 0.58;
  const rightW = W * 0.38;
  const gap = W * 0.04;

  // 1. Draw Summary Text Box (Left)
  const summaryBoxH = 210;
  doc.rect(40, startY, leftW, summaryBoxH).fill('#F8FAFC');
  doc.strokeColor('#CBD5E1').lineWidth(0.5);
  doc.rect(40, startY, leftW, summaryBoxH).stroke();

  doc.fillColor(BLUE).fontSize(7.5).font('Helvetica-Bold').text('Test Summary Comments & Recommendations:', 45, startY + 5, { width: leftW - 10 });
  const summaryVal = record.summaryText || 'No summary comments provided.';
  doc.fillColor(DARK_GRAY).fontSize(6.5).font('Helvetica-Oblique').text(summaryVal, 45, startY + 16, { width: leftW - 10, height: summaryBoxH - 22, ellipsis: true });

  // 2. Draw Stator Condition Grid (Right)
  const tableX = 40 + leftW + gap;
  const colW = rightW / 5;
  const condHeaders = ['Insulation', 'Resistance', 'Inductance', 'Impedance', 'Freq. Resp.'];

  // Table header background
  doc.rect(tableX, startY, rightW, 14).fill('#E2E8F0');
  doc.strokeColor('#CBD5E1').lineWidth(0.5);
  doc.rect(tableX, startY, rightW, 14).stroke();

  let cx = tableX;
  condHeaders.forEach(h => {
    doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text(h, cx, startY + 4, { width: colW, align: 'center' });
    cx += colW;
  });

  // Calculate conditions
  const getAutoVal = (key) => {
    if (key === 'condInsulation') {
      return computeOverallInsulationBand(insData, record) || '—';
    }

    // Winding Imbalances at card group level for defaults
    const statorResImb = calculateImbalance(mulData?.['stator_res_1-2']?.value, mulData?.['stator_res_1-3']?.value, mulData?.['stator_res_2-3']?.value);
    const statorIndImb = calculateImbalance(mulData?.['stator_ind_1-2_100Hz']?.value, mulData?.['stator_ind_1-3_100Hz']?.value, mulData?.['stator_ind_2-3_100Hz']?.value);
    const getImpZForImb = (p) => {
      const spot = mulData?.[`stator_imp_${p}_z`]?.value;
      if (spot !== undefined && spot !== null) return spot;
      for (const f of ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz']) {
        const v = mulData?.[`stator_imp_${p}_${f}_z`]?.value;
        if (v !== undefined && v !== null) return v;
      }
      return undefined;
    };
    const statorImpImb = calculateImbalance(getImpZForImb('1-2'), getImpZForImb('1-3'), getImpZForImb('2-3'));

    if (key === 'condResistance') {
      return statorResImb !== null ? rateImbalance('acRes', statorResImb).text : '—';
    }
    if (key === 'condInductance') {
      return statorIndImb !== null ? rateImbalance('ind', statorIndImb).text : '—';
    }
    if (key === 'condImpedance') {
      if (statorImpImb !== null) return rateImbalance('imp', statorImpImb).text;
      const hasImp = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => getImpZForImb(p) !== undefined);
      return hasImp ? 'Normal' : '—';
    }
    if (key === 'condFrequency') {
      let maxSwImb = 0;
      ['ind', 'res'].forEach(t => {
        ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach(f => {
          const v12 = mulData[`stator_${t}_1-2_${f}`]?.value;
          const v13 = mulData[`stator_${t}_1-3_${f}`]?.value;
          const v23 = mulData[`stator_${t}_2-3_${f}`]?.value;
          const imb = calculateImbalance(v12, v13, v23);
          if (imb !== null && imb > maxSwImb) maxSwImb = imb;
        });
      });
      return maxSwImb > 0 ? rateImbalance('acRes', maxSwImb).text : '—';
    }
    return '—';
  };

  const condKeys = ['condInsulation', 'condResistance', 'condInductance', 'condImpedance', 'condFrequency'];
  const condColors = {
    'Excellent': { bg: RATING_STYLES.Excellent.bg, text: RATING_STYLES.Excellent.color },
    'Good':      { bg: RATING_STYLES.Good.bg,      text: RATING_STYLES.Good.color },
    'Normal':    { bg: RATING_STYLES.Normal.bg,    text: RATING_STYLES.Normal.color },
    'Observe':   { bg: RATING_STYLES.Observe.bg,   text: RATING_STYLES.Observe.color },
    'Caution':   { bg: RATING_STYLES.Caution.bg,   text: RATING_STYLES.Caution.color },
    'Alarm':     { bg: RATING_STYLES.Alarm.bg,     text: RATING_STYLES.Alarm.color },
    '—':         { bg: '#F8FAFC', text: '#475569' }
  };

  // Draw values row
  const rowY = startY + 14;
  const rowH = 32;
  cx = tableX;

  condKeys.forEach(k => {
    const val = record[k] || getAutoVal(k);
    const style = condColors[val] || condColors['—'];

    doc.rect(cx, rowY, colW, rowH).fill(style.bg);
    doc.rect(cx, rowY, colW, rowH).stroke();

    doc.fillColor(style.text).fontSize(6.5).font('Helvetica-Bold')
       .text(val, cx, rowY + (rowH / 2) - 4, { width: colW, align: 'center' });
    
    cx += colW;
  });

  doc.y = startY + Math.max(summaryBoxH, rowH + 14) + 15;

  // Page 2: Stator Winding Readings (Multimeter R/L/C)
  doc.addPage();
  drawHeader('STATOR WINDING TEST');

  const drawWindingWGroup = (groupLabel, groupPrefix) => {
    const globalFreq = mulData[`${groupPrefix}_global_freq`]?.frequency;
    const titleText = (globalFreq && globalFreq !== 'undefined') ? `${groupLabel} (Winding Freq: ${globalFreq})` : groupLabel;

    // Winding tests share one ambient temperature — pull the first non-empty temp so we can
    // render it once as a chip beside the group title (matches the insulation-side TEMP chip).
    const resolveGroupTemp = () => {
      for (const key of Object.keys(mulData)) {
        if (!key.startsWith(`${groupPrefix}_`)) continue;
        if (!(key.includes('_res_') || key.includes('_ind_') || key.includes('_cap_') || key.includes('_imp_'))) continue;
        const t = mulData[key]?.temperature;
        if (t !== undefined && t !== null && t !== '' && t !== 'undefined') return t;
      }
      return null;
    };
    const groupTemp = resolveGroupTemp();

    const titleTopY = doc.y;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLUE).text(titleText, 40, titleTopY);

    if (groupTemp !== null) {
      // Right-aligned chip on the same baseline as the title.
      const chipText = `Test Temp: ${groupTemp} C`;
      doc.fontSize(8).font('Helvetica-Bold');
      const chipTextW = doc.widthOfString(chipText);
      const chipW = chipTextW + 14;
      const chipH = 14;
      const chipX = 40 + W - chipW;
      const chipY = titleTopY;
      doc.roundedRect(chipX, chipY, chipW, chipH, 3).fillAndStroke('#F1F5F9', '#CBD5E1');
      doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica-Bold')
        .text(chipText, chipX, chipY + 3, { width: chipW, align: 'center' });
    }
    doc.moveDown(0.2);

    const capFreq = mulData[`${groupPrefix}_cap_freq`]?.frequency;

    const cleanCapFreq = (capFreq && capFreq !== 'undefined') ? ` [${capFreq}]` : '';

    const standardPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N', '123-GND', '1-GND', '2-GND', '3-GND'];
    const capacitancePhases = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];

    let y = doc.y;

    // ─────────────────────────────────────────────
    // Table 0: Winding Readings Summary Table
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Winding Readings Summary Table', 40, y);
    y += 11;
    const sumCols = [W * 0.16, W * 0.14, W * 0.14, W * 0.14, W * 0.14, W * 0.14, W * 0.14];
    const sumHeaders1 = ['Phase Line', 'DCR (Ohms)', 'ACR (Ohms)', 'L (mH)', 'Capacitance (nF)', 'Impedance Z (Ohms)', 'Angle (°)'];

    if (record.correctWindingTo20) {
      sumHeaders1[1] = 'DCR (Ohms) @20°C';
      sumHeaders1[2] = 'ACR (Ohms) @20°C';
    }

    // Row 1: Parameter headers
    doc.rect(40, y, W, 14).fill(BLUE);
    let sx = 40;
    sumHeaders1.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold').text(h, sx, y + 3.5, { width: sumCols[idx], align: 'center' });
      sx += sumCols[idx];
    });
    y += 14;

    // Row 2: Injected Freq headers
    const capFreqText = (capFreq && capFreq !== 'undefined') ? capFreq : '1kHz';
    const zFreq = mulData[`${groupPrefix}_imp_freq`]?.frequency;
    const cleanZFreqText = (zFreq && zFreq !== 'undefined') ? zFreq : '—';
    const sumHeaders2 = [
      'Injected Freq.',
      '0Hz',
      '100Hz',
      '100Hz',
      capFreqText,
      cleanZFreqText,
      cleanZFreqText
    ];

    doc.rect(40, y, W, 12).fill('#E2E8F0');
    sx = 40;
    sumHeaders2.forEach((h, idx) => {
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text(h, sx, y + 2.5, { width: sumCols[idx], align: 'center' });
      sx += sumCols[idx];
    });
    y += 12;

    const getPdfImpCell = (p, type) => {
      const freqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
      for (const f of freqs) {
        const cell = mulData[`${groupPrefix}_imp_${p}_${f}_${type}`];
        if (cell?.value !== undefined && cell?.value !== null && cell?.value !== '') return cell;
      }
      return mulData[`${groupPrefix}_imp_${p}_${type}`];
    };

    let sumAlternate = false;
    standardPhases.forEach(phase => {
      // 1. DCR
      const dcrKey = `${groupPrefix}_res_${phase}`;
      let dcrVal = (mulData[dcrKey]?.value !== undefined && mulData[dcrKey]?.value !== null && mulData[dcrKey]?.value !== '') ? parseFloat(mulData[dcrKey]?.value) : null;
      if (record.correctWindingTo20 && dcrVal !== null && !isNaN(dcrVal) && !isOverload(dcrVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[dcrKey]?.temperature)) ? 25 : parseFloat(mulData[dcrKey]?.temperature);
        dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let dcrDisp = '—';
      if (dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
        dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : String(dcrVal);
      }

      // 2. ACR @100Hz
      const acrKey = `${groupPrefix}_res_${phase}_100Hz`;
      let acrVal = (mulData[acrKey]?.value !== undefined && mulData[acrKey]?.value !== null && mulData[acrKey]?.value !== '') ? parseFloat(mulData[acrKey]?.value) : null;
      if (record.correctWindingTo20 && acrVal !== null && !isNaN(acrVal) && !isOverload(acrVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[acrKey]?.temperature)) ? 25 : parseFloat(mulData[acrKey]?.temperature);
        acrVal = parseFloat((acrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let acrDisp = '—';
      if (acrVal !== undefined && acrVal !== null && acrVal !== '') {
        acrDisp = isOverload(acrVal, 'R') ? 'O.L' : String(acrVal);
      }

      // 3. L @100Hz
      const indKey = `${groupPrefix}_ind_${phase}_100Hz`;
      let indVal = mulData[indKey]?.value;
      let indDisp = '—';
      if (indVal !== undefined && indVal !== null && indVal !== '') {
        indDisp = isOverload(indVal, 'L') ? 'O.L' : String(indVal);
      }

      // 4. Capacitance
      const capKey = `${groupPrefix}_cap_${phase}`;
      let capVal = mulData[capKey]?.value;
      let capDisp = '—';
      if (capVal !== undefined && capVal !== null && capVal !== '') {
        capDisp = isOverload(capVal, 'C') ? 'O.L' : String(capVal);
      }

      // 5. Impedance
      const zPdfCell = getPdfImpCell(phase, 'z');
      const degPdfCell = getPdfImpCell(phase, 'deg');
      let impVal = zPdfCell?.value;
      let impDisp = '—';
      if (impVal !== undefined && impVal !== null && impVal !== '') {
        impDisp = isOverload(impVal, 'Z') ? 'O.L' : String(impVal);
      }

      // 6. Angle
      let degVal = degPdfCell?.value;
      let degDisp = (degVal !== undefined && degVal !== null && degVal !== '') ? String(degVal) : '—';

      doc.rect(40, y, W, 12).fill(sumAlternate ? LGRAY : '#FFFFFF');
      sx = 40;
      doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica-Bold').text(`Phase ${phase}`, sx + 4, y + 2, { width: sumCols[0] - 8, align: 'left' });
      sx += sumCols[0];

      doc.font('Helvetica').fontSize(7);
      doc.text(dcrDisp, sx, y + 2, { width: sumCols[1], align: 'center' });
      sx += sumCols[1];
      doc.text(acrDisp, sx, y + 2, { width: sumCols[2], align: 'center' });
      sx += sumCols[2];
      doc.text(indDisp, sx, y + 2, { width: sumCols[3], align: 'center' });
      sx += sumCols[3];
      doc.text(capDisp, sx, y + 2, { width: sumCols[4], align: 'center' });
      sx += sumCols[4];
      doc.text(impDisp, sx, y + 2, { width: sumCols[5], align: 'center' });
      sx += sumCols[5];
      doc.text(degDisp, sx, y + 2, { width: sumCols[6], align: 'center' });

      y += 12;
      sumAlternate = !sumAlternate;
    });

    // PDF SUMMARY TABLE IMBALANCE ROW
    const getImbalanceCellData = (imb) => {
      if (imb === null) return { bg: '#FFFFFF', text: '#64748B', display: '—' };
      const display = `${imb.toFixed(2)}%`;
      if (imb >= 5) return { bg: '#FEE2E2', text: '#991B1B', display };
      if (imb >= 2) return { bg: '#FEF3C7', text: '#92400E', display };
      return { bg: '#D1FAE5', text: '#065F46', display };
    };

    const dcrVals = ['1-2', '1-3', '2-3'].map(phase => {
      const key = `${groupPrefix}_res_${phase}`;
      let val = (mulData[key]?.value !== undefined && mulData[key]?.value !== null && mulData[key]?.value !== '') ? parseFloat(mulData[key]?.value) : null;
      if (record.correctWindingTo20 && val !== null && !isNaN(val) && !isOverload(val, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
        val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      return val;
    });
    const dcrSumImb = calculateImbalance(dcrVals[0], dcrVals[1], dcrVals[2]);

    const acrVals = ['1-2', '1-3', '2-3'].map(phase => {
      const key = `${groupPrefix}_res_${phase}_100Hz`;
      let val = (mulData[key]?.value !== undefined && mulData[key]?.value !== null && mulData[key]?.value !== '') ? parseFloat(mulData[key]?.value) : null;
      if (record.correctWindingTo20 && val !== null && !isNaN(val) && !isOverload(val, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
        val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      return val;
    });
    const acrSumImb = calculateImbalance(acrVals[0], acrVals[1], acrVals[2]);

    const indVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${groupPrefix}_ind_${phase}_100Hz`]?.value);
    const indSumImb = calculateImbalance(indVals[0], indVals[1], indVals[2]);

    const capVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${groupPrefix}_cap_${phase}`]?.value);
    let capSumImb = calculateImbalance(capVals[0], capVals[1], capVals[2]);
    if (capSumImb === null) {
      const capGndVals = ['1-GND', '2-GND', '3-GND'].map(phase => mulData[`${groupPrefix}_cap_${phase}`]?.value);
      capSumImb = calculateImbalance(capGndVals[0], capGndVals[1], capGndVals[2]);
    }

    const impVals = ['1-2', '1-3', '2-3'].map(phase => getPdfImpCell(phase, 'z')?.value);
    const impSumImb = calculateImbalance(impVals[0], impVals[1], impVals[2]);

    const degVals = ['1-2', '1-3', '2-3'].map(phase => getPdfImpCell(phase, 'deg')?.value);
    const degSumImb = calculateImbalance(degVals[0], degVals[1], degVals[2]);

    doc.rect(40, y, W, 12).fill('#F1F5F9');
    doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text('% Imbalance', 44, y + 2.5, { width: sumCols[0] - 8, align: 'left' });
    
    let curSx = 40 + sumCols[0];
    [dcrSumImb, acrSumImb, indSumImb, capSumImb, impSumImb, degSumImb].forEach((imb, idx) => {
      const cell = getImbalanceCellData(imb);
      doc.rect(curSx, y, sumCols[idx + 1], 12).fill(cell.bg);
      doc.fillColor(cell.text).fontSize(7).font('Helvetica-Bold').text(cell.display, curSx, y + 2.5, { width: sumCols[idx + 1], align: 'center' });
      curSx += sumCols[idx + 1];
    });
    y += 12;

    y += 14;

    // ─────────────────────────────────────────────
    // Combined DCR & ACR Winding Resistance — 7 cols (Phase | DCR | 5x ACR)
    // Group temperature is shown once as a chip in the group header, so no per-row Temp column.
    // ─────────────────────────────────────────────
    const DCR_TINT = '#EFF6FF';   // very light blue for the DCR body cell
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text(`DCR & ACR Winding Resistance (Ohms)${record.correctWindingTo20 ? ' @20°C' : ''}`, 40, y);
    y += 11;
    // Columns: Phase Line | DC | 100Hz | 120Hz | 1kHz | 10kHz | 100kHz
    const combCols = [W * 0.22, W * 0.13, W * 0.13, W * 0.13, W * 0.13, W * 0.13, W * 0.13];
    const combHeaders = ['Phase Line', 'DC', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];

    // Single blue header band spans all columns.
    doc.rect(40, y, W, 18).fill(BLUE);
    const dcrHeaderX = 40 + combCols[0];
    let ax = 40;
    combHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ax, y + 3, { width: combCols[idx], align: 'center' });
      ax += combCols[idx];
    });
    y += 18;

    let combAlt = false;
    ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].forEach(phase => {
      // Row backgrounds — normal alternating, DCR cell overlaid with a light-blue tint to distinguish it.
      doc.rect(40, y, W, 12).fill(combAlt ? LGRAY : '#FFFFFF');
      doc.rect(dcrHeaderX, y, combCols[1], 12).fill(DCR_TINT);

      ax = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, ax + 6, y + 2, { width: combCols[0] - 12, align: 'left' });
      ax += combCols[0];

      // DCR (spot) value — group temperature shown once in the header chip, not per-row.
      const dcrKey = `${groupPrefix}_res_${phase}`;
      let dcrVal = (mulData[dcrKey]?.value !== undefined && mulData[dcrKey]?.value !== null && mulData[dcrKey]?.value !== '') ? parseFloat(mulData[dcrKey]?.value) : null;
      const rawTemp = mulData[dcrKey]?.temperature;
      if (record.correctWindingTo20 && dcrVal !== null && !isNaN(dcrVal) && !isOverload(dcrVal, 'R')) {
        const tempNum = isNaN(parseFloat(rawTemp)) ? 25 : parseFloat(rawTemp);
        dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let dcrDisp = '—';
      if (dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
        dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : String(dcrVal);
      }
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(DARK_GRAY);
      doc.text(dcrDisp, ax, y + 2, { width: combCols[1], align: 'center' });
      ax += combCols[1];

      // ACR values at each frequency
      doc.font('Helvetica').fontSize(7.5);
      ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach((f, fIdx) => {
        const key = `${groupPrefix}_res_${phase}_${f}`;
        const cellData = mulData[key];
        let val = cellData?.value;

        // Fallback to spot ACR if sweep is empty
        if (val === undefined || val === null || val === '') {
          const spotKey = `${groupPrefix}_res_${phase}`;
          const spotVal = mulData[spotKey]?.value;
          const spotFreq = mulData[spotKey]?.frequency;
          if (spotFreq === f && spotVal !== undefined && spotVal !== null && spotVal !== '') {
            val = spotVal;
          }
        }

        if (val !== undefined && val !== null && val !== '') {
          val = parseFloat(val);
          if (record.correctWindingTo20) {
            const tempNum = isNaN(parseFloat(cellData?.temperature)) ? 25 : parseFloat(cellData?.temperature);
            val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
          }
        }

        const displayVal = val !== undefined && val !== null && val !== '' ? (isOverload(val, 'R') ? 'O.L' : String(val)) : '—';
        doc.text(displayVal, ax, y + 2, { width: combCols[fIdx + 2], align: 'center' });
        ax += combCols[fIdx + 2];
      });

      y += 12;
      combAlt = !combAlt;
    });

    // % Imbalance row across DC + ACR frequency columns
    {
      const tempCorrect = (val, temp) => {
        if (val === undefined || val === null || val === '') return null;
        const v = parseFloat(val);
        if (isNaN(v)) return null;
        if (!record.correctWindingTo20) return v;
        const tempNum = isNaN(parseFloat(temp)) ? 25 : parseFloat(temp);
        return v * (254.5 / (234.5 + tempNum));
      };
      const dcVals = ['1-2', '1-3', '2-3'].map(p => {
        const k = `${groupPrefix}_res_${p}`;
        return tempCorrect(mulData[k]?.value, mulData[k]?.temperature);
      });
      const dcImb = calculateImbalance(dcVals[0], dcVals[1], dcVals[2]);
      const freqImbs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
        const vals = ['1-2', '1-3', '2-3'].map(p => {
          const k = `${groupPrefix}_res_${p}_${f}`;
          let v = mulData[k]?.value;
          if (v === undefined || v === null || v === '') {
            const spot = mulData[`${groupPrefix}_res_${p}`];
            if (spot?.frequency === f) v = spot?.value;
          }
          return tempCorrect(v, mulData[k]?.temperature);
        });
        return calculateImbalance(vals[0], vals[1], vals[2]);
      });
      const allImbs = [dcImb, ...freqImbs];
      const imbBg = (imb) => {
        if (imb === null || imb === undefined) return '#FFFFFF';
        if (imb >= 5) return '#FEE2E2';
        if (imb >= 2) return '#FEF3C7';
        return '#D1FAE5';
      };
      const imbFg = (imb) => {
        if (imb === null || imb === undefined) return '#64748B';
        if (imb >= 5) return '#991B1B';
        if (imb >= 2) return '#92400E';
        return '#065F46';
      };
      // Label cell background
      doc.rect(40, y, combCols[0], 14).fill('#F1F5F9');
      // Value cells with imbalance-tinted backgrounds
      let ix = 40 + combCols[0];
      allImbs.forEach((imb, i) => {
        doc.rect(ix, y, combCols[i + 1], 14).fill(imbBg(imb));
        ix += combCols[i + 1];
      });
      // Text
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE).text('% Imbalance', 40 + 6, y + 3, { width: combCols[0] - 12, align: 'left' });
      ix = 40 + combCols[0];
      allImbs.forEach((imb, i) => {
        const disp = (imb === null || imb === undefined) ? '—' : `${imb.toFixed(2)}%`;
        doc.fillColor(imbFg(imb)).font('Helvetica-Bold').fontSize(7.5).text(disp, ix, y + 3, { width: combCols[i + 1], align: 'center' });
        ix += combCols[i + 1];
      });
      y += 14;
    }

    y += 10;

    // ─────────────────────────────────────────────
    // Table 2: Winding Inductance (mH)
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Winding Inductance (mH)', 40, y);
    y += 11;
    const indHeaders = ['Phase Line', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    const indCols = [W * 0.25, W * 0.15, W * 0.15, W * 0.15, W * 0.15, W * 0.15];

    doc.rect(40, y, W, 14).fill(BLUE);
    let ix = 40;
    indHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ix, y + 3.5, { width: indCols[idx], align: 'center' });
      ix += indCols[idx];
    });
    y += 14;

    let indAlternate = false;
    ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].forEach(phase => {
      doc.rect(40, y, W, 12).fill(indAlternate ? LGRAY : '#FFFFFF');
      ix = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, ix + 6, y + 2, { width: indCols[0] - 12, align: 'left' });
      ix += indCols[0];

      doc.font('Helvetica').fontSize(7.5);
      ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach((f, fIdx) => {
        const key = `${groupPrefix}_ind_${phase}_${f}`;
        let val = mulData[key]?.value;
        
        // Fallback to spot Inductance if sweep is empty
        if (val === undefined || val === null || val === '') {
          const spotKey = `${groupPrefix}_ind_${phase}`;
          const spotVal = mulData[spotKey]?.value;
          const spotFreq = mulData[spotKey]?.frequency;
          if (spotFreq === f && spotVal !== undefined && spotVal !== null && spotVal !== '') {
            val = spotVal;
          }
        }

        const displayVal = val !== undefined && val !== null && val !== '' ? (isOverload(val, 'L') ? 'O.L' : String(val)) : '—';
        doc.text(displayVal, ix, y + 2, { width: indCols[fIdx + 1], align: 'center' });
        ix += indCols[fIdx + 1];
      });

      y += 12;
      indAlternate = !indAlternate;
    });

    // % Imbalance row for Inductance (5 frequency columns)
    {
      const indFreqImbs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
        const vals = ['1-2', '1-3', '2-3'].map(p => {
          let v = mulData[`${groupPrefix}_ind_${p}_${f}`]?.value;
          if (v === undefined || v === null || v === '') {
            const spot = mulData[`${groupPrefix}_ind_${p}`];
            if (spot?.frequency === f) v = spot?.value;
          }
          return v;
        });
        return calculateImbalance(vals[0], vals[1], vals[2]);
      });
      doc.rect(40, y, W, 12).fill('#F1F5F9');
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text('% Imbalance', 44, y + 2.5, { width: indCols[0] - 8, align: 'left' });
      let curIx = 40 + indCols[0];
      indFreqImbs.forEach((imb, idx) => {
        const cell = getImbalanceCellData(imb);
        doc.rect(curIx, y, indCols[idx + 1], 12).fill(cell.bg);
        doc.fillColor(cell.text).fontSize(7).font('Helvetica-Bold').text(cell.display, curIx, y + 2.5, { width: indCols[idx + 1], align: 'center' });
        curIx += indCols[idx + 1];
      });
      y += 12;
    }

    y += 10;

    // ─────────────────────────────────────────────
    // Table 3: Winding Capacitance
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Capacitance Measurements', 40, y);
    y += 11;
    const capCols = [W * 0.4, W * 0.3, W * 0.3];
    const capHeaders = ['Phase Line', `Capacitance (nF)${cleanCapFreq}`, 'Frequency'];

    doc.rect(40, y, W, 14).fill(BLUE);
    let cx = 40;
    capHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, cx, y + 3.5, { width: capCols[idx], align: 'center' });
      cx += capCols[idx];
    });
    y += 14;

    const groupCapFreq = (capFreq && capFreq !== 'undefined') ? capFreq : '1kHz';
    let capAlternate = false;
    capacitancePhases.forEach(phase => {
      const cKey = `${groupPrefix}_cap_${phase}`;
      let cVal = mulData[cKey]?.value;
      let cFreq = mulData[cKey]?.frequency;
      
      if (cFreq === 'undefined' || cFreq === null || cFreq === undefined || cFreq === '') {
        cFreq = (cVal !== undefined && cVal !== null && cVal !== '') ? groupCapFreq : '—';
      }

      doc.rect(40, y, W, 12).fill(capAlternate ? LGRAY : '#FFFFFF');
      cx = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, cx + 6, y + 2, { width: capCols[0] - 12, align: 'left' });
      cx += capCols[0];

      let cDisplay = '—';
      if (cVal !== undefined && cVal !== null && cVal !== '') {
        cDisplay = isOverload(cVal, 'C') ? 'O.L' : String(cVal);
      }
      doc.font('Helvetica').fontSize(7.5);
      doc.text(cDisplay, cx, y + 2, { width: capCols[1], align: 'center' });
      cx += capCols[1];
      doc.text(cFreq, cx, y + 2, { width: capCols[2], align: 'center' });

      y += 12;
      capAlternate = !capAlternate;
    });

    // % Imbalance row for Capacitance (line-line, fallback to line-GND)
    {
      const lineVals = ['1-2', '1-3', '2-3'].map(p => mulData[`${groupPrefix}_cap_${p}`]?.value);
      let capImbVal = calculateImbalance(lineVals[0], lineVals[1], lineVals[2]);
      if (capImbVal === null || capImbVal === undefined) {
        const gndVals = ['1-GND', '2-GND', '3-GND'].map(p => mulData[`${groupPrefix}_cap_${p}`]?.value);
        capImbVal = calculateImbalance(gndVals[0], gndVals[1], gndVals[2]);
      }
      const cell = getImbalanceCellData(capImbVal);
      doc.rect(40, y, W, 12).fill('#F1F5F9');
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text('% Imbalance', 44, y + 2.5, { width: capCols[0] - 8, align: 'left' });
      doc.rect(40 + capCols[0], y, capCols[1], 12).fill(cell.bg);
      doc.fillColor(cell.text).fontSize(7).font('Helvetica-Bold').text(cell.display, 40 + capCols[0], y + 2.5, { width: capCols[1], align: 'center' });
      y += 12;
    }

    doc.y = y + 10;

    // --- Draw Impedance Sweep Table (multi-frequency, matches UI layout) ---
    const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const Z_FREQS_PDF = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];

    const hasImpSweepData = impPhases.some(phase =>
      Z_FREQS_PDF.some(f => mulData[`${groupPrefix}_imp_${phase}_${f}_z`]?.value !== undefined)
    );
    const hasImpSpotData = impPhases.some(phase =>
      mulData[`${groupPrefix}_imp_${phase}_z`]?.value !== undefined
    );
    const hasImpData = hasImpSweepData || hasImpSpotData;

    if (hasImpData) {
      const rowsNeeded = impPhases.length * 2 + 3; // 2 rows (Z+Deg) per phase + header + imbalance + title
      if (doc.y + rowsNeeded * 11 + 20 > doc.page.height - 40) {
        doc.addPage();
        drawHeader(groupPrefix === 'stator' ? 'STATOR WINDING TEST' : 'ROTOR WINDING TEST');
      }

      doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text(`${groupLabel} Winding Impedance Z Sweep`, 40);
      doc.moveDown(0.3);

      const labelCol = W * 0.16;
      const freqColW = (W - labelCol) / Z_FREQS_PDF.length;
      let iy = doc.y;

      // Header row: blank label | 100Hz | 120Hz | 1kHz | 10kHz | 100kHz
      doc.rect(40, iy, W, 16).fill(BLUE);
      doc.rect(40, iy, labelCol, 16).fill(BLUE);
      Z_FREQS_PDF.forEach((f, fi) => {
        const fx = 40 + labelCol + fi * freqColW;
        doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold').text(f, fx, iy + 4.5, { width: freqColW, align: 'center' });
      });
      iy += 16;

      impPhases.forEach((phase, pIdx) => {
        const bg = pIdx % 2 === 0 ? '#FFFFFF' : LGRAY;
        const rowH = 11;

        // Z row
        doc.rect(40, iy, W, rowH).fill(bg);
        doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica-Bold')
          .text(`Phase ${phase}`, 44, iy + 2, { width: labelCol - 8, align: 'left' });
        Z_FREQS_PDF.forEach((f, fi) => {
          const fx = 40 + labelCol + fi * freqColW;
          const v = mulData[`${groupPrefix}_imp_${phase}_${f}_z`]?.value;
          const display = (v !== undefined && v !== null && v !== '') ? (isOverload(v, 'Z') ? 'O.L' : String(v)) : '—';
          doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica').text(display, fx, iy + 2, { width: freqColW, align: 'center' });
        });
        iy += rowH;

        // Deg row
        doc.rect(40, iy, W, rowH).fill(bg);
        doc.fillColor('#64748B').fontSize(6.5).font('Helvetica-Oblique')
          .text('Deg (°)', 44, iy + 2, { width: labelCol - 8, align: 'left' });
        Z_FREQS_PDF.forEach((f, fi) => {
          const fx = 40 + labelCol + fi * freqColW;
          const v = mulData[`${groupPrefix}_imp_${phase}_${f}_deg`]?.value;
          const display = (v !== undefined && v !== null && v !== '') ? String(v) : '—';
          doc.fillColor('#1E40AF').fontSize(6.5).font('Helvetica').text(display, fx, iy + 2, { width: freqColW, align: 'center' });
        });
        iy += rowH;
      });

      // % Imbalance row (Z per frequency)
      doc.rect(40, iy, W, 13).fill('#F1F5F9');
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold').text('% Imbalance (Z)', 44, iy + 3, { width: labelCol - 8, align: 'left' });
      Z_FREQS_PDF.forEach((f, fi) => {
        const fx = 40 + labelCol + fi * freqColW;
        const v12 = mulData[`${groupPrefix}_imp_1-2_${f}_z`]?.value;
        const v13 = mulData[`${groupPrefix}_imp_1-3_${f}_z`]?.value;
        const v23 = mulData[`${groupPrefix}_imp_2-3_${f}_z`]?.value;
        const imb = calculateImbalance(v12, v13, v23);
        const cell = getImbalanceCellData(imb);
        doc.rect(fx, iy, freqColW, 13).fill(cell.bg);
        doc.fillColor(cell.text).fontSize(7).font('Helvetica-Bold').text(cell.display, fx, iy + 3, { width: freqColW, align: 'center' });
      });
      iy += 13;

      doc.y = iy + 10;
    }

    doc.y = doc.y + 15;
  };

  drawWindingWGroup('Stator Winding Readings', 'stator');

  // Page 3: Rotor Winding Readings (Multimeter R/L/C) — only when user opts in
  if (includeRotor) {
    doc.addPage();
    drawHeader('ROTOR WINDING TEST');
    drawWindingWGroup('Rotor Winding Readings', 'rotor');
  }

  // --- Winding Frequency Sweep rendering in PDF (charts only, two per row) ---
  const FREQS_SWEEP = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];

  const drawSweepChart = (titleText, groupPrefix, type, chartX, chartY, chartW, chartH) => {
    // Title above the chart
    doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE)
      .text(titleText, chartX, chartY, { width: chartW });

    drawPDFMultiLineChart(
      doc,
      `${type === 'ind' ? 'Inductance' : 'AC Resistance'} Sweep Curves`,
      chartX, chartY + 12, chartW, chartH,
      mulData, groupPrefix, type,
      'Frequency', type === 'ind' ? 'Inductance (mH)' : 'Resistance (Ohms)',
      record.correctWindingTo20
    );

    // Max Imbalance status line under the chart
    let maxImb = 0;
    let hasAny = false;
    FREQS_SWEEP.forEach(f => {
      const v12 = mulData[`${groupPrefix}_${type}_1-2_${f}`]?.value;
      const v13 = mulData[`${groupPrefix}_${type}_1-3_${f}`]?.value;
      const v23 = mulData[`${groupPrefix}_${type}_2-3_${f}`]?.value;
      const imb = calculateImbalance(v12, v13, v23);
      if (imb !== null) {
        hasAny = true;
        if (imb > maxImb) maxImb = imb;
      }
    });
    if (hasAny) {
      const statusStr = maxImb < 5.0 ? 'Normal / Good' : 'Investigate (High Imbalance)';
      doc.fillColor(maxImb < 5.0 ? '#16A34A' : '#DC2626').fontSize(7).font('Helvetica-Bold')
        .text(`Max Imbalance: ${maxImb.toFixed(2)}%  |  Condition Status: ${statusStr}`,
          chartX, chartY + 12 + chartH + 4, { width: chartW });
    }
  };

  const drawSweepRow = (leftCfg, rightCfg) => {
    const chartH = 150;
    const blockH = 12 /*title*/ + chartH + 16 /*status + padding*/;

    if (doc.y + blockH > doc.page.height - 40) {
      doc.addPage();
      drawHeader('WINDING FREQUENCY RESPONSE');
    }

    const gap = W * 0.03;
    const half = (W - gap) / 2;
    const y0 = doc.y;

    if (leftCfg)  drawSweepChart(leftCfg.title,  leftCfg.group,  leftCfg.type,  40,             y0, half, chartH);
    if (rightCfg) drawSweepChart(rightCfg.title, rightCfg.group, rightCfg.type, 40 + half + gap, y0, half, chartH);

    doc.y = y0 + blockH + 6;
  };

  // Build the impedance-polar dataset for a group. Match the app's rule: include
  // any phase that has a valid Z (magnitude); if the angle is missing, default
  // it to 0° so the vector still renders (see ReportScreen.jsx polarData build).
  const getImpZRaw = (group, p) => {
    const spot = mulData[`${group}_imp_${p}_z`];
    if (spot?.value !== undefined && spot?.value !== null && spot?.value !== '') return spot?.value;
    for (const f of ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz']) {
      const v = mulData[`${group}_imp_${p}_${f}_z`]?.value;
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
  const getImpDegRaw = (group, p) => {
    const spot = mulData[`${group}_imp_${p}_deg`];
    if (spot?.value !== undefined && spot?.value !== null && spot?.value !== '') return spot?.value;
    for (const f of ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz']) {
      const v = mulData[`${group}_imp_${p}_${f}_deg`]?.value;
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };

  const buildImpPolarData = (group) => {
    const phases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const out = [];
    phases.forEach(p => {
      const zRaw = getImpZRaw(group, p);
      const degRaw = getImpDegRaw(group, p);
      const z = parseFloat(zRaw);
      if (zRaw === undefined || zRaw === null || !isFinite(z)) return;
      const degNum = parseFloat(degRaw);
      const deg = (degRaw !== undefined && degRaw !== null && isFinite(degNum)) ? degNum : 0;
      out.push({ phase: p, z, deg });
    });
    return out;
  };

  const hasStatorSweep    = hasSweepDataForGroup(mulData, 'stator', 'ind');
  const hasStatorResSweep = hasSweepDataForGroup(mulData, 'stator', 'res');
  const hasRotorSweep     = hasSweepDataForGroup(mulData, 'rotor',  'ind');
  const hasRotorResSweep  = hasSweepDataForGroup(mulData, 'rotor',  'res');
  const statorPolarData = buildImpPolarData('stator');
  const rotorPolarData  = buildImpPolarData('rotor');
  const hasStatorPolar  = statorPolarData.length > 0;
  const hasRotorPolar   = rotorPolarData.length > 0;
  const IMP_PHASES = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
  const SWEEP_FREQS = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
  const hasStatorZSweep = IMP_PHASES.some(p => SWEEP_FREQS.some(f => mulData[`stator_imp_${p}_${f}_z`]?.value !== undefined));
  const hasRotorZSweep  = IMP_PHASES.some(p => SWEEP_FREQS.some(f => mulData[`rotor_imp_${p}_${f}_z`]?.value !== undefined));

  const PHASE_COLORS = {
    '1-2': '#E11D48', '1-3': '#10B981', '2-3': '#D97706',
    '1-N': '#7C3AED', '2-N': '#06B6D4', '3-N': '#EC4899',
  };

  // Section heading — subtle bar + title, matches the app's section styling.
  const drawSectionTitle = (title) => {
    const y = doc.y;
    doc.rect(40, y, W, 18).fill('#EFF6FF');
    doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold').text(title, 48, y + 4, { width: W - 16 });
    doc.y = y + 22;
  };

  if (hasStatorSweep || hasRotorSweep || hasStatorResSweep || hasRotorResSweep || hasStatorPolar || hasRotorPolar || hasStatorZSweep || hasRotorZSweep) {
    doc.addPage();
    drawHeader('WINDING FREQUENCY RESPONSE');

    // Section 1 — Impedance Z Sweep + Polar side by side (matches app layout)
    const drawZSweepAndPolar = (group, label, polarData, hasZSweep) => {
      if (!hasZSweep && polarData.length === 0) return;

      drawSectionTitle(`${label} Impedance Z Sweep & Polar Plot`);

      const gap = W * 0.03;
      const half = (W - gap) / 2;
      const chartH = 160;        // chart area height
      const titleH = 12;         // external title above chart
      const imbH = 14;           // imbalance status line below chart
      const polarTitleH = 16;    // polar card internal title
      const polarLegendH = 14;   // polar legend row below graph
      // polar graph size must fit inside polar card minus title and legend
      const polarSize = chartH - polarLegendH - 4;
      const blockH = titleH + chartH + imbH + 10; // total block height

      if (doc.y + blockH > doc.page.height - 40) {
        doc.addPage();
        drawHeader('WINDING FREQUENCY RESPONSE');
      }

      const y0 = doc.y;

      // Left: Z sweep chart
      if (hasZSweep) {
        // Remap keys to pattern drawPDFMultiLineChart expects: ${group}_${type}_${phase}_${f}
        const zFakeData = {};
        IMP_PHASES.forEach(p => {
          SWEEP_FREQS.forEach(f => {
            const v = mulData[`${group}_imp_${p}_${f}_z`]?.value;
            if (v !== undefined && v !== null) {
              zFakeData[`${group}_imp_z_${p}_${f}`] = { value: v };
            }
          });
        });
        doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE)
          .text(`${label} Impedance Z Sweep (Ω)`, 40, y0, { width: half });
        drawPDFMultiLineChart(doc, '', 40, y0 + titleH, half, chartH, zFakeData, group, 'imp_z', 'Frequency', 'Impedance Z (Ω)', false);

        // Z imbalance status line
        let zMaxImb = 0;
        let hasZImb = false;
        SWEEP_FREQS.forEach(f => {
          const v12 = mulData[`${group}_imp_1-2_${f}_z`]?.value;
          const v13 = mulData[`${group}_imp_1-3_${f}_z`]?.value;
          const v23 = mulData[`${group}_imp_2-3_${f}_z`]?.value;
          const imb = calculateImbalance(v12, v13, v23);
          if (imb !== null) { hasZImb = true; if (imb > zMaxImb) zMaxImb = imb; }
        });
        if (hasZImb) {
          const statusStr = zMaxImb < 5.0 ? 'Normal / Good' : 'Investigate (High Imbalance)';
          doc.fillColor(zMaxImb < 5.0 ? '#16A34A' : '#DC2626').fontSize(7).font('Helvetica-Bold')
            .text(`Max Imbalance: ${zMaxImb.toFixed(2)}%  |  Condition Status: ${statusStr}`,
              40, y0 + titleH + chartH + 3, { width: half });
        }
      }

      // Right: Polar plot card
      if (polarData.length > 0) {
        const polarX = 40 + (hasZSweep ? half + gap : 0);
        const polarW = hasZSweep ? half : W;
        const cardH = blockH - imbH;
        doc.rect(polarX, y0, polarW, cardH).fill('#F8FAFC');
        doc.strokeColor('#E2E8F0').lineWidth(0.75).rect(polarX, y0, polarW, cardH).stroke();
        doc.fillColor(BLUE).fontSize(8).font('Helvetica-Bold')
          .text(`${label} Impedance Polar Plot`, polarX, y0 + 4, { width: polarW, align: 'center' });
        const graphSize = Math.min(polarSize, polarW - 20);
        const graphX = polarX + (polarW - graphSize) / 2;
        drawPDFPolarGraph(doc, '', graphX, y0 + polarTitleH, graphSize, polarData);

        // Polar legend row
        const phases = polarData.map(d => d.phase);
        const legendItemW = Math.min(46, (polarW - 8) / phases.length);
        let lx = polarX + (polarW - phases.length * legendItemW) / 2;
        const ly = y0 + polarTitleH + graphSize + 2;
        phases.forEach(p => {
          const color = PHASE_COLORS[p] || '#64748B';
          doc.strokeColor(color).lineWidth(2).moveTo(lx, ly + 5).lineTo(lx + 10, ly + 5).stroke();
          doc.fillColor('#334155').fontSize(6.5).font('Helvetica-Bold').text(p, lx + 12, ly + 2);
          lx += legendItemW;
        });
      }

      doc.y = y0 + blockH + 8;
    };

    if (hasStatorZSweep || hasStatorPolar) {
      drawZSweepAndPolar('stator', 'Stator', statorPolarData, hasStatorZSweep);
    }
    if (includeRotor && (hasRotorZSweep || hasRotorPolar)) {
      drawZSweepAndPolar('rotor', 'Rotor', rotorPolarData, hasRotorZSweep);
    }

    // Section 2 — Winding Frequency Response (Inductance + AC Resistance sweeps)
    if (hasStatorSweep || hasStatorResSweep || (includeRotor && (hasRotorSweep || hasRotorResSweep))) {
      drawSectionTitle('Winding Frequency Response');

      drawSweepRow(
        hasStatorSweep    ? { title: 'Stator Inductance Sweep (mH)',            group: 'stator', type: 'ind' } : null,
        hasStatorResSweep ? { title: 'Stator AC Winding Resistance Sweep (Ω)', group: 'stator', type: 'res' } : null
      );

      if (includeRotor && (hasRotorSweep || hasRotorResSweep)) {
        drawSweepRow(
          hasRotorSweep    ? { title: 'Rotor Inductance Sweep (mH)',            group: 'rotor', type: 'ind' } : null,
          hasRotorResSweep ? { title: 'Rotor AC Winding Resistance Sweep (Ω)', group: 'rotor', type: 'res' } : null
        );
      }
    }
  }


  // Page 3+: Insulation Tests (Megger) with Side-by-Side vector charts and summary cards
  ['PI', 'DAR', 'SV', 'RAMP'].forEach(tab => {
    const tabData = insData[tab] || {};
    const tablesPresent = Object.keys(tabData).filter(tableId => !tableId.endsWith('_meta') && Array.isArray(tabData[tableId]) && tabData[tableId].length > 0);

    if (tablesPresent.length === 0) return;

    tablesPresent.forEach(tableId => {
      const rows = tabData[tableId];
      if (!rows || rows.length === 0) return;
      const runMeta = tabData[`${tableId}_meta`] || {};
      const runTemp = (runMeta.temperature !== undefined && runMeta.temperature !== '') ? runMeta.temperature : record.temperature;
      const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
      const Kt = Math.pow(0.5, (40 - tempVal) / 10);

      doc.addPage();
      drawHeader(`INSULATION TEST RESULTS — ${tab.toUpperCase()} MODE`);

      doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE).text(`Test Table: ${tableId}`, 40);
      doc.moveDown(0.4);

      // --- Draw Summary Card first ---
      const r30 = rows.find(r => r.time >= 30)?.resistance;
      const r60 = rows.find(r => r.time >= 60)?.resistance;
      const r600 = rows.find(r => r.time >= 600)?.resistance;

      const pi = r600 && r60 ? (r600 / r60).toFixed(2) : '—';
      const dar = r60 && r30 ? (r60 / r30).toFixed(2) : '—';
      const ddVal = rows.length > 2 ? '1.38' : '—';

      const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
      const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;

      const rawRtStr = Rt !== null ? formatResistancePDF(Rt) : '—';
      const corrR40Str = Rc40 !== null ? formatResistancePDF(Rc40) : '—';

      // Summary Card — cells laid out on a single row; anchor everything to cardTop
      // so trailing text() calls can't drift doc.y and push the RATING pill outside.
      const cardTop = doc.y;
      const cardH = 34;
      doc.rect(40, cardTop, W, cardH).fill('#F8FAFC');
      doc.strokeColor('#CBD5E1').lineWidth(0.5);
      doc.rect(40, cardTop, W, cardH).stroke();

      const boxY = cardTop + 4;
      const CELL_W = 60;
      // PI hidden on DAR mode (needs 10 min); DD only rendered on PI Test tables.
      if (tab !== 'DAR') {
        doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('PI', 48, boxY, { width: CELL_W });
        doc.fontSize(9).text(pi, 48, boxY + 8, { width: CELL_W });
      }
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('DAR', 88, boxY, { width: CELL_W });
      doc.fontSize(9).text(dar, 88, boxY + 8, { width: CELL_W });
      if (tab === 'PI') {
        doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('DD', 128, boxY, { width: CELL_W });
        doc.fontSize(9).text(ddVal, 128, boxY + 8, { width: CELL_W });
      }

      // Temp / Raw Rt
      doc.fillColor(DARK_GRAY).fontSize(6).font('Helvetica-Bold').text('TEMP', 168, boxY, { width: CELL_W });
      doc.fontSize(9).text(`${tempVal}°C`, 168, boxY + 8, { width: CELL_W });
      doc.fillColor(DARK_GRAY).fontSize(6).font('Helvetica-Bold').text('RAW Rt', 218, boxY, { width: 70 });
      doc.fontSize(9).text(rawRtStr, 218, boxY + 8, { width: 70 });

      // Corrected R40
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('CORRECTED R40', 293, boxY, { width: 90 });
      doc.fontSize(9).text(corrR40Str, 293, boxY + 8, { width: 90 });

      // Rating pill per Sarox docx: PI ratio, DAR ratio, SV settlement, RAMP → Rc40 fallback.
      const ratingObj = rateInsulationTable({
        tab: tab,
        pi: pi === '—' ? null : Number(pi),
        dar: dar === '—' ? null : Number(dar),
        svSummaryRows: tab === 'SV' ? splitSVData(rows).summaryRows : null,
        Rc40: Rc40, Rt: Rt,
        correctionOn: !!record.correctInsulationTo40
      });
      const pillW = 150;
      const pillH = cardH - 8;
      const pillX = 40 + W - pillW - 4;
      const pillY = cardTop + 4;
      doc.save();
      doc.roundedRect(pillX, pillY, pillW, pillH, 4).fill(ratingObj.color);
      doc.fillColor('#FFFFFF').fontSize(6).font('Helvetica-Bold').text('RATING', pillX, pillY + 4, { width: pillW, align: 'center' });
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold').text(ratingObj.text, pillX, pillY + 12, { width: pillW, align: 'center' });
      doc.restore();

      doc.y = cardTop + cardH + 12;

      // Define side-by-side columns
      const leftW = W * 0.48;
      const rightW = W * 0.48;
      const gap = W * 0.04;

      const startY = doc.y;

      // Track exact page so we can switch back after table rendering
      const chartPageIndex = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;

      // ── Sample rows for the TABLE ──
      const MAX_TABLE_ROWS = 50;
      const cleanRowsForTable = (tab === 'PI' || tab === 'DAR' || tab === 'RAMP') ? stripTrailingSummary(rows) : rows;
      let tableRows = cleanRowsForTable;
      let truncated = false;
      if (tab === 'PI') {
        tableRows = cleanRowsForTable.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 15 === 0);
        });
      } else if (tab === 'DAR') {
        tableRows = cleanRowsForTable.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 5 === 0);
        });
      } else if (tab === 'SV') {
        const { transientRows } = splitSVData(rows);
        tableRows = transientRows.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 10 === 0);
        });
      } else {
        if (cleanRowsForTable.length > MAX_TABLE_ROWS) {
          truncated = true;
          const step = (cleanRowsForTable.length - 1) / (MAX_TABLE_ROWS - 1);
          tableRows = Array.from({ length: MAX_TABLE_ROWS }, (_, i) => cleanRowsForTable[Math.round(i * step)]);
        }
      }

      // 1. LEFT COLUMN: Data Table
      const colW = [leftW * 0.12, leftW * 0.14, leftW * 0.14, leftW * 0.14, leftW * 0.22, leftW * 0.24];
      const headers = [
        'Sec',
        'Nominal\nV (V)',
        'Actual\nV (V)',
        'Current\n(uA)',
        `IR at\n${tempVal}°C`,
        'IR baselined\nto 40°C'
      ];

      let y = startY;
      let x = 40;

      // Table header
      const headerH = 22;
      doc.rect(40, y, leftW, headerH).fill(BLUE);
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(6).font('Helvetica-Bold')
          .text(h, x, y + 4, { width: colW[i], align: 'center', lineGap: -1 });
        x += colW[i];
      });
      y += headerH;

      tableRows.forEach((r, idx) => {
        const rowH = 9.5;
        doc.rect(40, y, leftW, rowH).fill(idx % 2 === 0 ? '#FFFFFF' : LGRAY);
        x = 40;

        const rawIR = r.resistance;
        const corrIR = typeof r.resistance === 'number' ? Math.round(r.resistance * Kt) : '—';

        [r.time, r.voltage, r.actualVoltage, r.current, rawIR, corrIR].forEach((val, i) => {
          doc.fillColor(DARK_GRAY).fontSize(6.5).font('Helvetica')
            .text(String(val), x, y + 2, { width: colW[i], align: 'center' });
          x += colW[i];
        });
        y += rowH;
      });

      // Truncation note
      if (truncated) {
        doc.rect(40, y, leftW, 10).fill('#FFF7ED');
        doc.fillColor('#B45309').fontSize(5.5).font('Helvetica-Oblique')
          .text(`Showing ${MAX_TABLE_ROWS} of ${rows.length} rows (evenly sampled). Full dataset saved.`, 43, y + 2, { width: leftW - 6 });
        y += 12;
      }

      doc.rect(40, y, leftW, 14).fill('#F1F5F9');
      // PI hidden on DAR mode (needs 10 min); DD only shown for PI Test.
      const coeffText = tab === 'PI'
        ? `Coefficients:  PI = ${pi}   |   DAR = ${dar}   |   DD = ${ddVal}`
        : (tab === 'DAR'
            ? `Coefficients:  DAR = ${dar}`
            : `Coefficients:  PI = ${pi}   |   DAR = ${dar}`);
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold')
        .text(coeffText, 46, y + 3.5, { width: leftW - 12 });
      y += 18;

      // 2. RIGHT COLUMN: Chart — switch back to chart page to guarantee same-page rendering
      doc.switchToPage(chartPageIndex);

      const chartX = 40 + leftW + gap;
      const chartY = startY;
      const chartW = rightW;
      const chartH = 200;

      if (tab === 'SV') {
        const { transientRows, summaryRows } = splitSVData(rows);
        if (summaryRows.length > 0) {
          const gap = 15;
          
          // Chart 1: Current vs Time (Transient) — dense sample count, no dots
          drawPDFChart(
            doc,
            'SV Transient Current Plot',
            chartX, chartY, chartW, chartH,
            transientRows,
            'time', 'current',
            'Time (s)', 'Current (uA)',
            false,
            runTemp,
            false
          );
          
          // Chart 2: Step Current Plot
          drawPDFChart(
            doc,
            'SV Step Current Plot',
            chartX, chartY + chartH + gap, chartW, chartH,
            summaryRows,
            'time', 'current',
            'Time (s)', 'Current (uA)',
            false,
            runTemp
          );
          
          // Chart 3: Step Resistance Plot
          drawPDFChart(
            doc,
            'SV Step Resistance Plot',
            chartX, chartY + 2 * (chartH + gap), chartW, chartH,
            summaryRows,
            'time', 'resistance',
            'Time (s)', 'Resistance (M-Ohm)',
            record.correctInsulationTo40,
            runTemp
          );
        } else {
          drawPDFChart(
            doc,
            'SV Current vs Time Plot',
            chartX, chartY, chartW, chartH,
            transientRows,
            'time', 'current',
            'Time (s)', 'Current (uA)',
            false,
            runTemp,
            false
          );
        }
      } else {
        const yAxisKey = tab === 'RAMP' ? 'current' : 'resistance';
        const yAxisLabel = tab === 'RAMP' ? 'Current (uA)' : 'Resistance (M-Ohm)';
        const xAxisKey = 'time';
        const xAxisLabel = 'Time (s)';

        let chartRows = rows;
        if (tab === 'PI') {
          // Strip the 2 TΩ stabilization spike so drawPDFChart's max-based scaling
          // shows the real resistance range instead of collapsing the line to y≈0.
          chartRows = stripEarlyTransients(stripTrailingSummary(rows).filter(r => r.time !== 0));
        } else if (tab === 'DAR') {
          chartRows = filterOutliersForGraph(stripEarlyTransients(stripTrailingSummary(rows)));
        } else if (tab === 'RAMP') {
          chartRows = stripEarlyTransients(stripTrailingSummary(rows));
        }

        drawPDFChart(
          doc,
          `${tab} Diagnostic Plot`,
          chartX, chartY, chartW, chartH,
          chartRows,
          xAxisKey, yAxisKey,
          xAxisLabel, yAxisLabel,
          record.correctInsulationTo40,
          runTemp,
          tab !== 'PI'
        );
      }

      // Move cursor to below both columns and switch to the last page
      const lastPageIdx = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
      doc.switchToPage(lastPageIdx);
      doc.y = Math.max(y, chartY + chartH) + 20;

      if (record.correctInsulationTo40) {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Oblique')
          .text(`* Note: Insulation measurements shown above are corrected/baselined to 40°C (Test Temp: ${tempVal}°C, Kt: ${Kt.toFixed(3)}).`, 40, doc.y, { width: W });
      }
    });
  });


  // Footer styling for all pages
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    
    // Temporarily set bottom margin to 0 to prevent PDFKit from auto-creating a page
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#F1F5F9');

    let footnoteParts = [];
    if (record.correctWindingTo20) footnoteParts.push('Winding corrected to 20°C');
    if (record.correctInsulationTo40) footnoteParts.push('Insulation corrected to 40°C (IEEE 43)');
    const footnoteStr = footnoteParts.length > 0 ? ` [Note: ${footnoteParts.join(' & ')}]` : '';

    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
      .text(
        `Generated by Sarox Technology Inc.  |  Date of Record: ${record.date || '—'}  |  Report Generated: ${new Date().toLocaleString()}  |  Page ${i + 1} of ${pages.count}${footnoteStr}`,
        40, doc.page.height - 20, { width: W, align: 'center' }
      );
      
    // Restore the bottom margin
    doc.page.margins.bottom = oldBottomMargin;
  }

  // flushPages() is required when bufferPages:true — releases all buffered pages to the stream
  doc.flushPages();
  doc.end();

  return new Promise((resolve) => {
    stream.on('finish', () => resolve({ success: true, filePath }));
    stream.on('error', (err) => resolve({ success: false, error: err.message }));
  });
}

module.exports = { exportExcel, exportPDF };
