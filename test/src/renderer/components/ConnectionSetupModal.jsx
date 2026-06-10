// src/renderer/components/ConnectionSetupModal.jsx
import { useState, useEffect } from 'react';

const api = window.electronAPI;

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const sel = {
  border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px',
  fontSize: 12, outline: 'none', background: '#fff', color: '#1e293b', width: '100%',
};
const inp = {
  border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px',
  fontSize: 12, outline: 'none', background: '#fff', color: '#1e293b', width: '100%',
  boxSizing: 'border-box',
};
const label = {
  fontSize: 10, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4, letterSpacing: '0.3px'
};

const cardStyle = {
  flex: 1,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  minWidth: 0,
};

const RAW_LOG_MAX = 80;

function RawSerialLog({ title, lines, onClear }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onClear}
          style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
      <div style={{
        height: 120, overflowY: 'auto', background: '#0f172a', borderRadius: 6,
        padding: '6px 8px', fontFamily: 'Consolas, Monaco, monospace', fontSize: 10,
        lineHeight: 1.45, color: '#86efac', border: '1px solid #334155',
      }}>
        {lines.length === 0 ? (
          <span style={{ color: '#64748b' }}>Waiting for serial data…</span>
        ) : (
          lines.map((entry, i) => (
            <div key={`${entry.ts}-${i}`} style={{ marginBottom: 2, wordBreak: 'break-all' }}>
              <span style={{ color: '#94a3b8' }}>[{entry.ts}] </span>
              SERIAL: {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ConnectionSetupModal({
  meggerStatus, setMeggerStatus,
  meggerPort, setMeggerPort,
  multimeterStatus, setMultimeterStatus,
  multimeterPort, setMultimeterPort,
  onCancel,
  setDemoMode
}) {
  const [ports, setPorts] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [errorMegger, setErrorMegger] = useState('');
  const [errorMulti, setErrorMulti] = useState('');
  const [meggerRawLines, setMeggerRawLines] = useState([]);
  const [multiRawLines, setMultiRawLines] = useState([]);

  // Helper to parse TCP string like "TCP://192.168.1.50:5000"
  const parseTcpString = (str) => {
    if (str && str.startsWith('TCP://')) {
      const parts = str.slice(6).split(':');
      return { host: parts[0], port: parseInt(parts[1]) || 5000 };
    }
    return { host: '127.0.0.1', port: 5000 };
  };

  const meggerTcp = parseTcpString(meggerPort);
  const multiTcp = parseTcpString(multimeterPort);

  // Megger configurations
  const [mConnType, setMConnType] = useState(meggerPort && meggerPort.startsWith('TCP://') ? 'tcp' : 'serial');
  const [mPort, setMPort] = useState(meggerPort && !meggerPort.startsWith('TCP://') ? meggerPort : 'COM3');
  const [mBaud, setMBaud] = useState(38400);
  const [mHost, setMHost] = useState(meggerTcp.host);
  const [mTcpPort, setMTcpPort] = useState(meggerTcp.port);

  // Multimeter configurations
  const [uConnType, setUConnType] = useState(multimeterPort && multimeterPort.startsWith('TCP://') ? 'tcp' : 'serial');
  const [uPort, setUPort] = useState(multimeterPort && !multimeterPort.startsWith('TCP://') ? multimeterPort : 'COM4');
  const [uBaud, setUBaud] = useState(9600);
  const [uHost, setUHost] = useState(multiTcp.host);
  const [uTcpPort, setUTcpPort] = useState(multiTcp.port);

  // Scan available COM ports on mount
  useEffect(() => {
    scanPorts();
  }, []);

  function appendRawLine(setter, chunk) {
    const ts = new Date().toLocaleTimeString();
    setter(prev => [...prev.slice(-(RAW_LOG_MAX - 1)), { ts, text: chunk }]);
  }

  useEffect(() => {
    api.onMeggerRaw((chunk) => appendRawLine(setMeggerRawLines, chunk));
    api.onMultimeterRaw((chunk) => appendRawLine(setMultiRawLines, chunk));
    return () => {
      api.removeAllListeners('megger:raw');
      api.removeAllListeners('multimeter:raw');
    };
  }, []);

  async function scanPorts() {
    setScanning(true);
    try {
      const result = await api.listSerialPorts();
      if (result.success) {
        const activePorts = result.ports || [];
        setPorts(activePorts);
        if (activePorts.length > 0) {
          const firstPort = activePorts[0].path;
          // Set defaults if currently empty and selected port is not in list of active ports
          if (!meggerPort && !activePorts.some(p => p.path === mPort)) {
            setMPort(firstPort);
          }
          if (!multimeterPort && !activePorts.some(p => p.path === uPort)) {
            setUPort(firstPort);
          }
        }
      }
    } catch (e) {
      console.error('Scan failed:', e.message);
    }
    setScanning(false);
  }

  // --- Megger Connection Handlers ---
  async function connectMeggerDevice(customOpts = null) {
    setErrorMegger('');
    setMeggerStatus('connecting');
    
    const type = customOpts ? customOpts.type : mConnType;
    const portPath = customOpts ? customOpts.portPath : mPort;
    const baudRate = customOpts ? customOpts.baudRate : mBaud;
    const host = customOpts ? customOpts.host : mHost;
    const port = customOpts ? customOpts.port : mTcpPort;

    try {
      let result;
      if (type === 'tcp') {
        if (!host || !port) {
          setErrorMegger('Enter valid TCP Host & Port.');
          setMeggerStatus('disconnected');
          return;
        }
        result = await api.connectMegger({ connectionType: 'tcp', host, port });
      } else {
        if (!portPath) {
          setErrorMegger('Please select a COM port.');
          setMeggerStatus('disconnected');
          return;
        }
        result = await api.connectMegger({ connectionType: 'serial', portPath, baudRate });
      }

      if (result.success) {
        const fullPort = type === 'tcp' ? `TCP://${host}:${port}` : portPath;
        setMeggerPort(fullPort);
        setDemoMode(false);
      } else {
        setErrorMegger(result.error || 'Connection failed.');
        setMeggerStatus('disconnected');
      }
    } catch (err) {
      setErrorMegger(err.message);
      setMeggerStatus('disconnected');
    }
  }

  // Closes app serial/TCP only — does not power off or stop a test on the Megger.
  async function disconnectMeggerDevice() {
    try {
      await api.disconnectMegger();
      setMeggerStatus('disconnected');
      setMeggerPort('');
    } catch (e) {
      setErrorMegger('Disconnect failed: ' + e.message);
    }
  }

  async function restartMeggerDevice() {
    await disconnectMeggerDevice();
    // Wait a brief period before reconnecting to let the COM port release
    setTimeout(() => {
      connectMeggerDevice();
    }, 400);
  }

  // --- Multimeter Connection Handlers ---
  async function connectMultimeterDevice(customOpts = null) {
    setErrorMulti('');
    setMultimeterStatus('connecting');

    const type = customOpts ? customOpts.type : uConnType;
    const portPath = customOpts ? customOpts.portPath : uPort;
    const baudRate = customOpts ? customOpts.baudRate : uBaud;
    const host = customOpts ? customOpts.host : uHost;
    const port = customOpts ? customOpts.port : uTcpPort;

    try {
      let result;
      if (type === 'tcp') {
        if (!host || !port) {
          setErrorMulti('Enter valid TCP Host & Port.');
          setMultimeterStatus('disconnected');
          return;
        }
        result = await api.connectMultimeter({ connectionType: 'tcp', host, port });
      } else {
        if (!portPath) {
          setErrorMulti('Please select a COM port.');
          setMultimeterStatus('disconnected');
          return;
        }
        result = await api.connectMultimeter({ connectionType: 'serial', portPath, baudRate });
      }

      if (result.success) {
        const fullPort = type === 'tcp' ? `TCP://${host}:${port}` : portPath;
        setMultimeterPort(fullPort);
        setDemoMode(false);
      } else {
        setErrorMulti(result.error || 'Connection failed.');
        setMultimeterStatus('disconnected');
      }
    } catch (err) {
      setErrorMulti(err.message);
      setMultimeterStatus('disconnected');
    }
  }

  async function disconnectMultimeterDevice() {
    try {
      await api.disconnectMultimeter();
      setMultimeterStatus('disconnected');
      setMultimeterPort('');
    } catch (e) {
      setErrorMulti('Disconnect failed: ' + e.message);
    }
  }

  async function restartMultimeterDevice() {
    await disconnectMultimeterDevice();
    setTimeout(() => {
      connectMultimeterDevice();
    }, 400);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
    }}>
      <div style={{
        background: '#f8fafc', borderRadius: 16, width: 860, maxHeight: '92vh',
        boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '1px solid #e2e8f0', overflow: 'hidden',
        display: 'flex', flexDirection: 'column'
      }}>

        {/* ── Modal Header ── */}
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>🔌 Unified Device Connection Setup</div>
            <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 3 }}>Configure and monitor physical test devices simultaneously</div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>×</button>
        </div>

        {/* ── Modal Body ── */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Shared Port Refresher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', borderRadius: 8, padding: '10px 14px', border: '1px solid #bfdbfe' }}>
            <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
              💡 Connect your serial/USB converters and click Refresh to scan local COM ports.
            </span>
            <button
              onClick={scanPorts}
              disabled={scanning}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid #cbd5e1', background: '#fff', color: '#475569',
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s'
              }}
            >
              {scanning ? '⏳ Scanning...' : '🔄 Refresh COM Ports'}
            </button>
          </div>

          {/* Cards Container */}
          <div style={{ display: 'flex', gap: 16 }}>

            {/* CARD 1: MEGGER */}
            <div style={cardStyle}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1e3a8a' }}>⚡ Megger (Insulation)</span>
                
                {/* Status indicator */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: meggerStatus === 'connected' ? '#ecfdf5' : meggerStatus === 'connecting' ? '#fffbeb' : '#f8fafc',
                  border: `1px solid ${meggerStatus === 'connected' ? '#a7f3d0' : meggerStatus === 'connecting' ? '#fde68a' : '#cbd5e1'}`,
                  borderRadius: 20, padding: '2px 8px',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: meggerStatus === 'connected' ? '#10b981' : meggerStatus === 'connecting' ? '#d97706' : '#64748b',
                    display: 'inline-block'
                  }}></span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: meggerStatus === 'connected' ? '#047857' : meggerStatus === 'connecting' ? '#b45309' : '#475569', textTransform: 'capitalize' }}>
                    {meggerStatus}
                  </span>
                </div>
              </div>

              {/* Connected details or controls */}
              {meggerStatus === 'connected' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#f0fdf4', borderRadius: 8, padding: '12px 10px', border: '1px solid #dcfce7' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Megger MIT 525 Active</span>
                    <span style={{ fontSize: 11, color: '#166534', fontFamily: 'monospace', fontWeight: 600 }}>Port: {meggerPort}</span>
                    <span style={{ fontSize: 10, color: '#166534', textAlign: 'center', lineHeight: 1.35 }}>
                      Disconnect only closes this app&apos;s link. The Megger keeps running.
                    </span>
                  </div>
                  <RawSerialLog
                    title="Live raw stream"
                    lines={meggerRawLines}
                    onClear={() => setMeggerRawLines([])}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: meggerStatus === 'connecting' ? 0.6 : 1, pointerEvents: meggerStatus === 'connecting' ? 'none' : 'auto' }}>
                  {/* Connection Type Toggles */}
                  <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    {[['serial', '🔌 USB Serial'], ['tcp', '🌐 TCP Client']].map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setMConnType(k)}
                        style={{
                          flex: 1, border: 'none', background: mConnType === k ? '#2563eb' : '#fff',
                          color: mConnType === k ? '#fff' : '#64748b', fontSize: 10, fontWeight: 700, padding: '6px 4px', cursor: 'pointer'
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>

                  {mConnType === 'serial' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={label}>COM Port</label>
                        <select value={mPort} onChange={e => setMPort(e.target.value)} style={sel}>
                          {ports.length === 0 && <option value="">No ports found</option>}
                          {ports.map(p => <option key={p.path} value={p.path}>{p.path} ({p.manufacturer || 'Generic'})</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={label}>Baud Rate</label>
                        <select value={mBaud} onChange={e => setMBaud(parseInt(e.target.value))} style={sel}>
                          {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 8 }}>
                      <div>
                        <label style={label}>IP Address</label>
                        <input type="text" value={mHost} onChange={e => setMHost(e.target.value)} style={inp} placeholder="127.0.0.1" />
                      </div>
                      <div>
                        <label style={label}>Port</label>
                        <input type="number" value={mTcpPort} onChange={e => setMTcpPort(parseInt(e.target.value) || 0)} style={inp} placeholder="5000" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error block */}
              {errorMegger && (
                <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600, background: '#fef2f2', border: '1px solid #fca5a5', padding: '6px 10px', borderRadius: 6 }}>
                  ⚠️ {errorMegger}
                </div>
              )}

              {/* Actions Footer */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                {meggerStatus === 'connected' ? (
                  <>
                    <button
                      onClick={disconnectMeggerDevice}
                      title="Closes the COM/TCP connection in this app only. Does not power off or stop the Megger test."
                      style={{ flex: 1.4, padding: '7px 8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: 1.25 }}
                    >
                      🔌 Disconnect (keep Megger running)
                    </button>
                    <button
                      onClick={restartMeggerDevice}
                      style={{ flex: 1, padding: '7px 10px', background: '#f59e0b', color: '#1e293b', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🔄 Restart
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectMeggerDevice()}
                    disabled={meggerStatus === 'connecting'}
                    style={{
                      width: '100%', padding: '8px 10px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      opacity: meggerStatus === 'connecting' ? 0.7 : 1
                    }}
                  >
                    {meggerStatus === 'connecting' ? '⏳ Connecting...' : '⚡ Connect Megger'}
                  </button>
                )}
              </div>
            </div>

            {/* CARD 2: MULTIMETER */}
            <div style={cardStyle}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1e3a8a' }}>🔌 Multimeter (Winding)</span>
                
                {/* Status indicator */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: multimeterStatus === 'connected' ? '#ecfdf5' : multimeterStatus === 'connecting' ? '#fffbeb' : '#f8fafc',
                  border: `1px solid ${multimeterStatus === 'connected' ? '#a7f3d0' : multimeterStatus === 'connecting' ? '#fde68a' : '#cbd5e1'}`,
                  borderRadius: 20, padding: '2px 8px',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: multimeterStatus === 'connected' ? '#10b981' : multimeterStatus === 'connecting' ? '#d97706' : '#64748b',
                    display: 'inline-block'
                  }}></span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: multimeterStatus === 'connected' ? '#047857' : multimeterStatus === 'connecting' ? '#b45309' : '#475569', textTransform: 'capitalize' }}>
                    {multimeterStatus}
                  </span>
                </div>
              </div>

              {/* Connected details or controls */}
              {multimeterStatus === 'connected' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#f0fdf4', borderRadius: 8, padding: '12px 10px', border: '1px solid #dcfce7' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>LCR Multimeter Active</span>
                    <span style={{ fontSize: 11, color: '#166534', fontFamily: 'monospace', fontWeight: 600 }}>Port: {multimeterPort}</span>
                  </div>
                  <RawSerialLog
                    title="Live raw stream"
                    lines={multiRawLines}
                    onClear={() => setMultiRawLines([])}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: multimeterStatus === 'connecting' ? 0.6 : 1, pointerEvents: multimeterStatus === 'connecting' ? 'none' : 'auto' }}>
                  {/* Connection Type Toggles */}
                  <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    {[['serial', '🔌 USB Serial'], ['tcp', '🌐 TCP Client']].map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setUConnType(k)}
                        style={{
                          flex: 1, border: 'none', background: uConnType === k ? '#2563eb' : '#fff',
                          color: uConnType === k ? '#fff' : '#64748b', fontSize: 10, fontWeight: 700, padding: '6px 4px', cursor: 'pointer'
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>

                  {uConnType === 'serial' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={label}>COM Port</label>
                        <select value={uPort} onChange={e => setUPort(e.target.value)} style={sel}>
                          {ports.length === 0 && <option value="">No ports found</option>}
                          {ports.map(p => <option key={p.path} value={p.path}>{p.path} ({p.manufacturer || 'Generic'})</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={label}>Baud Rate</label>
                        <select value={uBaud} onChange={e => setUBaud(parseInt(e.target.value))} style={sel}>
                          {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 8 }}>
                      <div>
                        <label style={label}>IP Address</label>
                        <input type="text" value={uHost} onChange={e => setUHost(e.target.value)} style={inp} placeholder="127.0.0.1" />
                      </div>
                      <div>
                        <label style={label}>Port</label>
                        <input type="number" value={uTcpPort} onChange={e => setUTcpPort(parseInt(e.target.value) || 0)} style={inp} placeholder="5000" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error block */}
              {errorMulti && (
                <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600, background: '#fef2f2', border: '1px solid #fca5a5', padding: '6px 10px', borderRadius: 6 }}>
                  ⚠️ {errorMulti}
                </div>
              )}

              {/* Actions Footer */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                {multimeterStatus === 'connected' ? (
                  <>
                    <button
                      onClick={disconnectMultimeterDevice}
                      style={{ flex: 1, padding: '7px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ❌ Disconnect
                    </button>
                    <button
                      onClick={restartMultimeterDevice}
                      style={{ flex: 1, padding: '7px 10px', background: '#f59e0b', color: '#1e293b', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🔄 Restart
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectMultimeterDevice()}
                    disabled={multimeterStatus === 'connecting'}
                    style={{
                      width: '100%', padding: '8px 10px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      opacity: multimeterStatus === 'connecting' ? 0.7 : 1
                    }}
                  >
                    {multimeterStatus === 'connecting' ? '⏳ Connecting...' : '🔌 Connect Multimeter'}
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Setup Footer Note */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 4 }}>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.openLogs();
                } catch (err) {
                  console.error('Failed to open log folder:', err);
                }
              }}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1',
                background: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s'
              }}
            >
              📂 View App Logs
            </button>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 24px', borderRadius: 8, border: '1px solid #cbd5e1',
                background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Close Setup Dialog
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
