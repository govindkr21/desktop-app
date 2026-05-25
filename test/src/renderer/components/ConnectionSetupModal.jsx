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
  fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4,
};

export default function ConnectionSetupModal({ defaultDevice = 'megger', onConnect, onCancel }) {
  const [ports,       setPorts]       = useState([]);
  const [scanning,    setScanning]    = useState(false);
  const [connecting,  setConnecting]  = useState(false);
  const [error,       setError]       = useState('');

  const [meggerPort,   setMeggerPort]   = useState('');
  const [meggerBaud,   setMeggerBaud]   = useState(9600);
  const [mulPort,      setMulPort]      = useState('');
  const [mulBaud,      setMulBaud]      = useState(9600);
  const [activeDevice, setActiveDevice] = useState(defaultDevice); // pre-select based on tab

  // Scan for ports on mount
  useEffect(() => { scanPorts(); }, []);

  async function scanPorts() {
    setScanning(true);
    setError('');
    try {
      const result = await api.listSerialPorts();
      if (result.success) {
        setPorts(result.ports);
        if (result.ports.length > 0) {
          setMeggerPort(result.ports[0].path);
          setMulPort(result.ports[0].path);
        }
      } else {
        setError('Could not scan ports: ' + (result.error || 'unknown error'));
      }
    } catch (e) {
      setError('Scan failed: ' + e.message);
    }
    setScanning(false);
  }

  async function handleConnect() {
    setConnecting(true);
    setError('');
    try {
      let result;
      if (activeDevice === 'megger') {
        if (!meggerPort) { setError('Please select a port for the Megger.'); setConnecting(false); return; }
        result = await api.connectMegger(meggerPort, meggerBaud);
      } else {
        if (!mulPort) { setError('Please select a port for the Multimeter.'); setConnecting(false); return; }
        result = await api.connectMultimeter(mulPort, mulBaud);
      }

      if (result.success) {
        onConnect({ device: activeDevice, port: activeDevice === 'megger' ? meggerPort : mulPort });
      } else {
        setError('Connection failed: ' + (result.error || 'Check the port and baud rate.'));
      }
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setConnecting(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
    }}>
      <div style={{
        background: '#f8fafc', borderRadius: 14, width: 420,
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>🔌 Device Connection Setup</div>
            <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>Select which device to connect via USB/COM port</div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Device selector tabs */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {[
              { key: 'megger',      label: '⚡ Megger (Insulation)' },
              { key: 'multimeter',  label: '🔌 Multimeter (Winding)' },
            ].map(d => (
              <button
                key={d.key}
                onClick={() => setActiveDevice(d.key)}
                style={{
                  flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: activeDevice === d.key ? '#1e40af' : '#fff',
                  color: activeDevice === d.key ? '#fff' : '#64748b',
                  transition: 'all 0.15s',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Port scanner */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Available COM Ports
              </span>
              <button
                onClick={scanPorts}
                disabled={scanning}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#475569',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {scanning ? '⏳ Scanning...' : '🔄 Refresh'}
              </button>
            </div>

            {ports.length === 0 && !scanning ? (
              <div style={{ fontSize: 11, color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>
                No COM ports found. Connect your device and click Refresh.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ports.map(p => (
                  <div
                    key={p.path}
                    onClick={() => { if (activeDevice === 'megger') setMeggerPort(p.path); else setMulPort(p.path); }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${(activeDevice === 'megger' ? meggerPort : mulPort) === p.path ? '#3b82f6' : '#e2e8f0'}`,
                      background: (activeDevice === 'megger' ? meggerPort : mulPort) === p.path ? '#eff6ff' : '#fafafa',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{p.path}</span>
                      {p.manufacturer && (
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{p.manufacturer}</span>
                      )}
                    </div>
                    {(activeDevice === 'megger' ? meggerPort : mulPort) === p.path && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>✓ Selected</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual COM port + Baud Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={label}>
                {activeDevice === 'megger' ? 'Megger' : 'Multimeter'} COM Port
              </span>
              <input
                type="text"
                value={activeDevice === 'megger' ? meggerPort : mulPort}
                onChange={e => activeDevice === 'megger' ? setMeggerPort(e.target.value) : setMulPort(e.target.value)}
                style={inp}
                placeholder="e.g. COM5"
              />
            </div>
            <div>
              <span style={label}>Baud Rate</span>
              <select
                value={activeDevice === 'megger' ? meggerBaud : mulBaud}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  activeDevice === 'megger' ? setMeggerBaud(v) : setMulBaud(v);
                }}
                style={sel}
              >
                {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
              ⚠ {error}
            </div>
          )}

          {/* Info note */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#1d4ed8' }}>
            💡 Only one device connects at a time. The Megger connects when you open the Insulation Test tab; the Multimeter connects when you open the Winding Test tab.
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting || scanning}
              style={{
                padding: '9px 22px', borderRadius: 8, border: 'none',
                background: connecting ? '#1d4ed8' : '#1e40af',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: (connecting || scanning) ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {connecting ? '⏳ Connecting...' : '✅ Connect Device'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
