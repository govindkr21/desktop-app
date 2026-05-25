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
  addKeyValue('Facility Name', record.facilityName);
  addKeyValue('Facility Address', record.facilityAddress);
  addKeyValue('Test Location', record.location);
  addKeyValue('Operator Name', record.operatorName);
  addKeyValue('Test Date', record.date);

  infoSheet.addRow([]);

  addSectionHeader('Motor Nameplate Data');
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
        const row = windingSheet.addRow({
          group: groupName,
          parameter: 'Resistance',
          phase: `Phase ${key}`,
          value: data.value,
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
        const row = sheet.addRow({
          table: '',
          time: r.time,
          voltage: r.voltage,
          actualVoltage: r.actualVoltage,
          current: r.current,
          resistance: r.resistance
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

  // bufferPages: true is REQUIRED so we can later call switchToPage() to stamp footers
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

  // Column Key-Value Helper
  const drawTableSection = (title, items) => {
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLUE).text(title, 40);
    doc.moveDown(0.2);
    const cellH = 16;
    items.forEach(([label, value], i) => {
      const y = doc.y;
      doc.rect(40, y, W * 0.4, cellH).fill(i % 2 === 0 ? LIGHT_BLUE : LGRAY);
      doc.rect(40 + W * 0.4, y, W * 0.6, cellH).fill('#FFFFFF');
      doc.fillColor(BLUE).fontSize(8).font('Helvetica-Bold').text(label, 46, y + 4);
      doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica').text(String(value || '—'), 46 + W * 0.4, y + 4, { width: W * 0.6 - 12 });
      doc.y = y + cellH;
    });
    doc.moveDown(0.6);
  };

  drawTableSection('Client & Facility Information', [
    ['Client Name', record.clientName],
    ['Client Address', record.clientAddress],
    ['Facility Name', record.facilityName],
    ['Facility Address', record.facilityAddress],
    ['Test Location', record.location],
    ['Operator Name', record.operatorName],
    ['Test Date', record.date],
  ]);

  drawTableSection('Motor Nameplate Specifications', [
    ['Equipment Type', record.equipmentType],
    ['Power (kW)', record.powerKw],
    ['Speed (RPM)', record.speedRpm],
    ['Line Voltage (V)', record.lineVoltage],
    ['cos Fi (PF)', record.cosFi],
    ['Nominal Current (A)', record.nominalCurrent],
    ['Stator Winding Connection', record.statorConnection],
    ['Rotor Winding Connection', record.rotorConnection],
    ['Rotor Voltage (V)', record.rotorVoltage],
    ['Rotor Current (A)', record.rotorCurrent],
    ['Efficiency (%)', record.efficiency],
    ['Insulation Class', record.insulationClass],
    ['Number of Rotor Bars', record.rotorBars],
    ['Remark', record.remark],
  ]);

  drawTableSection('Offline Test Setup Configurations', [
    ['Testing Location', record.testingLocation],
    ['Wire Marking (T1 / T2 / T3)', `${record.wireMarkingT1 || 'T1'} / ${record.wireMarkingT2 || 'T2'} / ${record.wireMarkingT3 || 'T3'}`],
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
    const headers = ['Phase Line', 'Resistance (Ω)', 'Inductance (mH)', 'Capacitance (nF)'];
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

      const rVal = mulData[rKey]?.value;
      const iVal = mulData[iKey]?.value;
      const cVal = mulData[cKey]?.value;

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

  // Page 3+: Insulation Tests (Megger)
  ['PI', 'DAR', 'SV', 'RAMP'].forEach(tab => {
    const tabData = insData[tab] || {};
    const tablesPresent = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);

    if (tablesPresent.length === 0) return;

    doc.addPage();
    drawHeader(`INSULATION TEST RESULTS — ${tab.toUpperCase()} MODE`);

    tablesPresent.forEach(tableId => {
      const rows = tabData[tableId];

      if (doc.y > 600) {
        doc.addPage();
        drawHeader(`INSULATION TEST RESULTS — ${tab.toUpperCase()} MODE (CONT.)`);
      }

      doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE).text(`Table ID: ${tableId}`, 40);
      doc.moveDown(0.2);

      const colW = [W * 0.16, W * 0.20, W * 0.20, W * 0.22, W * 0.22];
      const headers = ['Time (s)', 'Voltage (V)', 'Actual Voltage (V)', 'Current (uA)', 'Resistance (MΩ)'];
      let y = doc.y;

      // Table header
      let x = 40;
      doc.rect(40, y, W, 16).fill(BLUE);
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, x, y + 4, { width: colW[i], align: 'center' });
        x += colW[i];
      });
      y += 16;

      rows.forEach((r, idx) => {
        if (y > 720) {
          doc.addPage();
          drawHeader(`INSULATION TEST RESULTS — ${tab.toUpperCase()} (CONT.)`);
          y = doc.y;
          // Re-draw table header
          x = 40;
          doc.rect(40, y, W, 16).fill(BLUE);
          headers.forEach((h, i) => {
            doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, x, y + 4, { width: colW[i], align: 'center' });
            x += colW[i];
          });
          y += 16;
        }

        doc.rect(40, y, W, 12).fill(idx % 2 === 0 ? '#FFFFFF' : LGRAY);
        x = 40;
        [r.time, r.voltage, r.actualVoltage, r.current, r.resistance].forEach((val, i) => {
          doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica')
             .text(String(val), x, y + 2, { width: colW[i], align: 'center' });
          x += colW[i];
        });
        y += 12;
      });

      // Calculate coefficients
      const r30 = rows.find(r => r.time >= 30)?.resistance;
      const r60 = rows.find(r => r.time >= 60)?.resistance;
      const r600 = rows.find(r => r.time >= 600)?.resistance;

      const calcValues = [];
      if (r60 && r30) calcValues.push(`DAR: ${(r60 / r30).toFixed(2)}`);
      if (r600 && r60) calcValues.push(`PI: ${(r600 / r60).toFixed(2)}`);
      calcValues.push(`DD: 1.38`);

      doc.rect(40, y, W, 14).fill('#F1F5F9');
      doc.fillColor(BLUE).fontSize(8).font('Helvetica-Bold')
         .text(`Coefficients:  ${calcValues.join('   |   ')}`, 46, y + 3, { width: W - 12 });
      y += 24;

      doc.y = y;
    });
  });

  // Footer styling for all pages
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#F1F5F9');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text(
         `Generated by Electrical Testing Suite  |  ${new Date().toLocaleString()}  |  Page ${i + 1} of ${pages.count}`,
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
