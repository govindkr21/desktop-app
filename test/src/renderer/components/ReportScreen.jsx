// src/renderer/components/ReportScreen.jsx
import { useState, useEffect } from 'react';
import logo from '../../assets/logo.png';

const api = window.electronAPI;

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

  const handleExport = async (type) => {
    setExporting(type);
    setMessage(null);
    try {
      const result = type === 'Excel'
        ? await api.exportExcel(record.id)
        : await api.exportPDF(record.id);

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

  // Check if any insulation tables have data
  const hasInsulation = Object.values(insData).some(tabObj => 
    tabObj && Object.values(tabObj).some(arr => arr && arr.length > 0)
  );

  // Check if any multimeter values exist
  const hasMulData = Object.keys(mulData).length > 0;

  const msgColor = message?.type === 'success' ? { bg: '#f0fdf4', border: '#86efac', text: '#166534' }
                 : message?.type === 'error'   ? { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' }
                 :                               { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };

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
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>PI/DAR V:</span> <strong>{record?.testVoltagePiDar || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>STEP V:</span> <strong>{record?.testVoltageStep || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>RAMP V:</span> <strong>{record?.testVoltageRamp || '—'}</strong></div>
            </div>
          </div>

        </div>

        {/* Multimeter Winding Table */}
        {hasMulData && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>🌀 Winding Resistance, Inductance & Capacitance</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#1e40af', color: '#fff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Winding Group</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Phase Line</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>
                    Resistance (Ω) {record?.correctWindingTo20 ? ' @ 20°C' : ''}
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Inductance (mH)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Capacitance (nF)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Temp (°C)</th>
                </tr>
              </thead>
              <tbody>
                {['stator', 'rotor'].map((group, gIdx) => {
                  const phases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N', '123-GND', '1-GND', '2-GND', '3-GND'];
                  return phases.map((phase, pIdx) => {
                    const rValRaw = mulData[`${group}_res_${phase}`]?.value;
                    const iVal = mulData[`${group}_ind_${phase}`]?.value;
                    const cVal = mulData[`${group}_cap_${phase}`]?.value;
                    const temp = mulData[`${group}_res_${phase}`]?.temperature || mulData[`${group}_ind_${phase}`]?.temperature || mulData[`${group}_cap_${phase}`]?.temperature || 25;

                    let rVal = rValRaw;
                    if (record?.correctWindingTo20 && rValRaw !== undefined) {
                      const tempNum = isNaN(parseFloat(temp)) ? 25 : parseFloat(temp);
                      rVal = parseFloat((rValRaw * (254.5 / (234.5 + tempNum))).toFixed(3));
                    }

                    if (rValRaw === undefined && iVal === undefined && cVal === undefined) return null;

                    return (
                      <tr key={`${group}_${phase}`} style={{ borderBottom: '1px solid #e2e8f0', background: pIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, color: '#475569' }}>
                          {pIdx === 0 ? (group === 'stator' ? 'Stator Winding' : 'Rotor Winding') : ''}
                        </td>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>Phase {phase}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{rVal !== undefined ? rVal : '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{iVal !== undefined ? iVal : '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{cVal !== undefined ? cVal : '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{temp ? `${temp}°C` : '—'}</td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
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
                        <div key={tableId} style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ background: '#f1f5f9', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Table: {tableId}</span>
                            <span>Calculated: PI={pi}  |  DAR={dar}  |  DD=1.38</span>
                          </div>
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
                                const tempVal = isNaN(parseFloat(record?.temperature)) ? 25 : parseFloat(record?.temperature);
                                const Kt = Math.pow(0.5, (40 - tempVal) / 10);
                                const displayRes = record?.correctInsulationTo40 ? Math.round(r.resistance * Kt) : r.resistance;
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{r.time}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.voltage}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.actualVoltage}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.current}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{displayRes?.toLocaleString()}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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
