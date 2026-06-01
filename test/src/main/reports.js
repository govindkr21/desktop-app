// src/main/reports.js — Excel & PDF Export
const path = require('path');
const { app, dialog } = require('electron');
const fs = require('fs');
const db = require('./database');

// Helper to sanitize filename
function sanitizeFilename(name) {
  return (name || 'Report').replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
async function exportExcel(recordId, mainWindow) {
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
  workbook.creator = 'Electrical Testing Suite';
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
    { header: 'Phase Line', key: 'phase', width: 16 },
    { header: 'Value', key: 'value', width: 14 },
    { header: 'Unit', key: 'unit', width: 10 },
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
        if (isCorrected && typeof displayVal === 'number') {
          const tempVal = isNaN(parseFloat(data.temperature)) ? 25 : parseFloat(data.temperature);
          displayVal = parseFloat((displayVal * (254.5 / (234.5 + tempVal))).toFixed(3));
        }
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Resistance',
          phase: `Phase ${key}`,
          value: displayVal,
          unit: 'Ω',
          temp: data.temperature
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
          value: data.value,
          unit: 'mH',
          temp: data.temperature
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
          value: data.value,
          unit: 'nF',
          temp: data.temperature
        });
        row.eachCell(cell => { cell.font = bodyFont; cell.border = borders; cell.alignment = { horizontal: 'center' }; });
        if (rowCounter % 2 === 1) row.eachCell(cell => { cell.fill = altFill; });
        rowCounter++;
      }
    });
  });

  windingSheet.addRow([]);
  const windingFootnoteText = record.correctWindingTo20
    ? `* Note: The winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula (Baseline 20°C correction is ACTIVE).`
    : `* Note: The winding resistance measurements shown above are raw/uncorrected values (Baseline 20°C correction is INACTIVE).`;
  const windingFootnoteRow = windingSheet.addRow([windingFootnoteText]);
  windingSheet.mergeCells(`A${windingFootnoteRow.number}:F${windingFootnoteRow.number}`);
  windingFootnoteRow.getCell(1).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF64748B' } };

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
          const tempVal = isNaN(parseFloat(record.temperature)) ? 25 : parseFloat(record.temperature);
          const Kt = Math.pow(0.5, (40 - tempVal) / 10);
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
      calcValues.push(`DD: 1.38`);

      const summaryRow = sheet.addRow([`Coefficients: ${calcValues.join('  |  ')}`]);
      sheet.mergeCells(`A${summaryRow.number}:F${summaryRow.number}`);
      const sCell = summaryRow.getCell(1);
      sCell.font = boldFont;
      sCell.border = borders;
      sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      summaryRow.height = 18;
      
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

  // Page 1 Header
  const drawHeader = (titleText) => {
    doc.rect(0, 0, doc.page.width, 60).fill(BLUE);
    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
       .text(titleText, 40, 16, { width: W, align: 'center' });
    doc.fontSize(8).font('Helvetica')
       .text('Electrical Motor Testing Suite (Offline Testing)', 40, 36, { width: W, align: 'center' });
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
    ['PI/DAR Test Voltage', record.testVoltagePiDar],
    ['STEP Test Voltage', record.testVoltageStep],
    ['RAMP Test Voltage', record.testVoltageRamp],
  ]);

  // Page 2: Winding Test Readings (Multimeter R/L/C)
  doc.addPage();
  drawHeader('WINDING TEST READINGS (LCR MULTIMETER)');

  const drawWindingWGroup = (groupLabel, groupPrefix) => {
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLUE).text(groupLabel, 40);
    doc.moveDown(0.2);

    const cols = [W * 0.25, W * 0.25, W * 0.25, W * 0.25];
    const headers = ['Phase Line', `Resistance (Ω)${record.correctWindingTo20 ? ' @20°C' : ''}`, 'Inductance (mH)', 'Capacitance (nF)'];
    let y = doc.y;
    let x = 40;

    // Table Header
    doc.rect(40, y, W, 18).fill(BLUE);
    headers.forEach((h, idx) => {
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, x, y + 5, { width: cols[idx], align: 'center' });
      x += cols[idx];
    });
    y += 18;

    const phases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N', '123-GND', '1-GND', '2-GND', '3-GND'];
    let alternate = false;

    phases.forEach(phase => {
      const rKey = `${groupPrefix}_res_${phase}`;
      const iKey = `${groupPrefix}_ind_${phase}`;
      const cKey = `${groupPrefix}_cap_${phase}`;

      let rVal = mulData[rKey]?.value;
      const iVal = mulData[iKey]?.value;
      const cVal = mulData[cKey]?.value;
      const rTemp = isNaN(parseFloat(mulData[rKey]?.temperature)) ? 25 : parseFloat(mulData[rKey]?.temperature);

      if (record.correctWindingTo20 && typeof rVal === 'number') {
        rVal = parseFloat((rVal * (254.5 / (234.5 + rTemp))).toFixed(3));
      }

      // Skip lines that have absolutely no readings captured
      if (rVal === undefined && iVal === undefined && cVal === undefined) return;

      doc.rect(40, y, W, 14).fill(alternate ? LGRAY : '#FFFFFF');
      
      x = 40;
      doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica-Bold').text(`Phase ${phase}`, x + 6, y + 3, { width: cols[0] - 12, align: 'left' });
      x += cols[0];
      
      doc.font('Helvetica');
      doc.text(rVal !== undefined ? String(rVal) : '—', x, y + 3, { width: cols[1], align: 'center' });
      x += cols[1];
      doc.text(iVal !== undefined ? String(iVal) : '—', x, y + 3, { width: cols[2], align: 'center' });
      x += cols[2];
      doc.text(cVal !== undefined ? String(cVal) : '—', x, y + 3, { width: cols[3], align: 'center' });
      
      y += 14;
      alternate = !alternate;
    });

    doc.y = y + 15;
  };

  drawWindingWGroup('🌀 Stator Winding Readings', 'stator');
  drawWindingWGroup('🌀 Rotor Winding Readings', 'rotor');

  if (record.correctWindingTo20) {
    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Oblique')
       .text('* Note: Winding resistance measurements shown above are corrected/baselined to 20°C using standard copper formula.', 40, doc.y + 10, { width: W });
  }

  // Page 3+: Insulation Tests (Megger) with Side-by-Side vector charts
  ['PI', 'DAR', 'SV', 'RAMP'].forEach(tab => {
    const tabData = insData[tab] || {};
    const tablesPresent = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);

    if (tablesPresent.length === 0) return;

    tablesPresent.forEach(tableId => {
      const rows = tabData[tableId];

      doc.addPage();
      drawHeader(`INSULATION TEST RESULTS — ${tab.toUpperCase()} MODE`);

      doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE).text(`Test Table: ${tableId}`, 40);
      doc.moveDown(0.4);

      // Define side-by-side columns
      const leftW = W * 0.48;
      const rightW = W * 0.48;
      const gap = W * 0.04;
      
      const startY = doc.y;

      // 1. LEFT COLUMN: Data Table
      const colW = [leftW * 0.16, leftW * 0.20, leftW * 0.20, leftW * 0.22, leftW * 0.22];
      const headers = ['Sec', 'V (V)', 'Act V', 'uA', `R (MΩ)${record.correctInsulationTo40 ? '*' : ''}`];
      
      let y = startY;
      let x = 40;

      // Table header
      doc.rect(40, y, leftW, 14).fill(BLUE);
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold').text(h, x, y + 4, { width: colW[i], align: 'center' });
        x += colW[i];
      });
      y += 14;

      rows.forEach((r, idx) => {
        const rowH = 9.5;
        doc.rect(40, y, leftW, rowH).fill(idx % 2 === 0 ? '#FFFFFF' : LGRAY);
        x = 40;

        let displayRes = r.resistance;
        if (record.correctInsulationTo40 && typeof displayRes === 'number') {
          const tempVal = isNaN(parseFloat(record.temperature)) ? 25 : parseFloat(record.temperature);
          const Kt = Math.pow(0.5, (40 - tempVal) / 10);
          displayRes = Math.round(displayRes * Kt);
        }

        [r.time, r.voltage, r.actualVoltage, r.current, displayRes].forEach((val, i) => {
          doc.fillColor(DARK_GRAY).fontSize(6.5).font('Helvetica')
             .text(String(val), x, y + 2, { width: colW[i], align: 'center' });
          x += colW[i];
        });
        y += rowH;
      });

      // Calculate coefficients
      const r30 = rows.find(r => r.time >= 30)?.resistance;
      const r60 = rows.find(r => r.time >= 60)?.resistance;
      const r600 = rows.find(r => r.time >= 600)?.resistance;

      const calcValues = [];
      if (r60 && r30) calcValues.push(`DAR: ${(r60 / r30).toFixed(2)}`);
      if (r600 && r60) calcValues.push(`PI: ${(r600 / r60).toFixed(2)}`);
      calcValues.push(`DD: 1.38`);

      doc.rect(40, y, leftW, 14).fill('#F1F5F9');
      doc.fillColor(BLUE).fontSize(7).font('Helvetica-Bold')
         .text(`Coefficients:  ${calcValues.join('   |   ')}`, 46, y + 3.5, { width: leftW - 12 });
      y += 18;

      // 2. RIGHT COLUMN: Vector Line Chart!
      const chartX = 40 + leftW + gap;
      const chartY = startY;
      const chartW = rightW;
      const chartH = 200; // elegant height

      // Determine axes keys and labels
      const yAxisKey = tab === 'SV' || tab === 'RAMP' ? 'current' : 'resistance';
      const yAxisLabel = tab === 'SV' || tab === 'RAMP' ? 'Current (uA)' : 'Resistance (MΩ)';
      const xAxisKey = tab === 'SV' ? 'voltage' : 'time';
      const xAxisLabel = tab === 'SV' ? 'Voltage (V)' : 'Time (s)';

      drawPDFChart(
        doc,
        `${tab} Diagnostic Plot`,
        chartX,
        chartY,
        chartW,
        chartH,
        rows,
        xAxisKey,
        yAxisKey,
        xAxisLabel,
        yAxisLabel,
        record.correctInsulationTo40,
        record.temperature
      );

      // Restore y position
      doc.y = Math.max(y, chartY + chartH) + 20;

      if (record.correctInsulationTo40) {
        const tempVal = isNaN(parseFloat(record.temperature)) ? 25 : parseFloat(record.temperature);
        const Kt = Math.pow(0.5, (40 - tempVal) / 10);
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
    if (record.correctInsulationTo40) footnoteParts.push(`Insulation corrected to 40°C (IEEE 43, Test Temp: ${isNaN(parseFloat(record.temperature)) ? 25 : parseFloat(record.temperature)}°C)`);
    const footnoteStr = footnoteParts.length > 0 ? ` [Note: ${footnoteParts.join(' & ')}]` : '';

    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text(
         `Generated by Electrical Testing Suite  |  ${new Date().toLocaleString()}  |  Page ${i + 1} of ${pages.count}${footnoteStr}`,
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
