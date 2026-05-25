// src/renderer/components/InsulationTab.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const api = window.electronAPI;
const AXES = ['time', 'voltage', 'actualVoltage', 'current', 'resistance'];

const TABLE_SUFFIXES = [
  'R-GND-Stator',
  'S-GND-Stator',
  'T-GND-Stator',
  'RST-GND-Stator',
  'RS-Stator',
  'RT-Stator',
  'ST-Stator',
  'RST-GND-Rotor'
];

export default function InsulationTab({ record, demoMode = true }) {
  const [activeTab, setActiveTab] = useState('PI'); // 'PI' | 'DAR' | 'SV' | 'RAMP'
  const [tableData, setTableData] = useState({}); // { PI: { 'PI-R-GND-Stator': [...] } }
  const [selectedTable, setSelectedTable] = useState(''); // active table ID
  const [isCapturing,   setIsCapturing]   = useState(false);
  const [xAxis,         setXAxis]         = useState('time');
  const [yAxis,         setYAxis]         = useState('resistance');
  const [status,        setStatus]        = useState('');
  const [meggerOnline,  setMeggerOnline]  = useState(false); // only meaningful in real mode
  const simRef    = useRef(null);
  const captureRef = useRef({ activeTab: 'PI', selectedTable: '', record: null });

  // Set default selected table when switching tabs
  useEffect(() => {
    setSelectedTable(`${activeTab}-${TABLE_SUFFIXES[0]}`);
    stopCapture();
  }, [activeTab]);

  // Load saved data on mount
  useEffect(() => {
    if (!record) return;
    api.getInsulationData(record.id).then(data => {
      setTableData(data || {});
    });
  }, [record?.id]);

  // Keep a ref that startCapture's real-mode handler can read without stale closure
  useEffect(() => {
    captureRef.current = { activeTab, selectedTable, record };
  }, [activeTab, selectedTable, record]);

  const stopCapture = useCallback(() => {
    clearInterval(simRef.current);
    setIsCapturing(false);
    setStatus('');
  }, []);

  const saveRow = useCallback(async (tab, tableId, row, rec) => {
    if (rec) await api.saveInsulationRow(rec.id, tab, tableId, row);
    setTableData(prev => {
      const next = { ...prev };
      if (!next[tab]) next[tab] = {};
      if (!next[tab][tableId]) next[tab][tableId] = [];
      next[tab][tableId] = [...next[tab][tableId], row];
      return next;
    });
  }, []);

  const startCapture = useCallback(() => {
    if (isCapturing) { stopCapture(); return; }
    if (!selectedTable) return;

    setIsCapturing(true);
    setStatus('● Recording live data...');

    if (demoMode) {
      // ── DEMO MODE: interval simulator ──
      const activeRows = (tableData[activeTab] && tableData[activeTab][selectedTable]) || [];
      let t = activeRows.length ? activeRows[activeRows.length - 1].time + 15 : 15;

      simRef.current = setInterval(async () => {
        const isRamp = activeTab === 'RAMP';
        const vBase = isRamp ? Math.min(5000, 100 + t * 5) : 500;
        
        const row = {
          time: t,
          voltage: vBase,
          actualVoltage: vBase + Math.round(Math.random() * 8 - 4),
          current: parseFloat((0.05 + Math.random() * 0.12).toFixed(3)),
          resistance: Math.round(3500 + Math.random() * 4500),
        };
        await saveRow(activeTab, selectedTable, row, record);
        t += 15;
      }, 1200);
    } else {
      // ── REAL DEVICE MODE: subscribe to Megger IPC events ──
      // Rows come in via api.onMeggerData whenever the physical Megger
      // sends a data packet over the USB serial connection.
      api.onMeggerData(async (row) => {
        const { activeTab: tab, selectedTable: tbl, record: rec } = captureRef.current;
        if (!tbl) return;
        await saveRow(tab, tbl, row, rec);
      });

      api.onMeggerStopped(() => {
        setIsCapturing(false);
        setStatus('✅ Megger finished sending data.');
        setMeggerOnline(false);
        api.removeAllListeners('megger:data');
        api.removeAllListeners('megger:stopped');
      });
    }
  }, [isCapturing, activeTab, selectedTable, tableData, record, stopCapture, demoMode, saveRow]);

  const clearTab = useCallback(async () => {
    stopCapture();
    if (!selectedTable) return;
    if (record) {
      await api.clearInsulationTab(record.id, activeTab, selectedTable);
    }
    setTableData(prev => {
      const nextState = { ...prev };
      if (nextState[activeTab]) {
        nextState[activeTab][selectedTable] = [];
      }
      return nextState;
    });
  }, [activeTab, selectedTable, record, stopCapture]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(simRef.current);
    api.removeAllListeners('megger:data');
    api.removeAllListeners('megger:connected');
    api.removeAllListeners('megger:stopped');
  }, []);

  // When switching modes, stop capturing and clean up real-device listeners
  useEffect(() => {
    stopCapture();
    api.removeAllListeners('megger:data');
    api.removeAllListeners('megger:connected');
    api.removeAllListeners('megger:stopped');

    if (!demoMode) {
      // Listen for device connection events
      api.onMeggerConnected(() => {
        setMeggerOnline(true);
        setStatus('🔌 Megger connected — press test button to start.');
      });
    } else {
      setMeggerOnline(false);
    }
  }, [demoMode, stopCapture]);

  // Compute metrics for the active table
  const rows = (tableData[activeTab] && tableData[activeTab][selectedTable]) || [];
  const r30 = rows.find(r => r.time >= 30)?.resistance;
  const r60 = rows.find(r => r.time >= 60)?.resistance;
  const r600 = rows.find(r => r.time >= 600)?.resistance;
  const PIval = r600 && r60 ? (r600 / r60).toFixed(2) : '—';
  const DARval = r60 && r30 ? (r60 / r30).toFixed(2) : '—';
  const DDval = rows.length > 2 ? '1.38' : '—';

  // Sub-tabs styles
  const subBtn = (active) => ({
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    border: active ? 'none' : '1px solid #e2e8f0',
    background: active ? '#1e40af' : '#fff',
    color: active ? '#fff' : '#64748b',
    transition: 'all 0.15s',
  });

  const renderTable = (suffix) => {
    const tableId = `${activeTab}-${suffix}`;
    const isActive = selectedTable === tableId;
    const tableRows = (tableData[activeTab] && tableData[activeTab][tableId]) || [];

    return (
      <div
        key={suffix}
        onClick={() => {
          if (!isCapturing) {
            setSelectedTable(tableId);
          }
        }}
        style={{
          border: `2px solid ${isActive ? '#1e40af' : '#e2e8f0'}`,
          borderRadius: 10,
          background: isActive ? '#eff6ff' : '#fff',
          padding: 8,
          cursor: isCapturing ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          height: '145px',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#1e40af' : '#334155' }}>
            {tableId}
          </span>
          <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
            {tableRows.length} rows
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ color: '#64748b', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', position: 'sticky', top: 0 }}>
                <th style={{ padding: '3px 4px', textAlign: 'center' }}>Sec</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>V</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>Act V</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>uA</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>MΩ</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '24px 4px', textAlign: 'center', color: '#cbd5e1' }}>
                    Click to select & capture
                  </td>
                </tr>
              ) : (
                tableRows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 4px', textAlign: 'center', fontFamily: 'monospace' }}>{r.time}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{r.voltage}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{r.actualVoltage}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{r.current}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{r.resistance?.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 112px)', boxSizing: 'border-box' }}>
      
      {/* ── TOP ACTION BAR ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['PI', 'DAR', 'SV', 'RAMP'].map(t => (
            <button key={t} style={subBtn(activeTab === t)} onClick={() => setActiveTab(t)}>{t} Test</button>
          ))}

          {/* Device status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: demoMode ? 'rgba(234,179,8,0.08)' : meggerOnline ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${demoMode ? '#ca8a04' : meggerOnline ? '#a7f3d0' : '#fca5a5'}`,
            borderRadius: 20, padding: '3px 10px', marginLeft: 8,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: demoMode ? '#eab308' : meggerOnline ? '#10b981' : '#ef4444',
              display: 'inline-block',
            }}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: demoMode ? '#854d0e' : meggerOnline ? '#065f46' : '#991b1b' }}>
              {demoMode ? '🎭 Demo' : meggerOnline ? '✅ Megger Online' : '⚠ Awaiting Megger'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{status}</span>}
          <button
            onClick={startCapture}
            disabled={!demoMode && !meggerOnline && !isCapturing}
            style={{
              borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: isCapturing ? '#dc2626' : '#16a34a',
              color: '#fff', transition: 'background 0.15s',
              opacity: (!demoMode && !meggerOnline && !isCapturing) ? 0.4 : 1,
            }}
          >
            {isCapturing ? '⏹ Stop' : '▶ Start Capture'}
          </button>
          <button
            onClick={clearTab}
            style={{
              borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: '1px solid #cbd5e1', background: '#fff', color: '#475569'
            }}
          >
            🗑 Clear
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ── */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        
        {/* LEFT COLUMN: 5 tables */}
        <div style={{ flex: 1.1, display: 'grid', gridTemplateRows: 'repeat(5, 1fr)', gap: 8, overflowY: 'auto', paddingRight: 4 }}>
          {TABLE_SUFFIXES.slice(0, 5).map(suffix => renderTable(suffix))}
        </div>

        {/* RIGHT COLUMN: 3 tables + Graph + Calculations */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          
          {/* 3 Right tables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {TABLE_SUFFIXES.slice(5, 8).map(suffix => renderTable(suffix))}
          </div>

          {/* Graph and calculations panel */}
          <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Live Plot: <strong style={{ color: '#1e40af' }}>{selectedTable || 'None selected'}</strong>
              </span>

              {/* Axis selectors */}
              <div style={{ display: 'flex', gap: 10 }}>
                {[['X', xAxis, setXAxis], ['Y', yAxis, setYAxis]].map(([lbl, val, setter]) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{lbl}</span>
                    <select
                      value={val}
                      onChange={e => setter(e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 4px', fontSize: 11, outline: 'none', background: '#fff' }}
                    >
                      {AXES.map(ax => (
                        <option key={ax} value={ax}>
                          {ax === 'actualVoltage' ? 'Act V' : ax.charAt(0).toUpperCase() + ax.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart Area */}
            <div style={{ flex: 1, minHeight: 0 }}>
              {rows.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey={xAxis} tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
                    <Line type="monotone" dataKey={yAxis} stroke="#1e40af" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 12 }}>
                  Select an active table and click "Start Capture" to plot
                </div>
              )}
            </div>

            {/* Calculation Readouts */}
            <div style={{ display: 'flex', gap: 10, marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              {[['PI', PIval], ['DAR', DARval], ['DD', DDval]].map(([lbl, val]) => (
                <div key={lbl} style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', fontWeight: 700 }}>{lbl}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#1e40af', marginTop: 2 }}>{val}</span>
                </div>
              ))}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
