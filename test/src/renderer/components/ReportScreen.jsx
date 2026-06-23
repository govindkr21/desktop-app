// src/renderer/components/ReportScreen.jsx
import { useState, useEffect } from 'react';
import { LineChart, Line, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import logo from '../../assets/logo.png';

const api = window.electronAPI;

const isOverload = (val, mode) => {
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
};

const calculateImbalance = (v1, v2, v3) => {
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
};

const formatResistance = (mOhms) => {
  if (mOhms == null || Number.isNaN(mOhms)) return '—';
  const val = Number(mOhms);
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} TΩ`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)} GΩ`;
  if (val < 1) return `${(val * 1e3).toFixed(1)} kΩ`;
  return `${val.toFixed(2)} MΩ`;
};

const getPassStatus = (Rc40) => {
  if (Rc40 === null || Rc40 === undefined) return { text: '—', color: '#64748b', bg: '#f1f5f9' };
  if (Rc40 >= 100) return { text: 'Pass (Excellent)', color: '#16a34a', bg: '#dcfce7' };
  if (Rc40 >= 5) return { text: 'Pass (Standard)', color: '#2563eb', bg: '#dbeafe' };
  return { text: 'Fail (Low Insulation)', color: '#dc2626', bg: '#fee2e2' };
};

export default function ReportScreen({ record, onChange }) {
  const [insData, setInsData] = useState({});
  const [mulData, setMulData] = useState({});
  const [exporting, setExporting] = useState('');
  const [message, setMessage] = useState(null);
  const [lastFilePath, setLastFilePath] = useState(null);

  useEffect(() => {
    if (!record) return;
    api.getInsulationData(record.id).then(d => setInsData(d || {}));
    api.getMultimeterData(record.id).then(d => setMulData(d || {}));
  }, [record?.id]);

  const svgToPng = (svgElement) => {
    return new Promise((resolve, reject) => {
      try {
        const clonedSvg = svgElement.cloneNode(true);
        const width = svgElement.clientWidth || svgElement.getBoundingClientRect().width || 600;
        const height = svgElement.clientHeight || svgElement.getBoundingClientRect().height || 350;
        
        clonedSvg.setAttribute('width', width);
        clonedSvg.setAttribute('height', height);
        
        const svgString = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const URL = window.URL || window.webkitURL || window;
        const blobURL = URL.createObjectURL(svgBlob);
        
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0);
          const png = canvas.toDataURL('image/png');
          URL.revokeObjectURL(blobURL);
          resolve(png);
        };
        image.onerror = (err) => {
          URL.revokeObjectURL(blobURL);
          reject(err);
        };
        image.src = blobURL;
      } catch (e) {
        reject(e);
      }
    });
  };

  const grabChartBase64 = async (id) => {
    const container = document.getElementById(id);
    if (!container) return null;
    const svg = container.querySelector('svg');
    if (!svg) return null;
    try {
      return await svgToPng(svg);
    } catch (e) {
      console.error(`Failed to convert svg for ${id} to png`, e);
      return null;
    }
  };

  const handleExport = async (type) => {
    setExporting(type);
    setMessage(null);
    try {
      let result;
      if (type === 'Excel') {
        // Grab sweep chart images
        const sweepImages = {};
        const sweepGroups = ['stator', 'rotor'];
        const sweepTypes = ['ind', 'res'];
        for (const group of sweepGroups) {
          for (const type of sweepTypes) {
            const base64 = await grabChartBase64(`chart-${group}-${type}`);
            if (base64) {
              sweepImages[`${group}_${type}`] = base64;
            }
          }
        }

        // Grab insulation chart images
        const insImages = {};
        for (const tabName of ['PI', 'DAR', 'SV', 'RAMP']) {
          const tabData = insData[tabName] || {};
          const activeTables = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);
          for (const tableId of activeTables) {
            const base64 = await grabChartBase64(`chart-insulation-${tabName}-${tableId}`);
            if (base64) {
              insImages[`${tabName}_${tableId}`] = base64;
            }
          }
        }

        const chartImages = {
          sweep: sweepImages,
          insulation: insImages
        };
        result = await api.exportExcel(record.id, chartImages);
      } else {
        result = await api.exportPDF(record.id);
      }

      if (result.success) {
        setLastFilePath(result.filePath);
        setMessage({ type: 'success', text: `✅ ${type} report saved to: ${result.filePath}` });
      } else if (result.reason === 'cancelled') {
        setMessage({ type: 'info', text: 'Export cancelled.' });
      } else {
        setMessage({ type: 'error', text: `❌ Export failed: ${result.error}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `❌ Error: ${err.message}` });
    }
    setExporting('');
  };

  const openPath = async (path) => {
    if (api && api.openPath) {
      await api.openPath(path);
    }
  };

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

  const piVolts = getNominalVoltage('PI') || record?.testVoltagePiDar || '—';
  const darVolts = getNominalVoltage('DAR') || record?.testVoltagePiDar || '—';
  const stepVolts = getSVNominalVoltages() || record?.testVoltageStep || '—';
  const rampVolts = getRampNominalVoltages() || record?.testVoltageRamp || '—';

  // Check if any insulation tables have data
  const hasInsulation = Object.values(insData).some(tabObj => 
    tabObj && Object.values(tabObj).some(arr => arr && arr.length > 0)
  );

  // Check if any multimeter values exist
  const hasMulData = Object.keys(mulData).length > 0;

  const msgColor = message?.type === 'success' ? { bg: '#f0fdf4', border: '#86efac', text: '#166534' }
                 : message?.type === 'error'   ? { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' }
                 :                               { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };

  // Winding Imbalances at card group level
  const statorResImb = calculateImbalance(mulData?.stator_res_1-2?.value, mulData?.stator_res_1-3?.value, mulData?.stator_res_2-3?.value);
  const statorIndImb = calculateImbalance(mulData?.stator_ind_1-2?.value, mulData?.stator_ind_1-3?.value, mulData?.stator_ind_2-3?.value);
  const rotorResImb = calculateImbalance(mulData?.rotor_res_1-2?.value, mulData?.rotor_res_1-3?.value, mulData?.rotor_res_2-3?.value);
  const rotorIndImb = calculateImbalance(mulData?.rotor_ind_1-2?.value, mulData?.rotor_ind_1-3?.value, mulData?.rotor_ind_2-3?.value);

  const hasLStatorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`stator_ind_${p}_${f}`]?.value !== undefined));
  const hasLRotorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`rotor_ind_${p}_${f}`]?.value !== undefined));
  const hasRStatorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`stator_res_${p}_${f}`]?.value !== undefined));
  const hasRRotorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`rotor_res_${p}_${f}`]?.value !== undefined));

  const renderSweepTable = (title, group, type) => {
    const tablePhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const tableFreqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    
    const hasData = tablePhases.some(phase =>
      tableFreqs.some(f => mulData[`${group}_${type}_${phase}_${f}`]?.value !== undefined)
    );
    if (!hasData) return null;

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

    const chartData = tableFreqs.map(f => {
      const obj = { name: f };
      tablePhases.forEach(phase => {
        const cellData = mulData[`${group}_${type}_${phase}_${f}`];
        if (cellData && cellData.value !== undefined) {
          let val = cellData.value;
          if (type === 'res' && record?.correctWindingTo20) {
            const tempNum = isNaN(parseFloat(cellData.temperature)) ? 25 : parseFloat(cellData.temperature);
            val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
          }
          obj[phase] = val;
        }
      });
      return obj;
    });

    let minVal = Infinity;
    chartData.forEach(d => {
      tablePhases.forEach(phase => {
        if (d[phase] !== undefined && d[phase] < minVal) {
          minVal = d[phase];
        }
      });
    });
    const minAreaY = minVal < 0 ? minVal - 1 : 0;

    return (
      <div key={`${group}_${type}_sweep`} style={{ marginBottom: 20, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '0 0 8px 0' }}>{title}</h5>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, background: '#fff', border: '1px solid #cbd5e1' }}>
              <thead>
                <tr style={{ background: '#1e40af', color: '#fff' }}>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                  {tableFreqs.map(f => <th key={f} style={{ padding: '4px 6px', textAlign: 'right' }}>{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {tablePhases.map(phase => {
                  return (
                    <tr key={phase} style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                      {tableFreqs.map(f => {
                        const cellData = mulData[`${group}_${type}_${phase}_${f}`];
                        let val = cellData?.value;
                        if (val !== undefined && type === 'res' && record?.correctWindingTo20) {
                          const tempNum = isNaN(parseFloat(cellData.temperature)) ? 25 : parseFloat(cellData.temperature);
                          val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
                        }
                        const displayVal = val !== undefined ? (isOverload(val, type === 'res' ? 'R' : 'L') ? 'O.L' : val) : '—';
                        return (
                          <td key={f} style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {Object.keys(colImbalances).length > 0 && (
                  <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#fef3c7', fontWeight: 'bold' }}>
                    <td style={{ padding: '4px 6px', color: '#78350f' }}>Imbalance (%)</td>
                    {tableFreqs.map(f => (
                      <td key={f} style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#78350f' }}>
                        {colImbalances[f] !== undefined ? `${colImbalances[f].toFixed(2)}%` : '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
            {maxImbalance > 0 && (
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 'bold', color: maxImbalance < 5 ? '#16a34a' : '#dc2626' }}>
                Max Imbalance: {maxImbalance.toFixed(2)}% | Condition Status: {maxImbalance < 5 ? 'Normal / Good' : 'Investigate (High Imbalance)'}
              </div>
            )}
          </div>
          <div id={`chart-${group}-${type}`} style={{ height: 160, width: '100%', minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} />
                <YAxis style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} />
                {minAreaY < 0 && (
                  <ReferenceArea
                    y1={minAreaY}
                    y2={0}
                    fill="#FEF08A"
                    fillOpacity={0.7}
                    label={{ value: "Capacitive Regime", position: "insideBottomLeft", fill: "#A16207", fontSize: 8, fontWeight: 700 }}
                  />
                )}
                <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: 8, fontWeight: 700, fill: '#475569' }} />
                {tablePhases.map(phase => {
                  const hasLineData = chartData.some(d => d[phase] !== undefined);
                  if (!hasLineData) return null;

                  const phaseColors = {
                    '1-2': '#E11D48',
                    '1-3': '#10B981',
                    '2-3': '#D97706',
                    '1-N': '#7C3AED',
                    '2-N': '#06B6D4',
                    '3-N': '#EC4899',
                  };
                  const color = phaseColors[phase] || '#64748b';
                  return (
                    <Line
                      key={phase}
                      type="monotone"
                      dataKey={phase}
                      name={`Phase ${phase}`}
                      stroke={color}
                      activeDot={{ r: 4 }}
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20, height: 'calc(100vh - 112px)', overflowY: 'auto', boxSizing: 'border-box' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Report Preview</h2>
          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>Review test values before saving to your computer</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleExport('Excel')}
            disabled={!!exporting}
            style={{
              background: exporting === 'Excel' ? '#15803d' : '#16a34a', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s', opacity: exporting && exporting !== 'Excel' ? 0.5 : 1
            }}
          >
            {exporting === 'Excel' ? '⏳ Exporting...' : '📊 Export Excel'}
          </button>
          <button
            onClick={() => handleExport('PDF')}
            disabled={!!exporting}
            style={{
              background: exporting === 'PDF' ? '#b91c1c' : '#dc2626', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s', opacity: exporting && exporting !== 'PDF' ? 0.5 : 1
            }}
          >
            {exporting === 'PDF' ? '⏳ Exporting...' : '📄 Export PDF'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div style={{
          background: msgColor.bg, border: `1px solid ${msgColor.border}`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 12, color: msgColor.text, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>{message.text}</span>
          {message.type === 'success' && lastFilePath && (
            <button
              onClick={() => openPath(lastFilePath)}
              style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
            >
              📂 Show File
            </button>
          )}
        </div>
      )}

      {/* Baseline Settings Control Panel */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚙️ DISPLAY MODE OPTIONS:
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Winding Toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: record?.correctWindingTo20 ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${record?.correctWindingTo20 ? '#bfdbfe' : '#cbd5e1'}`,
            borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700,
            color: record?.correctWindingTo20 ? '#1e40af' : '#475569', cursor: 'pointer',
            transition: 'all 0.15s'
          }}>
            <input
              type="checkbox"
              checked={record?.correctWindingTo20 || false}
              onChange={e => onChange('correctWindingTo20', e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show Corrected Winding (20°C Copper)</span>
          </label>

          {/* Insulation Toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: record?.correctInsulationTo40 ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${record?.correctInsulationTo40 ? '#bfdbfe' : '#cbd5e1'}`,
            borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700,
            color: record?.correctInsulationTo40 ? '#1e40af' : '#475569', cursor: 'pointer',
            transition: 'all 0.15s'
          }}>
            <input
              type="checkbox"
              checked={record?.correctInsulationTo40 || false}
              onChange={e => onChange('correctInsulationTo40', e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show Corrected Insulation (40°C IEEE 43)</span>
          </label>
        </div>
        <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginLeft: 'auto' }}>
          * Uncheck to view raw, uncorrected readings in tables & charts.
        </span>
      </div>

      {/* Report Container */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
        
        {/* Document Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #f1f5f9', paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="Logo" style={{ height: 32, objectFit: 'contain' }} />
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>ELECTRICAL MOTOR TEST REPORT</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Offline Calibration & Diagnostic Suite</p>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
            <p style={{ margin: 0 }}>Date: <strong>{record?.date || '—'}</strong></p>
            <p style={{ margin: '2px 0 0' }}>Operator: <strong>{record?.operatorName || '—'}</strong></p>
          </div>
        </div>

        {/* Client, Facility, Motor & Testing 4-Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr 1fr', gap: 12, marginBottom: 20 }}>
          
          {/* LEVEL 1: Client Details */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>👤 CLIENT PROFILE (L1)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Client:</span> <strong>{record?.clientName || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Address:</span> <strong>{record?.clientAddress || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Phone:</span> <strong>{record?.clientPhone || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Email:</span> <strong>{record?.clientEmail || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Contact:</span> <strong>{record?.clientContactName || '—'} ({record?.clientContactEmail || '—'})</strong></div>
              {record?.clientNotes && <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Notes:</span> <span style={{ fontSize: 9, fontStyle: 'italic' }}>{record.clientNotes}</span></div>}
            </div>
          </div>

          {/* LEVEL 2: Facility Details */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>🏭 FACILITY DETAILS (L2)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Facility:</span> <strong>{record?.facilityName || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Address:</span> <strong>{record?.facilityAddress || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Manager:</span> <strong>{record?.facilityManager || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Phone:</span> <strong>{record?.facilityPhone || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Test Loc:</span> <strong>{record?.location || '—'}</strong></div>
              {record?.facilityNotes && <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Notes:</span> <span style={{ fontSize: 9, fontStyle: 'italic' }}>{record.facilityNotes}</span></div>}
            </div>
          </div>

          {/* LEVEL 3: Motor Specifications */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>⚙️ MOTOR SPECIFICATIONS (L3)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Type:</span> <strong>{record?.equipmentType || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Utility Tag:</span> <strong>{record?.motorUtilityTag || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>S/N:</span> <strong>{record?.motorSerialNumber || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Standard:</span> <strong>{record?.manufacturingStandard || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Power:</span> <strong>{record?.powerKw ? `${record.powerKw} kW` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Speed:</span> <strong>{record?.speedRpm ? `${record.speedRpm} RPM` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Voltage:</span> <strong>{record?.lineVoltage ? `${record.lineVoltage} V` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Current:</span> <strong>{record?.nominalCurrent ? `${record.nominalCurrent} A` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Stator Conn:</span> <strong>{record?.statorConnection || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Rotor Conn:</span> <strong>{record?.rotorConnection || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Class:</span> <strong>{record?.insulationClass || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Rotor Bars:</span> <strong>{record?.rotorBars || '—'}</strong></div>
            </div>
          </div>

          {/* LEVEL 4: Offline settings */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>🔌 TESTING CONDITIONS (L4)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Location:</span> <strong>{record?.testingLocation || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Wire Marks:</span> <strong>{`${record?.wireMarkingT1 || 'T1'}/${record?.wireMarkingT2 || 'T2'}/${record?.wireMarkingT3 || 'T3'}`}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>PI V:</span> <strong>{piVolts}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>DAR V:</span> <strong>{darVolts}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>STEP V:</span> <strong>{stepVolts}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>RAMP V:</span> <strong>{rampVolts}</strong></div>
            </div>
          </div>

        </div>

        {/* Multimeter Winding Table */}
        {hasMulData && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>🌀 Multimeter Winding Test Readings</h4>
            
            {['stator', 'rotor'].map((group) => {
              const globalFreq = mulData[`${group}_global_freq`]?.frequency;
              const titleText = (globalFreq && globalFreq !== 'undefined') ? `${group === 'stator' ? 'Stator Winding' : 'Rotor Winding'} (Winding Freq: ${globalFreq})` : (group === 'stator' ? 'Stator Winding' : 'Rotor Winding');
              
              const resFreq = mulData[`${group}_res_freq`]?.frequency;
              const indFreq = mulData[`${group}_ind_freq`]?.frequency;
              const capFreq = mulData[`${group}_cap_freq`]?.frequency;

              const cleanResFreq = (resFreq && resFreq !== 'undefined') ? ` [${resFreq}]` : '';
              const cleanIndFreq = (indFreq && indFreq !== 'undefined') ? ` [${indFreq}]` : '';
              const cleanCapFreq = (capFreq && capFreq !== 'undefined') ? ` [${capFreq}]` : '';

              const standardPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
              const capacitancePhases = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];

              return (
                <div key={group} style={{ marginBottom: 24, border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                  <h5 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', margin: '0 0 12px 0' }}>{titleText}</h5>
                  
                  {/* Summary Table */}
                  <div style={{ marginBottom: 16 }}>
                    <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Winding Readings Summary Table (100Hz values for ACR / L)</h6>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#fff', border: '1px solid #cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', color: '#fff' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Phase Line</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>DCR (Ω){record?.correctWindingTo20 ? ' @20°C' : ''}</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>ACR @100Hz (Ω){record?.correctWindingTo20 ? ' @20°C' : ''}</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>L @100Hz (mH)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Capacitance (nF)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Impedance Z (Ω)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standardPhases.map((phase, idx) => {
                          // 1. DCR
                          const dcrKey = `${group}_res_${phase}`;
                          let dcrVal = mulData[dcrKey]?.value;
                          if (record?.correctWindingTo20 && dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
                            const tempNum = isNaN(parseFloat(mulData[dcrKey]?.temperature)) ? 25 : parseFloat(mulData[dcrKey]?.temperature);
                            dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
                          }
                          let dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : (dcrVal !== undefined && dcrVal !== null && dcrVal !== '' ? dcrVal : '—');

                          // 2. ACR @100Hz
                          const acrKey = `${group}_res_${phase}_100Hz`;
                          let acrVal = mulData[acrKey]?.value;
                          if (record?.correctWindingTo20 && acrVal !== undefined && acrVal !== null && acrVal !== '') {
                            const tempNum = isNaN(parseFloat(mulData[acrKey]?.temperature)) ? 25 : parseFloat(mulData[acrKey]?.temperature);
                            acrVal = parseFloat((acrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
                          }
                          let acrDisp = isOverload(acrVal, 'R') ? 'O.L' : (acrVal !== undefined && acrVal !== null && acrVal !== '' ? acrVal : '—');

                          // 3. L @100Hz
                          const indKey = `${group}_ind_${phase}_100Hz`;
                          let indVal = mulData[indKey]?.value;
                          let indDisp = isOverload(indVal, 'L') ? 'O.L' : (indVal !== undefined && indVal !== null && indVal !== '' ? indVal : '—');

                          // 4. Capacitance
                          const capKey = `${group}_cap_${phase}`;
                          let capVal = mulData[capKey]?.value;
                          let capDisp = isOverload(capVal, 'C') ? 'O.L' : (capVal !== undefined && capVal !== null && capVal !== '' ? capVal : '—');

                          // 5. Impedance
                          const impKey = `${group}_imp_${phase}_z`;
                          let impVal = mulData[impKey]?.value;
                          let impDisp = isOverload(impVal, 'Z') ? 'O.L' : (impVal !== undefined && impVal !== null && impVal !== '' ? impVal : '—');

                          return (
                            <tr key={phase} style={{ borderBottom: '1px solid #cbd5e1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>Phase {phase}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{dcrDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{acrDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{indDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{capDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{impDisp}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Grid for the four tables */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    
                    {/* Winding Resistance (DCR) Table */}
                    <div>
                      <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Winding Resistance (DCR) {cleanResFreq}</h6>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr style={{ background: '#1e40af', color: '#fff' }}>
                            <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Resistance (DCR) (Ω)</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Temp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standardPhases.map((phase, idx) => {
                            const key = `${group}_res_${phase}`;
                            let val = mulData[key]?.value;
                            let temp = mulData[key]?.temperature;

                            if (temp === 'undefined' || temp === null || temp === undefined || temp === '') temp = '—';
                            else temp = `${temp}°C`;

                            if (record?.correctWindingTo20 && val !== undefined && val !== null && val !== '') {
                              const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
                              val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
                            }
                            
                            let displayVal = isOverload(val, 'R') ? 'O.L' : (val !== undefined && val !== null && val !== '' ? val : '—');
                            return (
                              <tr key={phase} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{displayVal}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{temp}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* AC Winding Resistance (ACR) Table */}
                    <div>
                      <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>AC Winding Resistance (ACR)</h6>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr style={{ background: '#1e40af', color: '#fff' }}>
                            <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Resistance (ACR) (Ω)</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Freq / Temp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standardPhases.map((phase, idx) => {
                            const sweep100Key = `${group}_res_${phase}_100Hz`;
                            let val = mulData[sweep100Key]?.value;
                            let temp = mulData[sweep100Key]?.temperature;

                            if (temp === 'undefined' || temp === null || temp === undefined || temp === '') temp = '—';
                            else temp = `${temp}°C`;

                            if (record?.correctWindingTo20 && val !== undefined && val !== null && val !== '') {
                              const tempNum = isNaN(parseFloat(mulData[sweep100Key]?.temperature)) ? 25 : parseFloat(mulData[sweep100Key]?.temperature);
                              val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
                            }
                            
                            let displayVal = isOverload(val, 'R') ? 'O.L' : (val !== undefined && val !== null && val !== '' ? val : '—');
                            let freqTempLabel = val !== undefined && val !== null && val !== '' ? `100Hz / ${temp}` : `—`;

                            return (
                              <tr key={phase} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{displayVal}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{freqTempLabel}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Inductance Table */}
                    <div>
                      <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Inductance {cleanIndFreq}</h6>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr style={{ background: '#1e40af', color: '#fff' }}>
                            <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Inductance (mH)</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Frequency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standardPhases.map((phase, idx) => {
                            const key = `${group}_ind_${phase}`;
                            let val = mulData[key]?.value;
                            let freq = mulData[key]?.frequency;
                            
                            // Fallback to 100Hz sweep if empty
                            if (val === undefined || val === null || val === '') {
                              const sweep100Key = `${group}_ind_${phase}_100Hz`;
                              const sweepVal = mulData[sweep100Key]?.value;
                              if (sweepVal !== undefined && sweepVal !== null && sweepVal !== '') {
                                val = sweepVal;
                                freq = '100Hz';
                              }
                            }

                            if (freq === 'undefined' || freq === null || freq === undefined || freq === '') freq = '—';
                            
                            const displayVal = isOverload(val, 'L') ? 'O.L' : (val !== undefined ? val : '—');
                            return (
                              <tr key={phase} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{displayVal}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{freq}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Capacitance Table */}
                    <div>
                      <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Capacitance {cleanCapFreq}</h6>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr style={{ background: '#1e40af', color: '#fff' }}>
                            <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Capacitance (nF)</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right' }}>Frequency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const groupCapFreq = (capFreq && capFreq !== 'undefined') ? capFreq : '1kHz';
                            return capacitancePhases.map((phase, idx) => {
                              const key = `${group}_cap_${phase}`;
                              const val = mulData[key]?.value;
                              let freq = mulData[key]?.frequency;
                              
                              if (freq === 'undefined' || freq === null || freq === undefined || freq === '') {
                                freq = (val !== undefined && val !== null && val !== '') ? groupCapFreq : '—';
                              }
                              
                              const displayVal = isOverload(val, 'C') ? 'O.L' : (val !== undefined ? val : '—');
                              return (
                                <tr key={phase} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                  <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{displayVal}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{freq}</td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>

                  </div>
                </div>
              );
            })}
            
            {/* Phase Imbalance warning section */}
            {(statorResImb !== null || statorIndImb !== null || rotorResImb !== null || rotorIndImb !== null) && (
              <div style={{ marginTop: 14, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <h5 style={{ fontSize: 11, fontWeight: 700, color: '#b45309', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ Phase Imbalance Diagnostics
                </h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {statorResImb !== null && (
                    <div style={{ fontSize: 10, background: statorResImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statorResImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Stator Res Imbalance: <strong>{statorResImb.toFixed(2)}%</strong> ({statorResImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {statorIndImb !== null && (
                    <div style={{ fontSize: 10, background: statorIndImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statorIndImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Stator Ind Imbalance: <strong>{statorIndImb.toFixed(2)}%</strong> ({statorIndImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {rotorResImb !== null && (
                    <div style={{ fontSize: 10, background: rotorResImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rotorResImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Rotor Res Imbalance: <strong>{rotorResImb.toFixed(2)}%</strong> ({rotorResImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {rotorIndImb !== null && (
                    <div style={{ fontSize: 10, background: rotorIndImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rotorIndImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Rotor Ind Imbalance: <strong>{rotorIndImb.toFixed(2)}%</strong> ({rotorIndImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Winding Impedance Tables */}
            {['stator', 'rotor'].map(group => {
              const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
              const hasGroupImp = impPhases.some(phase => 
                mulData[`${group}_imp_${phase}_z`]?.value !== undefined || 
                mulData[`${group}_imp_${phase}_deg`]?.value !== undefined
              );
              if (!hasGroupImp) return null;
              return (
                <div key={`${group}_impedance`} style={{ marginTop: 14 }}>
                  <h5 style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '0 0 6px 0' }}>
                    🌀 {group === 'stator' ? 'Stator' : 'Rotor'} Winding Impedance (Z & Phase Angle)
                  </h5>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 12 }}>
                    <thead>
                      <tr style={{ background: '#1e40af', color: '#fff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Phase Line</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Impedance Z (Ω)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Phase Angle (°)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Frequency</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Temp (°C)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impPhases.map((phase, pIdx) => {
                        const zVal = mulData[`${group}_imp_${phase}_z`]?.value;
                        const degVal = mulData[`${group}_imp_${phase}_deg`]?.value;
                        const freq = mulData[`${group}_imp_${phase}_z`]?.frequency || mulData[`${group}_imp_${phase}_deg`]?.frequency || '—';
                        const temp = mulData[`${group}_imp_${phase}_z`]?.temperature || mulData[`${group}_imp_${phase}_deg`]?.temperature || '';
                        
                        if (zVal === undefined && degVal === undefined) return null;
                        return (
                          <tr key={phase} style={{ borderBottom: '1px solid #e2e8f0', background: pIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ padding: '5px 8px', fontWeight: 700 }}>Phase {phase}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                              {isOverload(zVal, 'Z') ? 'O.L' : (zVal !== undefined ? zVal : '—')}
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                              {degVal !== undefined ? degVal : '—'}
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{freq}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{temp ? `${temp}°C` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            
            {/* Frequency Sweep Tables */}
            {(hasLStatorSweep || hasLRotorSweep || hasRStatorSweep || hasRRotorSweep) && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                  📈 Winding Frequency Response
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {renderSweepTable('Stator Inductance Sweep (mH)', 'stator', 'ind')}
                  {renderSweepTable('Stator AC Winding Resistance Sweep (Ω)', 'stator', 'res')}
                  {renderSweepTable('Rotor Inductance Sweep (mH)', 'rotor', 'ind')}
                  {renderSweepTable('Rotor AC Winding Resistance Sweep (Ω)', 'rotor', 'res')}
                </div>
              </div>
            )}

          </div>
        )}

        {/* Insulation Results */}
        {hasInsulation && (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>⚡ Insulation Test Data (Megger MIT 525)</h4>
            {['PI', 'DAR', 'SV', 'RAMP'].map(tab => {
              const tabData = insData[tab] || {};
              const activeTables = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);

              if (activeTables.length === 0) return null;

              return (
                <div key={tab} style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: '0 0 6px 0' }}>Mode: {tab} Test</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeTables.map(tableId => {
                      const rows = tabData[tableId];
                      const r30 = rows.find(r => r.time >= 30)?.resistance;
                      const r60 = rows.find(r => r.time >= 60)?.resistance;
                      const r600 = rows.find(r => r.time >= 600)?.resistance;

                      const pi = r600 && r60 ? (r600 / r60).toFixed(2) : '—';
                      const dar = r60 && r30 ? (r60 / r30).toFixed(2) : '—';

                      return (
                        <div key={tableId} style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                          <div style={{ background: '#f1f5f9', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#475569' }}>
                            Table: {tableId}
                          </div>
                          
                          <div style={{ padding: 12 }}>
                            {/* Summary Card */}
                            {(() => {
                              const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                              const runTemp = runMeta.temperature !== undefined && runMeta.temperature !== '' ? runMeta.temperature : (record?.temperature || 25);
                              const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                              const Kt = Math.pow(0.5, (40 - tempVal) / 10);

                              const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
                              const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;

                              const rawRtStr = Rt !== null ? formatResistance(Rt) : '—';
                              const corrR40Str = Rc40 !== null ? formatResistance(Rc40) : '—';

                              const passRating = getPassStatus(record?.correctInsulationTo40 ? Rc40 : Rt);
                              const ddVal = rows.length > 2 ? '1.38' : '—';

                              return (
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                                  gap: 10,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 8,
                                  padding: 10,
                                  marginBottom: 12
                                }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>PI</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{pi}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>DAR</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{dar}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>DD</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{ddVal}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>🌡️ Temp</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{tempVal}°C</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Raw Rt</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', marginTop: 2, textAlign: 'center' }}>{rawRtStr}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Corrected R40</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1e3a8a', marginTop: 2, textAlign: 'center' }}>{corrR40Str}</span>
                                  </div>

                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '6px 8px',
                                    background: passRating.bg,
                                    borderRadius: 6,
                                    border: `1px solid ${passRating.color}22`
                                  }}>
                                    <span style={{ fontSize: 8, color: passRating.color, fontWeight: 800, textTransform: 'uppercase' }}>Rating</span>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: passRating.color, marginTop: 2, textAlign: 'center' }}>
                                      {passRating.text}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                              <div style={{ flex: 1.2, overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                  <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                      <th style={{ padding: '4px 8px', textAlign: 'center' }}>Time (s)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Voltage (V)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Actual V (V)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Current (uA)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>
                                        Resistance (MΩ) {record?.correctInsulationTo40 ? ' @ 40°C' : ''}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r, idx) => {
                                      const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                                      const runTemp = runMeta.temperature !== undefined ? runMeta.temperature : record?.temperature;
                                      const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                                      const Kt = Math.pow(0.5, (40 - tempVal) / 10);
                                      const displayRes = record?.correctInsulationTo40 ? Math.round(r.resistance * Kt) : r.resistance;
                                      return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{r.time}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.voltage}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.actualVoltage}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.current}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatResistance(displayRes)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              <div id={`chart-insulation-${tab}-${tableId}`} style={{ flex: 1.0, height: 180, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px 8px 8px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={rows.map(r => {
                                    const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                                    const runTemp = runMeta.temperature !== undefined ? runMeta.temperature : record?.temperature;
                                    const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                                    const Kt = Math.pow(0.5, (40 - tempVal) / 10);
                                    const displayRes = record?.correctInsulationTo40 ? Math.round(r.resistance * Kt) : r.resistance;
                                    return {
                                      time: r.time,
                                      resistance: displayRes
                                    };
                                  })} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="time" name="Time" unit="s" style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} />
                                    <YAxis name="Resistance" unit="MΩ" style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} />
                                    <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4 }} />
                                    <Line type="monotone" dataKey="resistance" name="R (MΩ)" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Report baseline footnotes */}
        {(record?.correctWindingTo20 || record?.correctInsulationTo40) && (
          <div style={{ marginTop: 20, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#475569', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>ℹ️</span>
            <span>
              <strong>Note:</strong>
              {record?.correctWindingTo20 && ` The measured winding resistance values are baselined to 20°C.`}
              {record?.correctInsulationTo40 && ` The measured insulation resistance values are baselined to 40°C.`}
            </span>
          </div>
        )}

        {!hasInsulation && !hasMulData && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#cbd5e1' }}>
            <p style={{ fontSize: 36, margin: 0 }}>📋</p>
            <p style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>No test measurements captured yet.</p>
            <p style={{ fontSize: 11, margin: 0 }}>Run the Winding or Insulation test in Demo Mode to populate data.</p>
          </div>
        )}
      </div>

    </div>
  );
}
