// src/main/reports.js — Excel & PDF Export
const path = require('path');
const { app, dialog } = require('electron');
const fs = require('fs');
const db = require('./database');

// Helper to sanitize filename
function sanitizeFilename(name) {
  return (name || 'Report').replace(/[^a-z0-9]/gi, '_').toLowerCase();
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

// Helper to check pass/fail status
function getPassStatus(Rc40) {
  if (Rc40 === null || Rc40 === undefined) return { text: '—', color: '#64748b' };
  if (Rc40 >= 100) return { text: 'Pass (Excellent)', color: '#16a34a' };
  if (Rc40 >= 5) return { text: 'Pass (Standard)', color: '#2563eb' };
  return { text: 'Fail (Low Insulation)', color: '#dc2626' };
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

  const marginL = 35;
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
      doc.fillColor('#A16207').fontSize(5.5).font('Helvetica-Bold')
        .text('Capacitive Regime', plotX + 4, y0 + belowH - 8, { width: plotW - 8, align: 'left' });
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
      .text(Math.round(yVal).toLocaleString(), startX, py - 2.5, { width: marginL - 4, align: 'right' });
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
    legendX += 45;
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

  const marginL = 35;
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
  const minY = 0;
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
    doc.fillColor('#64748B').fontSize(5.5).font('Helvetica')
      .text(Math.round(yVal).toLocaleString(), startX, py - 2.5, { width: marginL - 4, align: 'right' });
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
      app.getPath('documents'),
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

  infoSheet.addRow([]);

  addSectionHeader('Offline Test Configurations');
  addKeyValue('Testing Location', record.testingLocation);
  addKeyValue('Wire Marking T1', record.wireMarkingT1);
  addKeyValue('Wire Marking T2', record.wireMarkingT2);
  addKeyValue('Wire Marking T3', record.wireMarkingT3);
  addKeyValue('PI/DAR Test Voltage', record.testVoltagePiDar);
  addKeyValue('STEP Test Voltage', record.testVoltageStep);
  addKeyValue('RAMP Test Voltage', record.testVoltageRamp);

  // ── Sheet 2: Multimeter Winding Test ──
  const windingSheet = workbook.addWorksheet('Winding Test (RLC)');
  windingSheet.columns = [
    { header: 'Winding Group', key: 'group', width: 16 },
    { header: 'Parameter', key: 'parameter', width: 18 },
    { header: 'Phase Line', key: 'phase', width: 22 },
    { header: 'Value', key: 'value', width: 14 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Frequency', key: 'freq', width: 14 },
    { header: 'Temperature (°C)', key: 'temp', width: 18 }
  ];

  const wHRow = windingSheet.getRow(1);
  wHRow.eachCell(cell => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = borders;
    cell.alignment = { horizontal: 'center' };
  });
  wHRow.height = 22;

  const windingTypes = ['stator', 'rotor'];
  let rowCounter = 0;

  windingTypes.forEach(group => {
    const groupName = group.charAt(0).toUpperCase() + group.slice(1);

    // Resistance (Ω)
    const RESISTANCE_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    RESISTANCE_KEYS.forEach(key => {
      const fKey = `${group}_res_${key}`;
      const data = mulData[fKey];
      if (data) {
        let displayVal = data.value;
        const isCorrected = record.correctWindingTo20 && typeof data.temperature === 'number';
        if (isCorrected && typeof displayVal === 'number' && !isOverload(displayVal, 'R')) {
          const tempVal = isNaN(parseFloat(data.temperature)) ? 25 : parseFloat(data.temperature);
          displayVal = parseFloat((displayVal * (254.5 / (234.5 + tempVal))).toFixed(3));
        }
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Resistance',
          phase: `Phase ${key}`,
          value: isOverload(displayVal, 'R') ? 'O.L' : (displayVal !== undefined ? displayVal : '—'),
          unit: 'Ω',
          freq: data.frequency || '—',
          temp: data.temperature !== undefined ? data.temperature : '—'
        });
        row.eachCell(cell => { cell.font = bodyFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
        if (rowCounter % 2 === 1) row.eachCell(cell => { cell.fill = altFill; });
        rowCounter++;
      }
    });

    // Inductance (mH)
    const INDUCTANCE_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    INDUCTANCE_KEYS.forEach(key => {
      const fKey = `${group}_ind_${key}`;
      const data = mulData[fKey];
      if (data) {
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Inductance',
          phase: `Phase ${key}`,
          value: isOverload(data.value, 'L') ? 'O.L' : (data.value !== undefined ? data.value : '—'),
          unit: 'mH',
          freq: data.frequency || '—',
          temp: data.temperature !== undefined ? data.temperature : '—'
        });
        row.eachCell(cell => { cell.font = bodyFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
        if (rowCounter % 2 === 1) row.eachCell(cell => { cell.fill = altFill; });
        rowCounter++;
      }
    });

    // Capacitance (nF)
    const CAPACITANCE_KEYS = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];
    CAPACITANCE_KEYS.forEach(key => {
      const fKey = `${group}_cap_${key}`;
      const data = mulData[fKey];
      if (data) {
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Capacitance',
          phase: `Phase ${key}`,
          value: isOverload(data.value, 'C') ? 'O.L' : (data.value !== undefined ? data.value : '—'),
          unit: 'nF',
          freq: data.frequency || '—',
          temp: data.temperature !== undefined ? data.temperature : '—'
        });
        row.eachCell(cell => { cell.font = bodyFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
        if (rowCounter % 2 === 1) row.eachCell(cell => { cell.fill = altFill; });
        rowCounter++;
      }
    });

    // Impedance Z & Phase Angle Degree (Ω, °)
    const IMPEDANCE_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    IMPEDANCE_KEYS.forEach(key => {
      const zData = mulData[`${group}_imp_${key}_z`];
      const degData = mulData[`${group}_imp_${key}_deg`];
      
      if (zData) {
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Impedance Z',
          phase: `Phase ${key}`,
          value: isOverload(zData.value, 'Z') ? 'O.L' : (zData.value !== undefined ? zData.value : '—'),
          unit: 'Ω',
          freq: zData.frequency || '—',
          temp: zData.temperature !== undefined ? zData.temperature : '—'
        });
        row.eachCell(cell => { cell.font = bodyFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
        if (rowCounter % 2 === 1) row.eachCell(cell => { cell.fill = altFill; });
        rowCounter++;
      }

      if (degData) {
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Phase Angle',
          phase: `Phase ${key}`,
          value: degData.value !== undefined ? degData.value : '—',
          unit: '°',
          freq: degData.frequency || '—',
          temp: degData.temperature !== undefined ? degData.temperature : '—'
        });
        row.eachCell(cell => { cell.font = bodyFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
        if (rowCounter % 2 === 1) row.eachCell(cell => { cell.fill = altFill; });
        rowCounter++;
      }
    });

    // Phase Imbalance Calculations
    const r12 = mulData[`${group}_res_1-2`]?.value;
    const r13 = mulData[`${group}_res_1-3`]?.value;
    const r23 = mulData[`${group}_res_2-3`]?.value;
    const rImb = calculateImbalance(r12, r13, r23);

    const i12 = mulData[`${group}_ind_1-2`]?.value;
    const i13 = mulData[`${group}_ind_1-3`]?.value;
    const i23 = mulData[`${group}_ind_2-3`]?.value;
    const iImb = calculateImbalance(i12, i13, i23);

    if (rImb !== null) {
      const row = windingSheet.addRow({
        group: groupName,
        parameter: 'Resistance Imbalance',
        phase: 'Phases 1-2 / 1-3 / 2-3',
        value: parseFloat(rImb.toFixed(2)),
        unit: '%',
        freq: '—',
        temp: '—'
      });
      row.eachCell(cell => { cell.font = boldFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } }; });
      rowCounter++;
    }

    if (iImb !== null) {
      const row = windingSheet.addRow({
        group: groupName,
        parameter: 'Inductance Imbalance',
        phase: 'Phases 1-2 / 1-3 / 2-3',
        value: parseFloat(iImb.toFixed(2)),
        unit: '%',
        freq: '—',
        temp: '—'
      });
      row.eachCell(cell => { cell.font = boldFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } }; });
      rowCounter++;
    }
  });

  windingSheet.addRow([]);
  const windingFootnoteText = record.correctWindingTo20
    ? `* Note: The winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula (Baseline 20°C correction is ACTIVE).`
    : `* Note: The winding resistance measurements shown above are raw/uncorrected values (Baseline 20°C correction is INACTIVE).`;
  const windingFootnoteRow = windingSheet.addRow([windingFootnoteText]);
  windingSheet.mergeCells(`A${windingFootnoteRow.number}:G${windingFootnoteRow.number}`);
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
      if (chartImages && chartImages.sweep && chartImages.sweep[`${group}_${type}`]) {
        try {
          const imageId = workbook.addImage({
            base64: chartImages.sweep[`${group}_${type}`],
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

    const sheet = workbook.addWorksheet(`Insulation - ${tab}`);
    sheet.columns = [
      { header: 'Test Table', key: 'table', width: 22 },
      { header: 'Time (s)', key: 'time', width: 12 },
      { header: 'Voltage (V)', key: 'voltage', width: 14 },
      { header: 'Actual V (V)', key: 'actualVoltage', width: 14 },
      { header: 'Current (uA)', key: 'current', width: 14 },
      { header: 'Resistance (MΩ)', key: 'resistance', width: 18 }
    ];

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
      sheet.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
      const tCell = titleRow.getCell(1);
      tCell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
      tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      tCell.border = borders;
      titleRow.height = 20;

      rows.forEach(r => {
        let displayRes = r.resistance;
        if (record.correctInsulationTo40 && typeof displayRes === 'number') {
          displayRes = Math.round(displayRes * Kt);
        }

        const row = sheet.addRow({
          table: '',
          time: r.time,
          voltage: r.voltage,
          actualVoltage: r.actualVoltage,
          current: r.current,
          resistance: displayRes
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
      sheet.mergeCells(`A${summaryRow.number}:F${summaryRow.number}`);
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
      sheet.mergeCells(`A${diagRow.number}:F${diagRow.number}`);
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
          const imageId = workbook.addImage({
            base64: chartImages.insulation[`${tab}_${tableId}`],
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

  const getNominalVoltage = (tab) => {
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
  };

  const getSVNominalVoltages = () => {
    const tabData = insData?.['SV'] || {};
    const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
    if (activeTableKeys.length === 0) return null;
    
    const voltages = new Set();
    activeTableKeys.forEach(tableId => {
      const rows = tabData[tableId];
      rows.forEach(r => {
        if (r.voltage !== undefined && r.voltage !== null && r.voltage !== '') {
          voltages.add(`${r.voltage}V`);
        }
      });
    });
    return voltages.size > 0 ? Array.from(voltages).join(' / ') : null;
  };

  const getRampNominalVoltages = () => {
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
  };

  const piVolts = getNominalVoltage('PI') || record.testVoltagePiDar || '—';
  const darVolts = getNominalVoltage('DAR') || record.testVoltagePiDar || '—';
  const stepVolts = getSVNominalVoltages() || record.testVoltageStep || '—';
  const rampVolts = getRampNominalVoltages() || record.testVoltageRamp || '—';

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF Report',
    defaultPath: path.join(
      app.getPath('documents'),
      `TestReport_${sanitizeFilename(record.clientName || 'Client')}_${sanitizeFilename(record.motorUtilityTag || 'Motor')}.pdf`
    ),
    filters: [{ name: 'PDF File', extensions: ['pdf'] }],
  });
  if (!filePath) return { success: false, reason: 'cancelled' };

  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
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
    
    // Header title
    doc.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold')
      .text(titleText, 40, 10, { width: W, align: 'center' });
      
    // Client Name & Utility Tag repeated on all page headers
    const clientStr = record.clientName ? `Client: ${record.clientName}` : '';
    const tagStr = record.motorUtilityTag ? `Utility Tag: ${record.motorUtilityTag}` : '';
    const repeatHeaderInfo = [clientStr, tagStr].filter(Boolean).join('    |    ');
    
    if (repeatHeaderInfo) {
      doc.fontSize(8).font('Helvetica-Bold')
        .text(repeatHeaderInfo, 40, 26, { width: W, align: 'center' });
    }
    
    doc.fontSize(7.5).font('Helvetica')
      .text('Electrical Motor Testing Suite (Offline Testing)', 40, 38, { width: W, align: 'center' });
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

  // Page 2: Stator Winding Readings (Multimeter R/L/C)
  doc.addPage();
  drawHeader('STATOR WINDING TEST READINGS (LCR MULTIMETER)');

  const drawWindingWGroup = (groupLabel, groupPrefix) => {
    const globalFreq = mulData[`${groupPrefix}_global_freq`]?.frequency;
    const titleText = (globalFreq && globalFreq !== 'undefined') ? `${groupLabel} (Winding Freq: ${globalFreq})` : groupLabel;

    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLUE).text(titleText, 40);
    doc.moveDown(0.2);

    const resFreq = mulData[`${groupPrefix}_res_freq`]?.frequency;
    const indFreq = mulData[`${groupPrefix}_ind_freq`]?.frequency;
    const capFreq = mulData[`${groupPrefix}_cap_freq`]?.frequency;

    const cleanResFreq = (resFreq && resFreq !== 'undefined') ? ` [${resFreq}]` : '';
    const cleanIndFreq = (indFreq && indFreq !== 'undefined') ? ` [${indFreq}]` : '';
    const cleanCapFreq = (capFreq && capFreq !== 'undefined') ? ` [${cleanCapFreq}]` : '';

    const standardPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const capacitancePhases = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];

    let y = doc.y;

    // ─────────────────────────────────────────────
    // Table 0: Winding Readings Summary Table
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Winding Readings Summary Table (100Hz values for ACR / L)', 40, y);
    y += 11;
    const sumCols = [W * 0.2, W * 0.16, W * 0.16, W * 0.16, W * 0.16, W * 0.16];
    const sumHeaders = ['Phase Line', 'DCR (Ohms)', 'ACR @100Hz (Ohms)', 'L @100Hz (mH)', 'Capacitance (nF)', 'Impedance Z (Ohms)'];

    if (record.correctWindingTo20) {
      sumHeaders[1] = 'DCR (Ohms) @20°C';
      sumHeaders[2] = 'ACR @100Hz (Ohms) @20°C';
    }

    doc.rect(40, y, W, 14).fill(BLUE);
    let sx = 40;
    sumHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold').text(h, sx, y + 3.5, { width: sumCols[idx], align: 'center' });
      sx += sumCols[idx];
    });
    y += 14;

    let sumAlternate = false;
    standardPhases.forEach(phase => {
      // 1. DCR
      const dcrKey = `${groupPrefix}_res_${phase}`;
      let dcrVal = mulData[dcrKey]?.value;
      if (record.correctWindingTo20 && typeof dcrVal === 'number' && !isOverload(dcrVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[dcrKey]?.temperature)) ? 25 : parseFloat(mulData[dcrKey]?.temperature);
        dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }
      let dcrDisp = '—';
      if (dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
        dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : String(dcrVal);
      }

      // 2. ACR @100Hz
      const acrKey = `${groupPrefix}_res_${phase}_100Hz`;
      let acrVal = mulData[acrKey]?.value;
      if (record.correctWindingTo20 && typeof acrVal === 'number' && !isOverload(acrVal, 'R')) {
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

      y += 12;
      sumAlternate = !sumAlternate;
    });

    y += 14;

    // ─────────────────────────────────────────────
    // Table 1: Winding Resistance (DCR)
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Winding Resistance (DCR) Measurements', 40, y);
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
      let rVal = mulData[rKey]?.value;
      let rTemp = mulData[rKey]?.temperature;

      if (rTemp === 'undefined' || rTemp === null || rTemp === undefined || rTemp === '') rTemp = '—';
      else rTemp = `${rTemp}°C`;

      if (record.correctWindingTo20 && typeof rVal === 'number' && !isOverload(rVal, 'R')) {
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
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('AC Winding Resistance (ACR) Measurements', 40, y);
    y += 11;
    const acrHeaders = ['Phase Line', `Resistance (ACR) (Ohms)${record.correctWindingTo20 ? ' @20°C' : ''}`, 'Frequency', 'Temperature (°C)'];
    const acrCols = [W * 0.35, W * 0.25, W * 0.2, W * 0.2];

    doc.rect(40, y, W, 14).fill(BLUE);
    let ax = 40;
    acrHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ax, y + 3.5, { width: acrCols[idx], align: 'center' });
      ax += acrCols[idx];
    });
    y += 14;

    let acrAlternate = false;
    standardPhases.forEach(phase => {
      const acrKey = `${groupPrefix}_res_${phase}_100Hz`;
      let acrVal = mulData[acrKey]?.value;
      let acrTemp = mulData[acrKey]?.temperature;

      if (acrTemp === 'undefined' || acrTemp === null || acrTemp === undefined || acrTemp === '') acrTemp = '—';
      else acrTemp = `${acrTemp}°C`;

      if (record.correctWindingTo20 && typeof acrVal === 'number' && !isOverload(acrVal, 'R')) {
        const tempNum = isNaN(parseFloat(mulData[acrKey]?.temperature)) ? 25 : parseFloat(mulData[acrKey]?.temperature);
        acrVal = parseFloat((acrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
      }

      doc.rect(40, y, W, 12).fill(acrAlternate ? LGRAY : '#FFFFFF');
      ax = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, ax + 6, y + 2, { width: acrCols[0] - 12, align: 'left' });
      ax += acrCols[0];

      let acrDisplay = '—';
      if (acrVal !== undefined && acrVal !== null && acrVal !== '') {
        acrDisplay = isOverload(acrVal, 'R') ? 'O.L' : String(acrVal);
      }
      doc.font('Helvetica').fontSize(7.5);
      doc.text(acrDisplay, ax, y + 2, { width: acrCols[1], align: 'center' });
      ax += acrCols[1];
      doc.text(acrVal !== undefined && acrVal !== null && acrVal !== '' ? '100Hz' : '—', ax, y + 2, { width: acrCols[2], align: 'center' });
      ax += acrCols[2];
      doc.text(acrTemp, ax, y + 2, { width: acrCols[3], align: 'center' });

      y += 12;
      acrAlternate = !acrAlternate;
    });

    y += 10;

    // ─────────────────────────────────────────────
    // Table 2: Winding Inductance
    // ─────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLUE).text('Inductance Measurements', 40, y);
    y += 11;
    const indCols = [W * 0.4, W * 0.3, W * 0.3];
    const indHeaders = ['Phase Line', `Inductance (mH)${cleanIndFreq}`, 'Frequency'];

    doc.rect(40, y, W, 14).fill(BLUE);
    let ix = 40;
    indHeaders.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ix, y + 3.5, { width: indCols[idx], align: 'center' });
      ix += indCols[idx];
    });
    y += 14;

    let indAlternate = false;
    standardPhases.forEach(phase => {
      const iKey = `${groupPrefix}_ind_${phase}`;
      let iVal = mulData[iKey]?.value;
      let iFreq = mulData[iKey]?.frequency;
      
      // Fallback to 100Hz sweep if empty
      if (iVal === undefined || iVal === null || iVal === '') {
        const sweep100Key = `${groupPrefix}_ind_${phase}_100Hz`;
        const sweepVal = mulData[sweep100Key]?.value;
        if (sweepVal !== undefined && sweepVal !== null && sweepVal !== '') {
          iVal = sweepVal;
          iFreq = '100Hz';
        }
      }

      if (iFreq === 'undefined' || iFreq === null || iFreq === undefined || iFreq === '') iFreq = '—';

      doc.rect(40, y, W, 12).fill(indAlternate ? LGRAY : '#FFFFFF');
      ix = 40;
      doc.fillColor(DARK_GRAY).fontSize(7.5).font('Helvetica-Bold').text(`Phase ${phase}`, ix + 6, y + 2, { width: indCols[0] - 12, align: 'left' });
      ix += indCols[0];

      let iDisplay = '—';
      if (iVal !== undefined && iVal !== null && iVal !== '') {
        iDisplay = isOverload(iVal, 'L') ? 'O.L' : String(iVal);
      }
      doc.font('Helvetica').fontSize(7.5);
      doc.text(iDisplay, ix, y + 2, { width: indCols[1], align: 'center' });
      ix += indCols[1];
      doc.text(iFreq, ix, y + 2, { width: indCols[2], align: 'center' });

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
      doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE).text(`${groupLabel} Impedance (Z & Phase Angle)`, 40);
      doc.moveDown(0.2);

      const impCols = [W * 0.25, W * 0.22, W * 0.22, W * 0.16, W * 0.15];
      const impHeaders = ['Phase Line', 'Impedance Z (Ohms)', 'Phase Angle (°)', 'Frequency', 'Temp (°C)'];
      let iy = doc.y;
      let ix = 40;

      doc.rect(40, iy, W, 16).fill(BLUE);
      impHeaders.forEach((h, idx) => {
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, ix, iy + 4, { width: impCols[idx], align: 'center' });
        ix += impCols[idx];
      });
      iy += 16;

      let impAlternate = false;
      impPhases.forEach(phase => {
        const zKey = `${groupPrefix}_imp_${phase}_z`;
        const degKey = `${groupPrefix}_imp_${phase}_deg`;
        const zVal = mulData[zKey]?.value;
        const degVal = mulData[degKey]?.value;
        let zFreq = mulData[zKey]?.frequency || mulData[degKey]?.frequency || '—';
        if (zFreq === 'undefined') zFreq = '—';
        let zTemp = mulData[zKey]?.temperature !== undefined ? `${mulData[zKey].temperature}°C` : (mulData[degKey]?.temperature !== undefined ? `${mulData[degKey].temperature}°C` : '—');
        if (zTemp.includes('undefined')) zTemp = '—';

        if (zVal === undefined && degVal === undefined) return;

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

    // --- Draw Phase Imbalances ---
    const r12 = mulData[`${groupPrefix}_res_1-2`]?.value;
    const r13 = mulData[`${groupPrefix}_res_1-3`]?.value;
    const r23 = mulData[`${groupPrefix}_res_2-3`]?.value;
    const rImb = calculateImbalance(r12, r13, r23);

    const i12 = mulData[`${groupPrefix}_ind_1-2`]?.value;
    const i13 = mulData[`${groupPrefix}_ind_1-3`]?.value;
    const i23 = mulData[`${groupPrefix}_ind_2-3`]?.value;
    const iImb = calculateImbalance(i12, i13, i23);

    let textImbParts = [];
    if (rImb !== null) textImbParts.push(`Resistance Imbalance: ${rImb.toFixed(2)}%`);
    if (iImb !== null) textImbParts.push(`Inductance Imbalance: ${iImb.toFixed(2)}%`);
    if (textImbParts.length > 0) {
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8.5)
        .text(`Phase Imbalances:  ${textImbParts.join('    |    ')}`, 40, doc.y);
      doc.y += 14;
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
  drawHeader('ROTOR WINDING TEST READINGS (LCR MULTIMETER)');
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
    if (maxImbalance > 0) {
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
    const tablesPresent = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);

    if (tablesPresent.length === 0) return;

    tablesPresent.forEach(tableId => {
      const rows = tabData[tableId];
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

      const rawRtStr = Rt !== null ? formatResistance(Rt) : '—';
      const corrR40Str = Rc40 !== null ? formatResistance(Rc40) : '—';

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

      // ── Sample rows for the TABLE (max 50 evenly-spaced rows) ──
      // The full row set is still used for the chart for accuracy.
      const MAX_TABLE_ROWS = 50;
      let tableRows = rows;
      let truncated = false;
      if (rows.length > MAX_TABLE_ROWS) {
        truncated = true;
        const step = (rows.length - 1) / (MAX_TABLE_ROWS - 1);
        tableRows = Array.from({ length: MAX_TABLE_ROWS }, (_, i) => rows[Math.round(i * step)]);
      }

      // 1. LEFT COLUMN: Data Table
      const colW = [leftW * 0.16, leftW * 0.20, leftW * 0.20, leftW * 0.22, leftW * 0.22];
      const headers = ['Sec', 'V (V)', 'Act V', 'uA', `R (MOhm)${record.correctInsulationTo40 ? '*' : ''}`];

      let y = startY;
      let x = 40;

      // Table header
      doc.rect(40, y, leftW, 14).fill(BLUE);
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold').text(h, x, y + 4, { width: colW[i], align: 'center' });
        x += colW[i];
      });
      y += 14;

      tableRows.forEach((r, idx) => {
        const rowH = 9.5;
        doc.rect(40, y, leftW, rowH).fill(idx % 2 === 0 ? '#FFFFFF' : LGRAY);
        x = 40;

        let displayRes = r.resistance;
        if (record.correctInsulationTo40 && typeof displayRes === 'number') {
          displayRes = Math.round(displayRes * Kt);
        }

        [r.time, r.voltage, r.actualVoltage, r.current, displayRes].forEach((val, i) => {
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

      const yAxisKey = tab === 'SV' || tab === 'RAMP' ? 'current' : 'resistance';
      const yAxisLabel = tab === 'SV' || tab === 'RAMP' ? 'Current (uA)' : 'Resistance (MΩ)';
      const xAxisKey = tab === 'SV' ? 'voltage' : 'time';
      const xAxisLabel = tab === 'SV' ? 'Voltage (V)' : 'Time (s)';

      drawPDFChart(
        doc,
        `${tab} Diagnostic Plot`,
        chartX, chartY, chartW, chartH,
        rows,          // always use full rows for the chart
        xAxisKey, yAxisKey,
        xAxisLabel, yAxisLabel,
        record.correctInsulationTo40,
        runTemp
      );

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
    doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#F1F5F9');

    let footnoteParts = [];
    if (record.correctWindingTo20) footnoteParts.push('Winding corrected to 20°C');
    if (record.correctInsulationTo40) footnoteParts.push('Insulation corrected to 40°C (IEEE 43)');
    const footnoteStr = footnoteParts.length > 0 ? ` [Note: ${footnoteParts.join(' & ')}]` : '';

    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
      .text(
        `Generated by Sarox Technology Inc.  |  ${new Date().toLocaleString()}  |  Page ${i + 1} of ${pages.count}${footnoteStr}`,
        40, doc.page.height - 20, { width: W, align: 'center' }
      );
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
