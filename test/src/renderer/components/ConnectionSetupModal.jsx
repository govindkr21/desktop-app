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
};

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

  // Megger configurations
  const [mConnType, setMConnType] = useState('serial');
  const [mPort, setMPort] = useState('COM3');
  const [mBaud, setMBaud] = useState(9600);
  const [mHost, setMHost] = useState('127.0.0.1');
  const [mTcpPort, setMTcpPort] = useState(5000);

  // Multimeter configurations
  const [uConnType, setUConnType] = useState('serial');
  const [uPort, setUPort] = useState('COM4');
  const [uBaud, setUBaud] = useState(9600);
  const [uHost, setUHost] = useState('127.0.0.1');
  const [uTcpPort, setUTcpPort] = useState(5000);

  // Scan available COM ports on mount
  useEffect(() => {
    scanPorts();
  }, []);

  async function scanPorts() {
    setScanning(true);
    try {
      const result = await api.listSerialPorts();
      if (result.success) {
        setPorts(result.ports || []);
        if (result.ports && result.ports.length > 0) {
          const firstPort = result.ports[0].path;
          // Set defaults if currently empty
          if (!meggerPort) setMPort(firstPort);
          if (!multimeterPort) setUPort(firstPort);
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
        background: '#f8fafc', borderRadius: 16, width: 780,
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 8, padding: '24px 10px', border: '1px solid #dcfce7' }}>
                  <span style={{ fontSize: 32 }}>✅</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Megger MIT 525 Active</span>
                  <span style={{ fontSize: 11, color: '#166534', fontFamily: 'monospace', fontWeight: 600 }}>Port: {meggerPort}</span>
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
                      style={{ flex: 1, padding: '7px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ❌ Disconnect
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 8, padding: '24px 10px', border: '1px solid #dcfce7' }}>
                  <span style={{ fontSize: 32 }}>✅</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>LCR Multimeter Active</span>
                  <span style={{ fontSize: 11, color: '#166534', fontFamily: 'monospace', fontWeight: 600 }}>Port: {multimeterPort}</span>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 4 }}>
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
