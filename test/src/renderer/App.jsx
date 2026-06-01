// src/renderer/App.jsx
import { useState, useEffect } from 'react';
import StartScreen          from './components/StartScreen';
import InfoTab              from './components/InfoTab';
import InsulationTab        from './components/InsulationTab';
import MultimeterTab        from './components/MultimeterTab';
import ReportScreen         from './components/ReportScreen';
import ConnectionSetupModal from './components/ConnectionSetupModal';

const api = window.electronAPI;

if (!api) {
  console.error('CRITICAL: window.electronAPI is missing. Check preload script!');
}

export default function App() {
  const [screen,        setScreen]        = useState('start');
  const [activeTab,     setActiveTab]     = useState('info');
  const [record,        setRecord]        = useState(null);
  const [records,       setRecords]       = useState([]);
  const [demoMode,      setDemoMode]      = useState(true);
  const [showConnSetup, setShowConnSetup] = useState(false);

  // Global Device Connection Status State
  const [meggerStatus, setMeggerStatus] = useState('disconnected');
  const [multimeterStatus, setMultimeterStatus] = useState('disconnected');
  const [meggerPort, setMeggerPort] = useState('');
  const [multimeterPort, setMultimeterPort] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Set up listeners for physical device connection & errors
  useEffect(() => {
    if (!api) return;

    api.onMeggerConnected(() => {
      setMeggerStatus('connected');
      setToastMessage({ type: 'success', text: '⚡ Megger connected successfully!' });
      setTimeout(() => setToastMessage(null), 4000);
    });

    api.onMeggerStopped(() => {
      setMeggerStatus('disconnected');
      setToastMessage({ type: 'info', text: '🔌 Megger connection closed.' });
      setTimeout(() => setToastMessage(null), 4000);
    });

    api.onMultimeterConnected(() => {
      setMultimeterStatus('connected');
      setToastMessage({ type: 'success', text: '🌀 Multimeter connected successfully!' });
      setTimeout(() => setToastMessage(null), 4000);
    });

    api.onMultimeterStopped(() => {
      setMultimeterStatus('disconnected');
      setToastMessage({ type: 'info', text: '🔌 Multimeter connection closed.' });
      setTimeout(() => setToastMessage(null), 4000);
    });

    api.onDeviceError((msg) => {
      setToastMessage({ type: 'error', text: `⚠️ Device Error: ${msg}` });
      if (msg.toLowerCase().includes('megger')) {
        setMeggerStatus('disconnected');
      } else if (msg.toLowerCase().includes('multimeter')) {
        setMultimeterStatus('disconnected');
      }
    });

    return () => {
      api.removeAllListeners('megger:connected');
      api.removeAllListeners('megger:stopped');
      api.removeAllListeners('multimeter:connected');
      api.removeAllListeners('multimeter:stopped');
      api.removeAllListeners('device:error');
    };
  }, []);

  // Load all records on mount
  useEffect(() => {
    if (api) {
      loadRecords();
    } else {
      console.warn('Cannot load records: api is undefined');
    }
  }, []);

  async function loadRecords() {
    try {
      const all = await api.getAllRecords();
      setRecords(all || []);
    } catch (err) {
      console.error('Failed to load records:', err);
    }
  }

  async function handleNew() {
    const rec = await api.createRecord({
      date: new Date().toISOString().split('T')[0],
    });
    setRecord(rec);
    setActiveTab('info');
    setScreen('main');
    loadRecords();
  }

  async function handleOpen(rec) {
    setRecord(rec);
    setActiveTab('info');
    setScreen('main');
  }

  async function handleDuplicate(rec) {
    const newRec = await api.duplicateRecord(rec.id);
    setRecord(newRec);
    setActiveTab('info');
    setScreen('main');
    loadRecords();
  }

  function handleBack() {
    loadRecords();
    setScreen('start');
    setRecord(null);
  }

  // Tab click
  function handleTabClick(tabKey) {
    setActiveTab(tabKey);
  }

  async function handleInfoChange(key, value) {
    if (!record) return;
    const updated = await api.updateRecord(record.id, { ...record, [key]: value });
    setRecord(updated);
    loadRecords();
  }

  const TABS = [
    { key: 'info',       label: '📋 Information'    },
    { key: 'insulation', label: '⚡ Insulation Test' },
    { key: 'multimeter', label: '🔌 Winding Test'    },
    { key: 'report',     label: '📄 Report'          },
  ];

  if (screen === 'start') {
    return (
      <StartScreen
        records={records}
        onNew={handleNew}
        onOpen={handleOpen}
        onDuplicate={handleDuplicate}
      />
    );
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9' }}>

      {/* ── Top Bar ── */}
      <div style={{ background: '#1e3a8a', color: '#fff', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={handleBack} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ← Back
          </button>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            ⚡ {record?.motorUtilityTag || record?.clientName || 'New Test Record'}
          </span>
        </div>

        {/* ── Centre info & device connectivity status ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ fontSize: 12, color: '#93c5fd', display: 'flex', gap: 15 }}>
            <span>{record?.location}</span>
            <span>{record?.date}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Megger connectivity pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.06)', borderRadius: 6,
              padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)',
            }} title={`Megger Status: ${meggerStatus}`}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: meggerStatus === 'connected' ? '#10b981' : meggerStatus === 'connecting' ? '#eab308' : '#64748b',
                display: 'inline-block'
              }}></span>
              <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>Megger: {meggerStatus}</span>
            </div>

            {/* Multimeter connectivity pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.06)', borderRadius: 6,
              padding: '3px 8px', border: '1px solid rgba(255,255,255,0.1)',
            }} title={`Multimeter Status: ${multimeterStatus}`}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: multimeterStatus === 'connected' ? '#10b981' : multimeterStatus === 'connecting' ? '#eab308' : '#64748b',
                display: 'inline-block'
              }}></span>
              <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>Multimeter: {multimeterStatus}</span>
            </div>

            {/* Connection setup trigger button */}
            <button
              onClick={() => setShowConnSetup(true)}
              style={{
                background: '#2563eb', color: '#fff', border: 'none',
                borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 4,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#2563eb'}
            >
              🔌 Connection Setup
            </button>
          </div>
        </div>

        {/* ── Demo / Real Mode Toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: demoMode ? 'rgba(234,179,8,0.15)' : 'rgba(16,185,129,0.15)',
            border: `1px solid ${demoMode ? '#ca8a04' : '#059669'}`,
            borderRadius: 20, padding: '3px 10px',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: demoMode ? '#eab308' : '#10b981',
              display: 'inline-block',
              boxShadow: demoMode ? '0 0 6px #eab308' : '0 0 6px #10b981',
            }}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: demoMode ? '#fde047' : '#6ee7b7', letterSpacing: 0.5 }}>
              {demoMode ? 'DEMO MODE' : 'REAL DEVICE'}
            </span>
          </div>

          {/* Toggle switch — simply flips mode, no modal */}
          <div
            onClick={() => setDemoMode(prev => !prev)}
            title={demoMode ? 'Switch to Real Device Mode' : 'Switch to Demo Mode'}
            style={{
              width: 48, height: 26, borderRadius: 13, cursor: 'pointer',
              background: demoMode ? '#475569' : '#10b981',
              position: 'relative', transition: 'background 0.25s',
              border: '2px solid rgba(255,255,255,0.15)',
              flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 2,
              left: demoMode ? 2 : 22,
              width: 18, height: 18, borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.25s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}></div>
          </div>

          <span style={{ fontSize: 10, color: '#93c5fd', maxWidth: 80, lineHeight: 1.3, textAlign: 'right' }}>
            {demoMode ? 'Using simulator' : 'USB/COM port'}
          </span>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabClick(t.key)}
            style={{
              padding: '12px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #1e40af' : '2px solid transparent',
              color: activeTab === t.key ? '#1e40af' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            {/* Show dot on device tabs when in real mode */}
            {!demoMode && (t.key === 'insulation' || t.key === 'multimeter') && (
              <span style={{ marginLeft: 4, width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', verticalAlign: 'middle' }}></span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'info'       && (
          <InfoTab
            record={record}
            records={records}
            onOpen={handleOpen}
            onDuplicate={handleDuplicate}
            onChange={handleInfoChange}
            loadRecords={loadRecords}
          />
        )}
        {activeTab === 'insulation' && (
          <InsulationTab
            record={record}
            demoMode={demoMode}
            meggerStatus={meggerStatus}
            setMeggerStatus={setMeggerStatus}
            onChange={handleInfoChange}
          />
        )}
        {activeTab === 'multimeter' && (
          <MultimeterTab
            record={record}
            demoMode={demoMode}
            multimeterStatus={multimeterStatus}
            setMultimeterStatus={setMultimeterStatus}
            onChange={handleInfoChange}
          />
        )}
        {activeTab === 'report'     && <ReportScreen  record={record} onChange={handleInfoChange} />}
      </div>

    </div>

    {/* Toast Alert Notification */}
    {toastMessage && (
      <div style={{
        position: 'fixed', top: 50, right: 20, zIndex: 9999,
        background: toastMessage.type === 'error' ? '#fef2f2' : toastMessage.type === 'success' ? '#f0fdf4' : '#eff6ff',
        border: `1px solid ${toastMessage.type === 'error' ? '#fca5a5' : toastMessage.type === 'success' ? '#86efac' : '#bfdbfe'}`,
        borderRadius: 8, padding: '10px 16px', color: toastMessage.type === 'error' ? '#991b1b' : toastMessage.type === 'success' ? '#166534' : '#1d4ed8',
        fontSize: 12, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>{toastMessage.text}</span>
        <button onClick={() => setToastMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit', fontWeight: 'bold' }}>×</button>
      </div>
    )}

    {/* ── Connection Setup Modal (No-tabs, unified, direct access) ── */}
    {showConnSetup && (
      <ConnectionSetupModal
        meggerStatus={meggerStatus}
        setMeggerStatus={setMeggerStatus}
        meggerPort={meggerPort}
        setMeggerPort={setMeggerPort}
        multimeterStatus={multimeterStatus}
        setMultimeterStatus={setMultimeterStatus}
        multimeterPort={multimeterPort}
        setMultimeterPort={setMultimeterPort}
        onCancel={() => setShowConnSetup(false)}
        setDemoMode={setDemoMode}
      />
    )}
    </>
  );
}
