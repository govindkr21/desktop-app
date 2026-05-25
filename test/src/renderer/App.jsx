// src/renderer/App.jsx
import { useState, useEffect } from 'react';
import StartScreen   from './components/StartScreen';
import InfoTab       from './components/InfoTab';
import InsulationTab from './components/InsulationTab';
import MultimeterTab from './components/MultimeterTab';
import ReportScreen  from './components/ReportScreen';

const api = window.electronAPI;

if (!api) {
  console.error('CRITICAL: window.electronAPI is missing. Check preload script!');
}

export default function App() {
  const [screen,    setScreen]    = useState('start');   // 'start' | 'main'
  const [activeTab, setActiveTab] = useState('info');
  const [record,    setRecord]    = useState(null);       // current DB record
  const [records,   setRecords]   = useState([]);
  const [demoMode,  setDemoMode]  = useState(true);       // true = demo, false = real device

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

        {/* ── Centre info ── */}
        <div style={{ fontSize: 12, color: '#93c5fd', display: 'flex', gap: 20 }}>
          <span>{record?.location}</span>
          <span>{record?.date}</span>
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

          {/* Toggle switch */}
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
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '12px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #1e40af' : '2px solid transparent',
              color: activeTab === t.key ? '#1e40af' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
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
        {activeTab === 'insulation' && <InsulationTab record={record} demoMode={demoMode} />}
        {activeTab === 'multimeter' && <MultimeterTab record={record} demoMode={demoMode} />}
        {activeTab === 'report'     && <ReportScreen  record={record} />}
      </div>

    </div>
  );
}
