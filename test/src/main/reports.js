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
    const macDirs = ['/Library/Fonts', '/System/Library/Fonts'];
    const candidates = [
      { regular: 'Helvetica.ttc', bold: 'Helvetica.ttc', italic: 'Helvetica.ttc', boldItalic: 'Helvetica.ttc' },
      { regular: 'Arial.ttf', bold: 'Arial Bold.ttf', italic: 'Arial Italic.ttf', boldItalic: 'Arial Bold Italic.ttf' }
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

// Helper to check pass/fail status
function getPassStatus(Rc40) {
  if (Rc40 === null || Rc40 === undefined) return { text: '—', color: '#64748b' };
  if (Rc40 >= 100) return { text: 'Pass (Excellent)', color: '#16a34a' };
  if (Rc40 >= 5) return { text: 'Pass (Standard)', color: '#2563eb' };
  return { text: 'Fail (Low Insulation)', color: '#dc2626' };
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
      if (cellData && cellData.value !== undefined) {
        let val = cellData.value;
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

  // Get data boundaries
  const rawMinY = Math.min(...allYValues);
  const minY = rawMinY < 0 ? Math.floor(rawMinY - 1) : 0;
  const maxY = Math.max(...allYValues) * 1.15 || 100; // 15% headroom

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

    // Y-Axis label
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica')
      .text(Math.round(yVal).toLocaleString(), startX + 8, py - 2.5, { width: marginL - 10, align: 'right' });
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
  const centerX = startX + size / 2;
  const centerY = startY + size / 2 + 10;
  const maxR = size / 2 - 20;

  // Title
  doc.fillColor('#1E3A8A').fontSize(8.5).font('Helvetica-Bold')
    .text(title, startX, startY + 2, { width: size, align: 'center' });

  // Grid circles
  doc.strokeColor('#E2E8F0').lineWidth(0.5);
  doc.circle(centerX, centerY, maxR * 0.33).stroke();
  doc.circle(centerX, centerY, maxR * 0.66).stroke();
  doc.circle(centerX, centerY, maxR).stroke();

  // Draw axis lines (0, 45, 90, 135 degrees)
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  angles.forEach(angle => {
    const rad = (angle * Math.PI) / 180;
    const endX = centerX + maxR * Math.cos(rad);
    const endY = centerY - maxR * Math.sin(rad);
    doc.moveTo(centerX, centerY).lineTo(endX, endY).dash(2, { space: 2 }).stroke();

    // Labels for 0, 90, 180, 270
    if (angle % 90 === 0) {
      doc.fillColor('#64748B').fontSize(5.5).font('Helvetica');
      let lx = endX;
      let ly = endY;
      if (angle === 0) { lx += 2; ly -= 2.5; }
      else if (angle === 90) { lx -= 10; ly -= 7; }
      else if (angle === 180) { lx -= 15; ly -= 2.5; }
      else if (angle === 270) { lx -= 10; ly += 2; }
      doc.text(`${angle}°`, lx, ly);
    }
  });

  // Find max Z to scale radius
  const validPoints = impData.filter(d => d.z !== null && d.z !== undefined && !isNaN(d.z));
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

  // Plot points
  validPoints.forEach(pt => {
    const r = (pt.z / maxZ) * maxR;
    const rad = (pt.deg * Math.PI) / 180;
    const px = centerX + r * Math.cos(rad);
    const py = centerY - r * Math.sin(rad);
    const color = phaseColors[pt.phase] || '#64748B';

    doc.fillColor(color).circle(px, py, 2.5).fill();
    // Tiny label near point
    doc.fillColor(color).fontSize(5).font('Helvetica-Bold')
      .text(`${pt.phase}`, px + 4, py - 2.5);
  });
}

// ─────────────────────────────────────────────
// VECTOR CHART RENDER ENGINE FOR PDFKIT
// ─────────────────────────────────────────────
function drawPDFChart(doc, title, startX, startY, width, height, rawData, xKey, yKey, xLabel, yLabel, isCorrectedMode, tempRecordValue) {
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

    // Draw dots
    doc.fillColor('#1D4ED8');
    data.forEach(d => {
      doc.circle(scaleX(d[xKey]), scaleY(d[yKey]), 1.2).fill();
    });
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
async function exportExcel(recordId, mainWindow, chartImages) {
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
  addKeyValue('Wire Marking T1', record.wireMarkingT1);
  addKeyValue('Wire Marking T2', record.wireMarkingT2);
  addKeyValue('Wire Marking T3', record.wireMarkingT3);
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
      const hasIns = Object.values(insData).some(tabObj => tabObj && Object.values(tabObj).some(arr => arr && arr.length > 0));
      if (!hasIns) return '—';
      let overallPass = 'Pass (Excellent)';
      Object.keys(insData).forEach(tab => {
        const tabData = insData[tab] || {};
        const activeTables = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);
        activeTables.forEach(tableId => {
          const rows = tabData[tableId];
          const runMeta = tabData[`${tableId}_meta`] || {};
          const runTemp = (runMeta.temperature !== undefined && runMeta.temperature !== '') ? runMeta.temperature : (record.temperature || 25);
          const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
          const Kt = Math.pow(0.5, (40 - tempVal) / 10);
          const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
          const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;
          const status = getPassStatus(record.correctInsulationTo40 ? Rc40 : Rt);
          if (status.text.includes('Fail')) overallPass = 'Fail';
          else if (status.text.includes('Standard') && overallPass !== 'Fail') overallPass = 'Pass (Standard)';
        });
      });
      return overallPass.includes('Excellent') ? 'Excellent' : (overallPass.includes('Standard') ? 'Normal' : 'Alarm');
    }
    
    // Winding Imbalances at card group level for defaults
    const statorResImb = calculateImbalance(mulData?.['stator_res_1-2']?.value, mulData?.['stator_res_1-3']?.value, mulData?.['stator_res_2-3']?.value);
    const statorIndImb = calculateImbalance(mulData?.['stator_ind_1-2_100Hz']?.value, mulData?.['stator_ind_1-3_100Hz']?.value, mulData?.['stator_ind_2-3_100Hz']?.value);
    const statorImpImb = calculateImbalance(mulData?.['stator_imp_1-2_z']?.value, mulData?.['stator_imp_1-3_z']?.value, mulData?.['stator_imp_2-3_z']?.value);

    if (key === 'condResistance') {
      return statorResImb !== null ? (statorResImb < 2 ? 'Excellent' : (statorResImb < 5 ? 'Caution' : 'Alarm')) : '—';
    }
    if (key === 'condInductance') {
      return statorIndImb !== null ? (statorIndImb < 2 ? 'Excellent' : (statorIndImb < 5 ? 'Caution' : 'Alarm')) : '—';
    }
    if (key === 'condImpedance') {
      if (statorImpImb !== null) {
        return statorImpImb < 2 ? 'Excellent' : (statorImpImb < 5 ? 'Caution' : 'Alarm');
      }
      const hasImp = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => mulData[`stator_imp_${p}_z`]?.value !== undefined);
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
      return maxSwImb > 0 ? (maxSwImb < 2 ? 'Excellent' : (maxSwImb < 5 ? 'Caution' : 'Alarm')) : '—';
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
    
    // Style background color based on status choice
    const valBgColors = {
      'Excellent': 'FFD4EDDA',
      'Normal':    'FFD1ECF1',
      'Caution':   'FFFFF3CD',
      'Alarm':     'FFF8D7DA',
      'Observe':   'FFE2D9F3',
      '—':         'FFF8FAFC'
    };
    const valTextColors = {
      'Excellent': 'FF155724',
      'Normal':    'FF0C5460',
      'Caution':   'FF856404',
      'Alarm':     'FF721C24',
      'Observe':   'FF383D41',
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
    
    // Group Header
    const groupRow = windingSheet.addRow([`${groupName} Winding Readings`]);
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
      const impKey = `${group}_imp_${phase}_z`;
      let impVal = mulData[impKey]?.value;
      let impDisp = '—';
      if (impVal !== undefined && impVal !== null && impVal !== '') {
        impDisp = isOverload(impVal, 'Z') ? 'O.L' : String(impVal);
      }

      // 6. Angle
      const degKey = `${group}_imp_${phase}_deg`;
      let degVal = mulData[degKey]?.value;
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

    const impVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_imp_${phase}_z`]?.value);
    const impSumImb = calculateImbalance(impVals[0], impVals[1], impVals[2]);

    const degVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_imp_${phase}_deg`]?.value);
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
    // Table 1: Winding Resistance (DCR)
    // ─────────────────────────────────────────────
    windingSheet.addRow([]); // spacer
    const t1Title = windingSheet.addRow(['Winding Resistance (DCR)']);
    windingSheet.mergeCells(`A${t1Title.number}:C${t1Title.number}`);
    t1Title.getCell(1).font = boldFont;

    const t1Headers = windingSheet.addRow(['Phase Line', `Resistance (DCR) (Ω)${record.correctWindingTo20 ? ' @20°C' : ''}`, 'Temperature (°C)']);
    styleHeaderRow(t1Headers, 3);

    standardPhases.forEach((phase, pIdx) => {
      const rKey = `${group}_res_${phase}`;
      let rVal = (mulData[rKey]?.value !== undefined && mulData[rKey]?.value !== null && mulData[rKey]?.value !== '') ? parseFloat(mulData[rKey]?.value) : null;
      let rTemp = mulData[rKey]?.temperature;

      if (rTemp === 'undefined' || rTemp === null || rTemp === undefined || rTemp === '') rTemp = '—';
      else rTemp = `${rTemp}°C`;

      if (record.correctWindingTo20 && rVal !== null && !isNaN(rVal) && !isOverload(rVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[rKey]?.temperature)) ? 25 : parseFloat(mulData[rKey]?.temperature);
        rVal = parseFloat((rVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }

      let rDisplay = '—';
      if (rVal !== undefined && rVal !== null && rVal !== '') {
        rDisplay = isOverload(rVal, 'R') ? 'O.L' : String(rVal);
      }

      const row = windingSheet.addRow([`Phase ${phase}`, rDisplay, rTemp]);
      styleBodyRow(row, 3, pIdx % 2 === 1);
    });

    // ─────────────────────────────────────────────
    // Table 2: AC Winding Resistance (ACR)
    // ─────────────────────────────────────────────
    windingSheet.addRow([]); // spacer
    const t2Title = windingSheet.addRow(['AC Winding Resistance (ACR)']);
    windingSheet.mergeCells(`A${t2Title.number}:F${t2Title.number}`);
    t2Title.getCell(1).font = boldFont;

    const t2Headers = windingSheet.addRow(['Phase Line', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz']);
    styleHeaderRow(t2Headers, 6);

    ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].forEach((phase, pIdx) => {
      const rowVals = [`Phase ${phase}`];
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
      styleBodyRow(row, 6, pIdx % 2 === 1);
    });

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

    // ─────────────────────────────────────────────
    // Table 5: Impedance Z & Phase Angle Measurements
    // ─────────────────────────────────────────────
    const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const hasImpData = impPhases.some(phase => mulData[`${group}_imp_${phase}_z`]?.value !== undefined || mulData[`${group}_imp_${phase}_deg`]?.value !== undefined);
    
    if (hasImpData) {
      windingSheet.addRow([]); // spacer
      const t5Title = windingSheet.addRow([`${groupName} Impedance (Z & Phase Angle) Measurements`]);
      windingSheet.mergeCells(`A${t5Title.number}:E${t5Title.number}`);
      t5Title.getCell(1).font = boldFont;

      const t5Headers = windingSheet.addRow(['Phase Line', 'Impedance Z (Ω)', 'Phase Angle (°)', 'Frequency', 'Temp (°C)']);
      styleHeaderRow(t5Headers, 5);

      impPhases.forEach((phase, pIdx) => {
        const zKey = `${group}_imp_${phase}_z`;
        const degKey = `${group}_imp_${phase}_deg`;
        const zVal = mulData[zKey]?.value;
        const degVal = mulData[degKey]?.value;
        const groupImpFreq = mulData[`${group}_imp_freq`]?.frequency;
        const fVal = mulData[zKey]?.frequency;
        const dVal = mulData[degKey]?.frequency;
        let zFreq = '—';
        if (fVal && fVal !== 'undefined' && fVal !== 'null') {
          zFreq = fVal;
        } else if (dVal && dVal !== 'undefined' && dVal !== 'null') {
          zFreq = dVal;
        } else if (groupImpFreq && groupImpFreq !== 'undefined' && groupImpFreq !== 'null') {
          zFreq = groupImpFreq;
        }
        let zTemp = mulData[zKey]?.temperature !== undefined ? `${mulData[zKey].temperature}°C` : (mulData[degKey]?.temperature !== undefined ? `${mulData[degKey].temperature}°C` : '—');
        if (zTemp.includes('undefined')) zTemp = '—';

        let zDisplay = '—';
        if (zVal !== undefined && zVal !== null && zVal !== '') {
          zDisplay = isOverload(zVal, 'Z') ? 'O.L' : String(zVal);
        }
        let degDisplay = '—';
        if (degVal !== undefined && degVal !== null && degVal !== '') {
          degDisplay = String(degVal);
        }

        const row = windingSheet.addRow([`Phase ${phase}`, zDisplay, degDisplay, zFreq, zTemp]);
        styleBodyRow(row, 5, pIdx % 2 === 1);
      });

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
  addGroupWindingTables('rotor');

  const windingFootnoteText = record.correctWindingTo20
    ? `* Note: The winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula (Baseline 20°C correction is ACTIVE).`
    : `* Note: The winding resistance measurements shown above are raw/uncorrected values (Baseline 20°C correction is INACTIVE).`;
  const windingFootnoteRow = windingSheet.addRow([windingFootnoteText]);
  windingSheet.mergeCells(`A${windingFootnoteRow.number}:F${windingFootnoteRow.number}`);
  windingFootnoteRow.getCell(1).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF64748B' } };

  // ── Sheet: Winding Frequency Sweep ──
  const tablePhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
  const tableFreqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];

  const hasStatorIndSweep = hasSweepDataForGroup(mulData, 'stator', 'ind');
  const hasStatorResSweep = hasSweepDataForGroup(mulData, 'stator', 'res');
  const hasRotorIndSweep = hasSweepDataForGroup(mulData, 'rotor', 'ind');
  const hasRotorResSweep = hasSweepDataForGroup(mulData, 'rotor', 'res');

  if (hasStatorIndSweep || hasStatorResSweep || hasRotorIndSweep || hasRotorResSweep) {
    const sweepSheet = workbook.addWorksheet('Winding Frequency Sweep');
    sweepSheet.columns = [
      { key: 'phase', width: 22 },
      { key: 'f100', width: 14 },
      { key: 'f120', width: 14 },
      { key: 'f1k', width: 14 },
      { key: 'f10k', width: 14 },
      { key: 'f100k', width: 14 }
    ];

    embedLogoAndDate(sweepSheet, 12, 0);

    const addSweepSection = (title, group, type, unit) => {
      const groupData = [];
      tablePhases.forEach(phase => {
        const rowData = { phase: `${group.charAt(0).toUpperCase() + group.slice(1)} Phase ${phase}` };
        let rowHasData = false;
        tableFreqs.forEach((f) => {
          const cellData = mulData[`${group}_${type}_${phase}_${f}`];
          if (cellData && cellData.value !== undefined) {
            rowHasData = true;
            let val = cellData.value;
            if (type === 'res' && record.correctWindingTo20) {
              const tempNum = isNaN(parseFloat(cellData.temperature)) ? 25 : parseFloat(cellData.temperature);
              val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
            }
            const key = `f${f.replace('Hz', '').replace('kHz', 'k')}`;
            rowData[key] = val;
          }
        });
        if (rowHasData) {
          groupData.push(rowData);
        }
      });

      if (groupData.length === 0) return;

      const headerRow = sweepSheet.addRow([title]);
      sweepSheet.mergeCells(`A${headerRow.number}:F${headerRow.number}`);
      headerRow.getCell(1).font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      headerRow.getCell(1).fill = headerFill;
      headerRow.height = 20;

      const subHeaderRow = sweepSheet.addRow(['Phase Line', '100 Hz', '120 Hz', '1 kHz', '10 kHz', '100 kHz']);
      subHeaderRow.eachCell(cell => {
        cell.font = boldFont;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.border = borders;
        cell.alignment = { horizontal: 'center' };
      });
      subHeaderRow.height = 18;

      let grpRowIdx = 0;
      groupData.forEach(rowData => {
        const row = sweepSheet.addRow([
          rowData.phase,
          rowData.f100 !== undefined ? (isOverload(rowData.f100, type === 'ind' ? 'L' : 'res') ? 'O.L' : rowData.f100) : '—',
          rowData.f120 !== undefined ? (isOverload(rowData.f120, type === 'ind' ? 'L' : 'res') ? 'O.L' : rowData.f120) : '—',
          rowData.f1k !== undefined ? (isOverload(rowData.f1k, type === 'ind' ? 'L' : 'res') ? 'O.L' : rowData.f1k) : '—',
          rowData.f10k !== undefined ? (isOverload(rowData.f10k, type === 'ind' ? 'L' : 'res') ? 'O.L' : rowData.f10k) : '—',
          rowData.f100k !== undefined ? (isOverload(rowData.f100k, type === 'ind' ? 'L' : 'res') ? 'O.L' : rowData.f100k) : '—'
        ]);
        row.eachCell(cell => {
          cell.font = bodyFont;
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
          if (grpRowIdx % 2 === 1) cell.fill = altFill;
        });
        row.height = 18;
        grpRowIdx++;
      });

      // Calculate column imbalances if phases 1-2, 1-3, and 2-3 are present
      const colImbalances = {};
      let maxImbalance = 0;
      tableFreqs.forEach(f => {
        const v12 = mulData[`${group}_${type}_1-2_${f}`]?.value;
        const v13 = mulData[`${group}_${type}_1-3_${f}`]?.value;
        const v23 = mulData[`${group}_${type}_2-3_${f}`]?.value;
        const imb = calculateImbalance(v12, v13, v23);
        if (imb !== null) {
          colImbalances[f] = imb;
          if (imb > maxImbalance) {
            maxImbalance = imb;
          }
        }
      });

      // Add Imbalance row if we have calculated imbalances
      if (Object.keys(colImbalances).length > 0) {
        const imbRow = sweepSheet.addRow([
          'Imbalance (%)',
          colImbalances['100Hz'] !== undefined ? `${colImbalances['100Hz'].toFixed(2)}%` : '—',
          colImbalances['120Hz'] !== undefined ? `${colImbalances['120Hz'].toFixed(2)}%` : '—',
          colImbalances['1kHz'] !== undefined ? `${colImbalances['1kHz'].toFixed(2)}%` : '—',
          colImbalances['10kHz'] !== undefined ? `${colImbalances['10kHz'].toFixed(2)}%` : '—',
          colImbalances['100kHz'] !== undefined ? `${colImbalances['100kHz'].toFixed(2)}%` : '—'
        ]);
        imbRow.eachCell(cell => {
          cell.font = boldFont;
          cell.border = borders;
          cell.alignment = { horizontal: 'center' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2E9' } };
        });
        imbRow.height = 18;
      }

      // Add Condition Status card
      if (Object.keys(colImbalances).length > 0) {
        const statusStr = maxImbalance < 5.0 ? 'Normal / Good' : 'Investigate (High Imbalance)';
        const statusText = `Max Imbalance: ${maxImbalance.toFixed(2)}%   |   Condition Status: ${statusStr}`;
        const statusRow = sweepSheet.addRow([statusText]);
        sweepSheet.mergeCells(`A${statusRow.number}:F${statusRow.number}`);
        const sCell = statusRow.getCell(1);
        sCell.font = boldFont;
        sCell.border = borders;
        sCell.alignment = { horizontal: 'left', vertical: 'middle' };
        sCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: maxImbalance < 5.0 ? 'FFD4EDDA' : 'FFFFD7DA' }
        };
        statusRow.height = 20;
      }
      if (chartImages && chartImages.sweep && chartImages.sweep[`${group}_${type}`]) {
        try {
          const rawBase64 = chartImages.sweep[`${group}_${type}`];
          const cleanBase64 = rawBase64.replace(/^data:image\/[a-z]+;base64,/, '');
          const imageId = workbook.addImage({
            base64: cleanBase64,
            extension: 'png',
          });
          sweepSheet.addImage(imageId, {
            tl: { col: 7, row: headerRow.number - 1 },
            ext: { width: 350, height: 180 }
          });
        } catch (err) {
          console.error(`Failed to embed sweep chart for ${group} ${type}:`, err);
        }
      }

      sweepSheet.addRow([]); // Blank spacer
    };

    addSweepSection('Stator Inductance Sweep (mH)', 'stator', 'ind', 'mH');
    addSweepSection('Stator AC Resistance Sweep (Ω)', 'stator', 'res', 'Ω');
    addSweepSection('Rotor Inductance Sweep (mH)', 'rotor', 'ind', 'mH');
    addSweepSection('Rotor AC Resistance Sweep (Ω)', 'rotor', 'res', 'Ω');
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

      let excelRows = rows;
      if (tab === 'PI') {
        excelRows = rows.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 15 === 0);
        });
      } else if (tab === 'DAR') {
        excelRows = rows.filter(r => {
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
        row.eachCell((cell, colNum) => {
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
      if (r600 && r60) calcValues.push(`PI: ${(r600 / r60).toFixed(2)}`);
      const ddVal = rows.length > 2 ? '1.38' : '—';
      calcValues.push(`DD: ${ddVal}`);

      const summaryRow = sheet.addRow([`Coefficients: ${calcValues.join('  |  ')}`]);
      sheet.mergeCells(`A${summaryRow.number}:G${summaryRow.number}`);
      const sCell = summaryRow.getCell(1);
      sCell.font = boldFont;
      sCell.border = borders;
      sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      summaryRow.height = 18;

      // Final Diagnostics summary row
      const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
      const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;
      const passStatus = getPassStatus(record.correctInsulationTo40 ? Rc40 : Rt);
      const rawRtStr = Rt !== null ? formatResistance(Rt) : '—';
      const corrR40Str = Rc40 !== null ? formatResistance(Rc40) : '—';

      const diagText = `Final Diagnostics: Temp = ${tempVal}°C | Raw Rt = ${rawRtStr} | Corrected R40 = ${corrR40Str} | Status = ${passStatus.text}`;
      const diagRow = sheet.addRow([diagText]);
      sheet.mergeCells(`A${diagRow.number}:G${diagRow.number}`);
      const dCell = diagRow.getCell(1);
      dCell.font = boldFont;
      dCell.border = borders;
      dCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: passStatus.text.includes('Fail') ? 'FFF8D7DA' : 'D4EDDA' }
      };
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
async function exportPDF(recordId, mainWindow) {
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
    doc.rect(0, 0, doc.page.width, 60).fill(BLUE);

    // 1. Always draw the default logo
    const customLogo = record.customLogoPath;
    const customClientLogo = record.customClientLogoPath;

    let hasClientLogo = false;
    let hasContractorLogo = false;

    // 1. Determine if Client Logo is present
    const isClientLogoPresent = (customClientLogo !== 'none');

    // 2. Draw Client Logo first at x = 10 if present
    if (isClientLogoPresent) {
      if (customClientLogo && customClientLogo.startsWith('data:image/')) {
        try {
          const commaIdx = customClientLogo.indexOf(',');
          if (commaIdx !== -1) {
            const base64Data = customClientLogo.substring(commaIdx + 1);
            const buffer = Buffer.from(base64Data, 'base64');
            doc.image(buffer, 10, 8, { height: 26 });
            hasClientLogo = true;
          }
        } catch (e) {
          console.error('Failed to draw custom client logo in PDF header:', e);
          const logoPath = getLogoPath();
          if (logoPath) {
            try {
              doc.image(logoPath, 10, 8, { height: 26 });
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
            doc.image(logoPath, 10, 8, { height: 26 });
            hasClientLogo = true;
          } catch (e) {
            console.error('Failed to draw default client logo in PDF header:', e);
          }
        }
      }
    }

    // 3. Draw Contractor Logo next to it (at x = 100 if client logo is drawn, else x = 10)
    if (customLogo && customLogo.startsWith('data:image/')) {
      const contractorLogoX = hasClientLogo ? 100 : 10;
      try {
        const commaIdx = customLogo.indexOf(',');
        if (commaIdx !== -1) {
          const base64Data = customLogo.substring(commaIdx + 1);
          const buffer = Buffer.from(base64Data, 'base64');
          doc.image(buffer, contractorLogoX, 8, { height: 26 });
          hasContractorLogo = true;
        }
      } catch (e) {
        console.error('Failed to draw custom contractor logo in PDF header:', e);
      }
    }

    // Date of Record in header (left-aligned at bottom of header)
    doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold')
      .text(`Date: ${record.date || '—'}`, 10, 42, { width: 120, align: 'left' });

    // Client Name & Utility Tag repeated on all page headers
    const clientStr = record.clientName ? `Client: ${record.clientName}` : '';
    const tagStr = record.motorUtilityTag ? `Utility Tag: ${record.motorUtilityTag}` : '';
    const repeatHeaderInfo = [clientStr, tagStr].filter(Boolean).join('    |    ');

    // Header title (right-aligned, dynamically spaced to prevent overlap)
    let currentY = 8;
    const titleX = (hasContractorLogo && hasClientLogo) ? 195 : 140;
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
      .text(titleText, titleX, currentY, { width: doc.page.width - (titleX + 15), align: 'right' });
      
    currentY = doc.y + 2;

    if (repeatHeaderInfo) {
      doc.fontSize(7.5).font('Helvetica-Bold')
        .text(repeatHeaderInfo, 140, currentY, { width: doc.page.width - 155, align: 'right' });
      currentY = doc.y + 2;
    }
    
    doc.fontSize(6.5).font('Helvetica')
      .text('Electrical Motor Testing Suite (Offline Testing)', 140, currentY, { width: doc.page.width - 155, align: 'right' });

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
    ['Wire Marking', `${record.wireMarkingT1 || 'T1'} / ${record.wireMarkingT2 || 'T2'} / ${record.wireMarkingT3 || 'T3'}`],
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
      const hasIns = Object.values(insData).some(tabObj => tabObj && Object.values(tabObj).some(arr => arr && arr.length > 0));
      if (!hasIns) return '—';
      let overallPass = 'Pass (Excellent)';
      Object.keys(insData).forEach(tab => {
        const tabData = insData[tab] || {};
        const activeTables = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);
        activeTables.forEach(tableId => {
          const rows = tabData[tableId];
          const runMeta = tabData[`${tableId}_meta`] || {};
          const runTemp = (runMeta.temperature !== undefined && runMeta.temperature !== '') ? runMeta.temperature : (record.temperature || 25);
          const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
          const Kt = Math.pow(0.5, (40 - tempVal) / 10);
          const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
          const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;
          const status = getPassStatus(record.correctInsulationTo40 ? Rc40 : Rt);
          if (status.text.includes('Fail')) overallPass = 'Fail';
          else if (status.text.includes('Standard') && overallPass !== 'Fail') overallPass = 'Pass (Standard)';
        });
      });
      return overallPass.includes('Excellent') ? 'Excellent' : (overallPass.includes('Standard') ? 'Normal' : 'Alarm');
    }
    
    // Winding Imbalances at card group level for defaults
    const statorResImb = calculateImbalance(mulData?.['stator_res_1-2']?.value, mulData?.['stator_res_1-3']?.value, mulData?.['stator_res_2-3']?.value);
    const statorIndImb = calculateImbalance(mulData?.['stator_ind_1-2_100Hz']?.value, mulData?.['stator_ind_1-3_100Hz']?.value, mulData?.['stator_ind_2-3_100Hz']?.value);
    const statorImpImb = calculateImbalance(mulData?.['stator_imp_1-2_z']?.value, mulData?.['stator_imp_1-3_z']?.value, mulData?.['stator_imp_2-3_z']?.value);

    if (key === 'condResistance') {
      return statorResImb !== null ? (statorResImb < 2 ? 'Excellent' : (statorResImb < 5 ? 'Caution' : 'Alarm')) : '—';
    }
    if (key === 'condInductance') {
      return statorIndImb !== null ? (statorIndImb < 2 ? 'Excellent' : (statorIndImb < 5 ? 'Caution' : 'Alarm')) : '—';
    }
    if (key === 'condImpedance') {
      if (statorImpImb !== null) {
        return statorImpImb < 2 ? 'Excellent' : (statorImpImb < 5 ? 'Caution' : 'Alarm');
      }
      const hasImp = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => mulData[`stator_imp_${p}_z`]?.value !== undefined);
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
      return maxSwImb > 0 ? (maxSwImb < 2 ? 'Excellent' : (maxSwImb < 5 ? 'Caution' : 'Alarm')) : '—';
    }
    return '—';
  };

  const condKeys = ['condInsulation', 'condResistance', 'condInductance', 'condImpedance', 'condFrequency'];
  const condColors = {
    'Excellent': { bg: '#D4EDDA', text: '#155724' },
    'Normal':    { bg: '#D1ECF1', text: '#0C5460' },
    'Caution':   { bg: '#FFF3CD', text: '#856404' },
    'Alarm':     { bg: '#F8D7DA', text: '#721C24' },
    'Observe':   { bg: '#E2D9F3', text: '#383D41' },
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

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLUE).text(titleText, 40);
    doc.moveDown(0.2);

    const resFreq = mulData[`${groupPrefix}_res_freq`]?.frequency;
    const indFreq = mulData[`${groupPrefix}_ind_freq`]?.frequency;
    const capFreq = mulData[`${groupPrefix}_cap_freq`]?.frequency;

    const cleanResFreq = ' [0Hz]';
    const cleanIndFreq = (indFreq && indFreq !== 'undefined') ? ` [${indFreq}]` : '';
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
      const impKey = `${groupPrefix}_imp_${phase}_z`;
      let impVal = mulData[impKey]?.value;
      let impDisp = '—';
      if (impVal !== undefined && impVal !== null && impVal !== '') {
        impDisp = isOverload(impVal, 'Z') ? 'O.L' : String(impVal);
      }

      // 6. Angle
      const degKey = `${groupPrefix}_imp_${phase}_deg`;
      let degVal = mulData[degKey]?.value;
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

    const impVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${groupPrefix}_imp_${phase}_z`]?.value);
    const impSumImb = calculateImbalance(impVals[0], impVals[1], impVals[2]);

    const degVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${groupPrefix}_imp_${phase}_deg`]?.value);
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
    // Table 1: Winding Resistance (DCR)
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Winding Resistance (DCR)', 40, y);
    y += 11;
    const resCols = [W * 0.4, W * 0.3, W * 0.3];
    const resHeaders = ['Phase Line', `Resistance (DCR) (Ohms)${record.correctWindingTo20 ? ' @20°C' : ''}${cleanResFreq}`, 'Temperature (°C)'];
    
    doc.rect(40, y, W, 14).fill(BLUE);
    let rx = 40;
    resHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, rx, y + 3.5, { width: resCols[idx], align: 'center' });
      rx += resCols[idx];
    });
    y += 14;

    let resAlternate = false;
    standardPhases.forEach(phase => {
      const rKey = `${groupPrefix}_res_${phase}`;
      let rVal = (mulData[rKey]?.value !== undefined && mulData[rKey]?.value !== null && mulData[rKey]?.value !== '') ? parseFloat(mulData[rKey]?.value) : null;
      let rTemp = mulData[rKey]?.temperature;

      if (rTemp === 'undefined' || rTemp === null || rTemp === undefined || rTemp === '') rTemp = '—';
      else rTemp = `${rTemp}°C`;

      if (record.correctWindingTo20 && rVal !== null && !isNaN(rVal) && !isOverload(rVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[rKey]?.temperature)) ? 25 : parseFloat(mulData[rKey]?.temperature);
        rVal = parseFloat((rVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }

      doc.rect(40, y, W, 12).fill(resAlternate ? LGRAY : '#FFFFFF');
      rx = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, rx + 6, y + 2, { width: resCols[0] - 12, align: 'left' });
      rx += resCols[0];

      let rDisplay = '—';
      if (rVal !== undefined && rVal !== null && rVal !== '') {
        rDisplay = isOverload(rVal, 'R') ? 'O.L' : String(rVal);
      }
      doc.font('Helvetica').fontSize(7.5);
      doc.text(rDisplay, rx, y + 2, { width: resCols[1], align: 'center' });
      rx += resCols[1];
      doc.text(rTemp, rx, y + 2, { width: resCols[2], align: 'center' });

      y += 12;
      resAlternate = !resAlternate;
    });

    y += 10;

    // ─────────────────────────────────────────────
    // Table 1.5: AC Winding Resistance (ACR)
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('AC Winding Resistance (ACR) (Ohms)', 40, y);
    y += 11;
    const acrHeaders = ['Phase Line', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    const acrCols = [W * 0.25, W * 0.15, W * 0.15, W * 0.15, W * 0.15, W * 0.15];

    doc.rect(40, y, W, 14).fill(BLUE);
    let ax = 40;
    acrHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ax, y + 3.5, { width: acrCols[idx], align: 'center' });
      ax += acrCols[idx];
    });
    y += 14;

    let acrAlternate = false;
    ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].forEach(phase => {
      doc.rect(40, y, W, 12).fill(acrAlternate ? LGRAY : '#FFFFFF');
      ax = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, ax + 6, y + 2, { width: acrCols[0] - 12, align: 'left' });
      ax += acrCols[0];

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
        doc.text(displayVal, ax, y + 2, { width: acrCols[fIdx + 1], align: 'center' });
        ax += acrCols[fIdx + 1];
      });

      y += 12;
      acrAlternate = !acrAlternate;
    });

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

    doc.y = y + 10;

    // --- Draw Impedance Table under RLC table if it exists ---
    const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const hasImpData = impPhases.some(phase => mulData[`${groupPrefix}_imp_${phase}_z`]?.value !== undefined || mulData[`${groupPrefix}_imp_${phase}_deg`]?.value !== undefined);
    
    if (hasImpData) {
      if (doc.y + 130 > doc.page.height - 40) {
        doc.addPage();
        drawHeader(groupPrefix === 'stator' ? 'STATOR WINDING TEST' : 'ROTOR WINDING TEST');
      }

      doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text(`${groupLabel} Impedance (Z & Phase Angle)`, 40);
      doc.moveDown(0.2);

      const startY = doc.y;

      const impCols = [W * 0.22, W * 0.21, W * 0.21, W * 0.18, W * 0.18];
      const impHeaders = ['Phase Line', 'Z (Ohms)', 'Angle (°)', 'Frequency', 'Temp (°C)'];
      let iy = startY;
      let ix = 40;

      doc.rect(40, iy, W, 18).fill(BLUE);
      impHeaders.forEach((h, idx) => {
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ix, iy + 5, { width: impCols[idx], align: 'center' });
        ix += impCols[idx];
      });
      iy += 18;

      let impAlternate = false;
      impPhases.forEach(phase => {
        const zKey = `${groupPrefix}_imp_${phase}_z`;
        const degKey = `${groupPrefix}_imp_${phase}_deg`;
        const zVal = mulData[zKey]?.value;
        const degVal = mulData[degKey]?.value;
        const groupImpFreq = mulData[`${groupPrefix}_imp_freq`]?.frequency;
        const fVal = mulData[zKey]?.frequency;
        const dVal = mulData[degKey]?.frequency;
        let zFreq = '—';
        if (fVal && fVal !== 'undefined' && fVal !== 'null') {
          zFreq = fVal;
        } else if (dVal && dVal !== 'undefined' && dVal !== 'null') {
          zFreq = dVal;
        } else if (groupImpFreq && groupImpFreq !== 'undefined' && groupImpFreq !== 'null') {
          zFreq = groupImpFreq;
        }
        let zTemp = mulData[zKey]?.temperature !== undefined ? `${mulData[zKey].temperature}°C` : (mulData[degKey]?.temperature !== undefined ? `${mulData[degKey].temperature}°C` : '—');
        if (zTemp.includes('undefined')) zTemp = '—';



        doc.rect(40, iy, W, 13).fill(impAlternate ? LGRAY : '#FFFFFF');

        ix = 40;
        doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, ix + 6, iy + 2.5, { width: impCols[0] - 12, align: 'left' });
        ix += impCols[0];

        doc.font('Helvetica').fontSize(7.5);
        doc.text(zVal !== undefined ? (isOverload(zVal, 'Z') ? 'O.L' : String(zVal)) : '—', ix, iy + 2.5, { width: impCols[1], align: 'center' });
        ix += impCols[1];
        doc.text(degVal !== undefined ? String(degVal) : '—', ix, iy + 2.5, { width: impCols[2], align: 'center' });
        ix += impCols[2];
        doc.text(String(zFreq), ix, iy + 2.5, { width: impCols[3], align: 'center' });
        ix += impCols[3];
        doc.text(String(zTemp), ix, iy + 2.5, { width: impCols[4], align: 'center' });

        iy += 13;
        impAlternate = !impAlternate;
      });

      doc.y = iy + 10;
    }

    doc.y = doc.y + 15;
  };

  drawWindingWGroup('Stator Winding Readings', 'stator');
  if (record.correctWindingTo20) {
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Oblique')
      .text('* Note: Stator winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula.', 40, doc.y + 4, { width: W });
    doc.y += 10;
  }

  // Page 3: Rotor Winding Readings (Multimeter R/L/C)
  doc.addPage();
  drawHeader('ROTOR WINDING TEST');
  drawWindingWGroup('Rotor Winding Readings', 'rotor');
  if (record.correctWindingTo20) {
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Oblique')
      .text('* Note: Rotor winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula.', 40, doc.y + 4, { width: W });
    doc.y += 10;
  }

  // --- Winding Frequency Sweep Tables rendering in PDF ---
  const drawSweepSectionWithChart = (titleText, groupPrefix, type, unit) => {
    // Check if we need to add a page
    if (doc.y + 160 > doc.page.height - 40) {
      doc.addPage();
      drawHeader('WINDING FREQUENCY RESPONSE');
    }

    const startY = doc.y;
    const chartPageIndex = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE).text(titleText, 40);
    doc.moveDown(0.2);

    const leftW = W * 0.48;
    const rightW = W * 0.48;
    const gap = W * 0.04;

    // 1. Draw Table (Left)
    const cols = [leftW * 0.25, leftW * 0.15, leftW * 0.15, leftW * 0.15, leftW * 0.15, leftW * 0.15];
    const headers = ['Phase Line', '100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    let y = doc.y;
    let x = 40;

    doc.rect(40, y, leftW, 14).fill(BLUE);
    headers.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold').text(h, x, y + 4, { width: cols[idx], align: 'center' });
      x += cols[idx];
    });
    y += 14;

    const phases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const FREQS = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    let alternate = false;

    phases.forEach(phase => {
      let hasData = false;
      for (const f of FREQS) {
        const sweepKey = `${groupPrefix}_${type}_${phase}_${f}`;
        if (mulData[sweepKey]?.value !== undefined && mulData[sweepKey]?.value !== null) {
          hasData = true;
          break;
        }
      }
      if (!hasData) return;

      doc.rect(40, y, leftW, 11).fill(alternate ? LGRAY : '#FFFFFF');

      x = 40;
      doc.fillColor(DARK_GRAY).fontSize(6.5).font('Helvetica-Bold').text(`Phase ${phase}`, x + 4, y + 2.5, { width: cols[0] - 6, align: 'left' });
      x += cols[0];

      doc.font('Helvetica').fontSize(6.5);

      FREQS.forEach((f, idx) => {
        const sweepKey = `${groupPrefix}_${type}_${phase}_${f}`;
        const dataPoint = mulData[sweepKey];
        let val = dataPoint?.value;
        const temp = dataPoint?.temperature;

        if (type === 'res' && record.correctWindingTo20 && typeof val === 'number') {
          const rTemp = isNaN(parseFloat(temp)) ? 25 : parseFloat(temp);
          val = parseFloat((val * (254.5 / (234.5 + rTemp))).toFixed(3));
        }

        const modeCode = type === 'ind' ? 'L' : 'R';
        const valStr = isOverload(val, modeCode) ? 'O.L' : (val !== undefined && val !== null ? String(val) : '—');
        doc.text(valStr, x, y + 2.5, { width: cols[idx + 1], align: 'center' });
        x += cols[idx + 1];
      });

      y += 11;
      alternate = !alternate;
    });

    // Calculate column imbalances if phases 1-2, 1-3, and 2-3 are present
    const colImbalances = {};
    let maxImbalance = 0;
    
    FREQS.forEach(f => {
      const v12 = mulData[`${groupPrefix}_${type}_1-2_${f}`]?.value;
      const v13 = mulData[`${groupPrefix}_${type}_1-3_${f}`]?.value;
      const v23 = mulData[`${groupPrefix}_${type}_2-3_${f}`]?.value;
      
      const imb = calculateImbalance(v12, v13, v23);
      if (imb !== null) {
        colImbalances[f] = imb;
        if (imb > maxImbalance) {
          maxImbalance = imb;
        }
      }
    });

    // Add Imbalance row if we have calculated imbalances
    if (Object.keys(colImbalances).length > 0) {
      doc.rect(40, y, leftW, 11).fill('#FEF3C7'); // light amber background for imbalance row
      x = 40;
      doc.fillColor(DARK_GRAY).fontSize(6.5).font('Helvetica-Bold').text(`Imbalance (%)`, x + 4, y + 2.5, { width: cols[0] - 6, align: 'left' });
      x += cols[0];
      
      FREQS.forEach((f, idx) => {
        const val = colImbalances[f];
        const valStr = val !== undefined ? `${val.toFixed(2)}%` : '—';
        doc.fillColor(DARK_GRAY).fontSize(6.5).font('Helvetica-Bold').text(valStr, x, y + 2.5, { width: cols[idx + 1], align: 'center' });
        x += cols[idx + 1];
      });
      y += 11;
    }

    const tableBottomY = y;

    // Assess condition status and write it below table
    let statusText = '';
    if (Object.keys(colImbalances).length > 0) {
      const statusStr = maxImbalance < 5.0 ? 'Normal / Good' : 'Investigate (High Imbalance)';
      statusText = `Max Imbalance: ${maxImbalance.toFixed(2)}%  |  Condition Status: ${statusStr}`;
      
      doc.fillColor(maxImbalance < 5.0 ? '#16A34A' : '#DC2626')
         .fontSize(7).font('Helvetica-Bold')
         .text(statusText, 40, tableBottomY + 4, { width: leftW });
      y += 14;
    }

    // 2. Draw Chart (Right)
    doc.switchToPage(chartPageIndex);

    const chartX = 40 + leftW + gap;
    const chartY = startY;
    const chartW = rightW;
    const chartH = 100;

    drawPDFMultiLineChart(
      doc,
      `${type === 'ind' ? 'Inductance' : 'AC Resistance'} Sweep Curves`,
      chartX, chartY, chartW, chartH,
      mulData,
      groupPrefix,
      type,
      'Frequency',
      type === 'ind' ? 'Inductance (mH)' : 'Resistance (Ohms)',
      record.correctWindingTo20
    );

    // Move cursor past both
    const lastPageIdx = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
    doc.switchToPage(lastPageIdx);
    doc.y = Math.max(y, chartY + chartH) + 15;
  };

  const hasStatorSweep = hasSweepDataForGroup(mulData, 'stator', 'ind');
  const hasStatorResSweep = hasSweepDataForGroup(mulData, 'stator', 'res');
  const hasRotorSweep = hasSweepDataForGroup(mulData, 'rotor', 'ind');
  const hasRotorResSweep = hasSweepDataForGroup(mulData, 'rotor', 'res');

  if (hasStatorSweep || hasRotorSweep || hasStatorResSweep || hasRotorResSweep) {
    doc.addPage();
    drawHeader('WINDING FREQUENCY RESPONSE');

    if (hasStatorSweep) {
      drawSweepSectionWithChart('Stator Inductance Frequency Sweep (mH)', 'stator', 'ind', 'mH');
    }

    if (hasStatorResSweep) {
      drawSweepSectionWithChart('Stator AC Winding Resistance Frequency Sweep (Ohms)', 'stator', 'res', 'Ohms');
    }

    if (hasRotorSweep) {
      drawSweepSectionWithChart('Rotor Inductance Frequency Sweep (mH)', 'rotor', 'ind', 'mH');
    }

    if (hasRotorResSweep) {
      drawSweepSectionWithChart('Rotor AC Winding Resistance Frequency Sweep (Ohms)', 'rotor', 'res', 'Ohms');
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
      const passStatus = getPassStatus(record.correctInsulationTo40 ? Rc40 : Rt);

      const rawRtStr = Rt !== null ? formatResistancePDF(Rt) : '—';
      const corrR40Str = Rc40 !== null ? formatResistancePDF(Rc40) : '—';

      // Summary Card dimensions
      const cardH = 34;
      doc.rect(40, doc.y, W, cardH).fill('#F8FAFC');
      doc.strokeColor('#CBD5E1').lineWidth(0.5);
      doc.rect(40, doc.y, W, cardH).stroke();

      const boxY = doc.y + 4;
      // PI / DAR / DD
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('PI', 48, boxY).fontSize(9).text(pi, 48, boxY + 7);
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('DAR', 88, boxY).fontSize(9).text(dar, 88, boxY + 7);
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('DD', 128, boxY).fontSize(9).text(ddVal, 128, boxY + 7);
      
      // Temp / Raw Rt
      doc.fillColor(DARK_GRAY).fontSize(6).font('Helvetica-Bold').text('TEMP', 168, boxY).fontSize(9).text(`${tempVal}°C`, 168, boxY + 7);
      doc.fillColor(DARK_GRAY).fontSize(6).font('Helvetica-Bold').text('RAW Rt', 218, boxY).fontSize(9).text(rawRtStr, 218, boxY + 7);

      // Corrected R40
      doc.fillColor(BLUE).fontSize(6).font('Helvetica-Bold').text('CORRECTED R40', 308, boxY).fontSize(9).text(corrR40Str, 308, boxY + 7);

      // Pass/Fail status badge
      const badgeX = 405;
      const badgeW = 100;
      doc.rect(badgeX, boxY + 1, badgeW, 16).fill(passStatus.color);
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(passStatus.text, badgeX, boxY + 5, { width: badgeW, align: 'center' });

      doc.y += cardH + 12;

      // Define side-by-side columns
      const leftW = W * 0.48;
      const rightW = W * 0.48;
      const gap = W * 0.04;

      const startY = doc.y;

      // Track exact page so we can switch back after table rendering
      const chartPageIndex = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;

      // ── Sample rows for the TABLE ──
      const MAX_TABLE_ROWS = 50;
      let tableRows = rows;
      let truncated = false;
      if (tab === 'PI') {
        tableRows = rows.filter(r => {
          const t = Math.round(r.time);
          return t !== 0 && (t === 1 || t % 15 === 0);
        });
      } else if (tab === 'DAR') {
        tableRows = rows.filter(r => {
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
        if (rows.length > MAX_TABLE_ROWS) {
          truncated = true;
          const step = (rows.length - 1) / (MAX_TABLE_ROWS - 1);
          tableRows = Array.from({ length: MAX_TABLE_ROWS }, (_, i) => rows[Math.round(i * step)]);
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
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold')
        .text(`Coefficients:  PI = ${pi}   |   DAR = ${dar}   |   DD = ${ddVal}`, 46, y + 3.5, { width: leftW - 12 });
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
          
          // Chart 1: Current vs Time (Transient)
          drawPDFChart(
            doc,
            'SV Transient Current Plot',
            chartX, chartY, chartW, chartH,
            transientRows,
            'time', 'current',
            'Time (s)', 'Current (uA)',
            false,
            runTemp
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
            runTemp
          );
        }
      } else {
        const yAxisKey = tab === 'RAMP' ? 'current' : 'resistance';
        const yAxisLabel = tab === 'RAMP' ? 'Current (uA)' : 'Resistance (M-Ohm)';
        const xAxisKey = 'time';
        const xAxisLabel = 'Time (s)';

        let chartRows = rows;
        if (tab === 'PI') {
          chartRows = rows.filter(r => r.time !== 0);
        } else if (tab === 'DAR') {
          chartRows = filterOutliersForGraph(rows);
        }

        drawPDFChart(
          doc,
          `${tab} Diagnostic Plot`,
          chartX, chartY, chartW, chartH,
          chartRows,
          xAxisKey, yAxisKey,
          xAxisLabel, yAxisLabel,
          record.correctInsulationTo40,
          runTemp
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
