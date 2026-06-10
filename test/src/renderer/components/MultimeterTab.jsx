// src/renderer/components/MultimeterTab.jsx
import { useState, useEffect, useRef } from 'react';

const api = window.electronAPI;

const RES_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const IND_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const CAP_KEYS = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];

// ── Styles shared across the component ──────────────────
const S = {
  sectionBox: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '8px 10px',
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#1e3a8a',
    borderBottom: '1px solid #f1f5f9', paddingBottom: 4, marginBottom: 6,
    display: 'block',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
  },
  phaseLabel: {
    fontSize: 11, color: '#475569', width: 72, flexShrink: 0,
  },
  unit: {
    fontSize: 10, color: '#94a3b8', width: 28, textAlign: 'left', flexShrink: 0,
  },
  captureInput: (captured) => ({
    flex: 1,
    border: `1px solid ${captured ? '#3b82f6' : '#e2e8f0'}`,
    borderRadius: 4,
    padding: '3px 6px',
    fontSize: 11,
    textAlign: 'right',
    outline: 'none',
    background: captured ? '#eff6ff' : '#f8fafc',
    color: '#0f172a',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontWeight: 600,
    transition: 'border-color 0.15s',
  }),
  windingPanel: {
    flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
  },
};

// ── Reusable measurement group ───────────────────────────
function MeasGroup({
  title,
  keys,
  prefix,
  unit,
  captured,
  frequencies,
  onCapture,
  correctWindingTo20,
  temp,
  focusedField,
  editValues,
  handleFocus,
  handleTextChange,
  handleBlur,
  handleFreqChange,
  handleCopyFreq
}) {
  const groupFreqKey = `${prefix}_freq`;
  const groupFreq = frequencies[groupFreqKey] || '';

  return (
    <div style={S.sectionBox}>
      {/* Group Header with Title, Frequency Input, and Copy Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Freq:</span>
          <input
            type="text"
            value={groupFreq}
            onChange={(e) => handleFreqChange(groupFreqKey, e.target.value)}
            style={{ width: 44, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 10, textAlign: 'center' }}
            placeholder="Freq"
          />
          <button
            onClick={() => handleCopyFreq(prefix, keys)}
            title="Copy frequency to all phases below"
            style={{
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4,
              padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#1e40af', cursor: 'pointer'
            }}
          >
            Copy
          </button>
        </div>
      </div>

      {/* Phase Rows */}
      {keys.map(k => {
        const fKey = `${prefix}_${k}`;
        const val = captured[fKey];
        const phaseFreqKey = `${fKey}_freq`;
        const phaseFreq = frequencies[phaseFreqKey] || '';
        
        let correctedVal = '';
        if (val !== undefined && val !== null) {
          if (correctWindingTo20 && prefix.includes('_res')) {
            const tempVal = isNaN(parseFloat(temp)) ? 25 : parseFloat(temp);
            correctedVal = parseFloat((val * (254.5 / (234.5 + tempVal))).toFixed(3));
          } else {
            correctedVal = val;
          }
        }

        const isFocused = focusedField === fKey;
        const displayVal = isFocused 
          ? (editValues[fKey] ?? '') 
          : (correctedVal !== undefined && correctedVal !== null ? String(correctedVal) : '');

        return (
          <div key={k} style={{ ...S.row, gap: 4 }}>
            <span style={{ ...S.phaseLabel, width: 78 }}>Phase {k}</span>
            
            <input
              type="text"
              value={displayVal}
              onFocus={() => handleFocus(fKey, val)}
              onChange={(e) => handleTextChange(fKey, e.target.value)}
              onBlur={() => handleBlur(fKey)}
              style={S.captureInput(val !== undefined)}
              placeholder="—"
              title="Type reading manually, or click live streaming indicator / setup to capture"
            />
            
            <button
              onClick={() => onCapture(fKey)}
              title="Capture live reading"
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 4,
                width: 22,
                height: 20,
                fontSize: 10,
                cursor: 'pointer',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              ⚡
            </button>
            
            <span style={{ ...S.unit, width: 22 }}>{unit}</span>

            <input
              type="text"
              value={phaseFreq}
              onChange={(e) => handleFreqChange(phaseFreqKey, e.target.value)}
              placeholder="Freq"
              style={{
                width: 44,
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 10,
                textAlign: 'center',
                outline: 'none',
                background: '#fff',
                flexShrink: 0
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── RLC Setup Modal ──────────────────────────────────────
function RLCSetupModal({ mode, freq, secondary, equivalent, liveValue, liveSecondaryValue, demoMode, onSave, onClose }) {
  const [localMode,      setLocalMode]      = useState(mode);
  const [localFreq,      setLocalFreq]      = useState(freq);
  const [localSecondary, setLocalSecondary] = useState(secondary);
  const [localEquivalent, setLocalEquivalent] = useState(equivalent || 'SER');
  const [localRange,     setLocalRange]     = useState('Auto');

  const unit = localMode === 'R' ? 'Ohm' : localMode === 'L' ? 'mH' : 'nF';

  const selectStyle = {
    border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px',
    fontSize: 12, outline: 'none', background: '#fff', color: '#1e293b',
    width: '100%',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{
        background: '#f1f5f9', borderRadius: 12, width: 360,
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        border: '1px solid #e2e8f0', overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>⚙ RLC Setup</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* L/C/R and Q/D/R row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>L / C / R (Primary)</label>
              <select value={localMode} onChange={e => setLocalMode(e.target.value)} style={selectStyle}>
                <option value="L">L (Inductance)</option>
                <option value="C">C (Capacitance)</option>
                <option value="R">R (Resistance)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Q / D / R (Secondary)</label>
              <select value={localSecondary} onChange={e => setLocalSecondary(e.target.value)} style={selectStyle}>
                <option value="Q">Q (Quality Factor)</option>
                <option value="D">D (Dissipation)</option>
                <option value="R">R (ESR)</option>
              </select>
            </div>
          </div>

          {/* FREQ and EQUIVALENT row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>FREQ</label>
              <select value={localFreq} onChange={e => setLocalFreq(e.target.value)} style={selectStyle}>
                <option value="100Hz">100 Hz</option>
                <option value="120Hz">120 Hz</option>
                <option value="1kHz">1 kHz</option>
                <option value="10kHz">10 kHz</option>
                <option value="100kHz">100 kHz</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>EQUIVALENT</label>
              <select value={localEquivalent} onChange={e => setLocalEquivalent(e.target.value)} style={selectStyle}>
                <option value="SER">Series (SER)</option>
                <option value="PAL">Parallel (PAL)</option>
              </select>
            </div>
          </div>

          {/* Range selection */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{localMode} RANGE ({localFreq})</label>
            <select value={localRange} onChange={e => setLocalRange(e.target.value)} style={selectStyle}>
              <option value="Auto">Auto</option>
              <option value="10nF">10 nF</option>
              <option value="100nF">100 nF</option>
              <option value="1uF">1 µF</option>
              <option value="10uF">10 µF</option>
              <option value="100uF">100 µF</option>
            </select>
          </div>

          {/* Live values preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Primary display */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Primary ({localMode})</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#10b981' }}>
                  {liveValue.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{unit}</span>
              </div>
            </div>
            {/* Secondary display */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Secondary ({localSecondary})</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#3b82f6' }}>
                  {liveSecondaryValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </span>
              </div>
            </div>
          </div>

          {/* Demo mode notice */}
          {demoMode && (
            <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#854d0e' }}>
              🎭 Demo Mode — serial port not active. COM port will be used when Real Device Mode is selected.
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Close
            </button>
            <button
              onClick={() => onSave({ mode: localMode, freq: localFreq, secondary: localSecondary, equivalent: localEquivalent })}
              style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#eab308', color: '#1e293b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────
export default function MultimeterTab({ record, demoMode = true, multimeterStatus, onChange }) {
  const correctWindingTo20 = record?.correctWindingTo20 || false;
  const [mode,      setMode]      = useState('R');
  const [freq,      setFreq]      = useState('120Hz');
  const [secondary, setSecondary] = useState('D');
  const [equivalent, setEquivalent] = useState('SER');
  const [liveValue, setLiveValue] = useState(0);
  const [liveSecondaryValue, setLiveSecondaryValue] = useState(0);
  const [captured,  setCaptured]  = useState({});
  const [frequencies, setFrequencies] = useState({});
  const [temperature, setTemperature] = useState('25');
  const [showSetup, setShowSetup] = useState(false);

  // Focus & manual edit values
  const [focusedField, setFocusedField] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Watchdog Telemetry states
  const [telemetryAlert, setTelemetryAlert] = useState(false);

  const liveRef = useRef(null);
  const watchdogIntervalRef = useRef(null);
  const lastValueTime = useRef(Date.now());

  const multimeterOnline = multimeterStatus === 'connected';

  // Re-testing confirmation tracking
  const hasConfirmedReTest = useRef(false);
  const hadDataOnLoad = useRef(false);

  // Load saved data on mount
  useEffect(() => {
    if (!record) return;
    hasConfirmedReTest.current = false;
    hadDataOnLoad.current = false;

    api.getMultimeterData(record.id).then(data => {
      const vals = {};
      const freqs = {};
      let tempVal = '25';
      Object.entries(data || {}).forEach(([field, d]) => {
        if (d.value !== undefined && d.value !== null) {
          vals[field] = d.value;
        }
        if (d.frequency !== undefined && d.frequency !== null) {
          freqs[field] = d.frequency;
        }
        if (d.temperature !== undefined && d.temperature !== 0) tempVal = String(d.temperature);
      });
      setCaptured(vals);
      setFrequencies(freqs);
      setTemperature(tempVal);

      if (Object.keys(vals).length > 0) {
        hadDataOnLoad.current = true;
      }
    });
  }, [record?.id]);

  // Watchdog & live feed simulation
  useEffect(() => {
    clearInterval(liveRef.current);
    clearInterval(watchdogIntervalRef.current);
    setTelemetryAlert(false);

    if (demoMode) {
      const base = mode === 'R' ? 12.4 : mode === 'L' ? 145.2 : 47.8;
      liveRef.current = setInterval(() => {
        const noise = (Math.random() - 0.5) * base * 0.05;
        setLiveValue(parseFloat((base + noise).toFixed(3)));
        setLiveSecondaryValue(parseFloat((Math.random() * 0.1).toFixed(4)));
      }, 400);
    } else {
      if (multimeterOnline) {
        lastValueTime.current = Date.now();
        watchdogIntervalRef.current = setInterval(() => {
          if (Date.now() - lastValueTime.current > 4000) {
            setTelemetryAlert(true);
          }
        }, 2000);

        api.onMultimeterLive(v => {
          lastValueTime.current = Date.now();
          setTelemetryAlert(false);
          setLiveValue(v.primary);
          setLiveSecondaryValue(v.secondary);
        });
      }
    }

    return () => {
      clearInterval(liveRef.current);
      clearInterval(watchdogIntervalRef.current);
      if (!demoMode) {
        api.removeAllListeners('multimeter:live');
      }
    };
  }, [mode, demoMode, multimeterOnline]);

  const confirmReTest = () => {
    if (hadDataOnLoad.current && !hasConfirmedReTest.current) {
      const utilityTag = record?.motorUtilityTag;
      const motorName = utilityTag ? `motor "${utilityTag}"` : "this motor";
      const confirmed = window.confirm(
        `Are you sure you are re-testing ${motorName}? To save new results for a different motor, create a new record instead.`
      );
      if (confirmed) {
        hasConfirmedReTest.current = true;
        return true;
      }
      return false;
    }
    return true;
  };

  const handleCapture = async (fieldKey) => {
    if (!confirmReTest()) return;
    const val = liveValue;
    setCaptured(prev => ({ ...prev, [fieldKey]: val }));
    if (record) {
      await api.saveMultimeterField(record.id, fieldKey, {
        value: val,
        temperature: parseFloat(temperature) || 0
      });
    }
  };

  const handleSetupSave = async ({ mode: m, freq: f, secondary: s, equivalent: eq }) => {
    setMode(m);
    setFreq(f);
    setSecondary(s);
    setEquivalent(eq);
    setShowSetup(false);
    if (!demoMode && api.sendMultimeterCommand) {
      try {
        await api.sendMultimeterCommand(m, f, s, eq);
      } catch (err) {
        console.error('Failed to send multimeter setup command:', err);
      }
    }
  };

  // Focus & manual edit handlers
  const handleFocus = (fieldKey, currentVal) => {
    setFocusedField(fieldKey);
    setEditValues(prev => ({ ...prev, [fieldKey]: currentVal !== undefined && currentVal !== null ? String(currentVal) : '' }));
  };

  const handleTextChange = (fieldKey, text) => {
    setEditValues(prev => ({ ...prev, [fieldKey]: text }));
  };

  const handleBlur = async (fieldKey) => {
    setFocusedField(null);
    const rawStr = editValues[fieldKey];
    if (rawStr === undefined) return;

    let finalVal = undefined;
    if (rawStr.trim() !== '') {
      const parsed = parseFloat(rawStr);
      if (!isNaN(parsed)) {
        finalVal = parsed;
      }
    }

    const currentVal = captured[fieldKey];
    if (finalVal !== currentVal) {
      if (!confirmReTest()) {
        setEditValues(prev => {
          const copy = { ...prev };
          delete copy[fieldKey];
          return copy;
        });
        return;
      }
    }

    setCaptured(prev => {
      const copy = { ...prev };
      if (finalVal === undefined) {
        delete copy[fieldKey];
      } else {
        copy[fieldKey] = finalVal;
      }
      return copy;
    });

    if (record) {
      await api.saveMultimeterField(record.id, fieldKey, {
        value: finalVal,
        temperature: parseFloat(temperature) || 0
      });
    }
    
    setEditValues(prev => {
      const copy = { ...prev };
      delete copy[fieldKey];
      return copy;
    });
  };

  const handleFreqChange = async (fieldKey, freqVal) => {
    setFrequencies(prev => ({ ...prev, [fieldKey]: freqVal }));
    if (record) {
      await api.saveMultimeterField(record.id, fieldKey, { frequency: freqVal });
    }
  };

  const handleCopyFreq = async (prefix, keys) => {
    const groupFreqKey = `${prefix}_freq`;
    const groupFreq = frequencies[groupFreqKey] || '';
    if (!groupFreq) return;

    const updatedFreqs = { ...frequencies };
    for (const k of keys) {
      const phaseFreqKey = `${prefix}_${k}_freq`;
      updatedFreqs[phaseFreqKey] = groupFreq;
      if (record) {
        await api.saveMultimeterField(record.id, phaseFreqKey, { frequency: groupFreq });
      }
    }
    setFrequencies(updatedFreqs);
  };

  // --- Imbalance & Diagnostic Analytics (IEEE and Standard Industrial limits) ---
  function calculateImbalance(v1, v2, v3) {
    if (v1 === undefined || v2 === undefined || v3 === undefined) return null;
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
  }

  const statorResImb = calculateImbalance(captured['stator_res_1-2'], captured['stator_res_1-3'], captured['stator_res_2-3']);
  const statorIndImb = calculateImbalance(captured['stator_ind_1-2'], captured['stator_ind_1-3'], captured['stator_ind_2-3']);
  const rotorResImb = calculateImbalance(captured['rotor_res_1-2'], captured['rotor_res_1-3'], captured['rotor_res_2-3']);
  const rotorIndImb = calculateImbalance(captured['rotor_ind_1-2'], captured['rotor_ind_1-3'], captured['rotor_ind_2-3']);

  function renderImbalanceBadge(imb) {
    if (imb === null) return <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>Awaiting 3-phase inputs</span>;
    
    let color = '#10b981'; // pass
    let label = 'Pass (Balanced)';
    if (imb > 5) {
      color = '#dc2626'; // fail
      label = 'Fail (High Imbalance)';
    } else if (imb > 2) {
      color = '#d97706'; // warning
      label = 'Warning (Moderate Imbalance)';
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{imb.toFixed(2)}%</span>
        <span style={{
          fontSize: 8, fontWeight: 800, color: '#fff',
          background: color, borderRadius: 5, padding: '2px 6px',
        }}>
          {label}
        </span>
      </div>
    );
  }

  const tempNum = Math.min(Math.max(parseFloat(temperature) || 0, 0), 100);
  const unit = mode === 'R' ? 'Ω' : mode === 'L' ? 'mH' : 'nF';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)', boxSizing: 'border-box', padding: 12, gap: 10 }}>

      {/* Telemetry Alert Watchdog Banner */}
      {telemetryAlert && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '8px 16px', color: '#991b1b', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 8, animation: 'pulse 2s infinite', flexShrink: 0
        }}>
          ⚠️ Telemetry Alert: No live streaming data received from Multimeter port. Please verify device power, set to active stream mode, or verify connection baud rate.
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>🌀 Winding Test (RLC)</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Type directly to enter readings manually, or click ⚡ to capture current live readout</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Active settings pills */}
          {[
            ['Mode', mode === 'R' ? 'Resistance' : mode === 'L' ? 'Inductance' : 'Capacitance'],
            ['Freq', freq],
            ['Sec', secondary],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 8px', fontSize: 11 }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>{lbl}: </span>
              <span style={{ color: '#1e40af', fontWeight: 700 }}>{val}</span>
            </div>
          ))}

          {/* Winding Resistance Baseline correction toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: correctWindingTo20 ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${correctWindingTo20 ? '#bfdbfe' : '#cbd5e1'}`,
            borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700,
            color: correctWindingTo20 ? '#1e40af' : '#475569', cursor: 'pointer',
            transition: 'all 0.15s'
          }}>
            <input
              type="checkbox"
              checked={correctWindingTo20}
              onChange={e => onChange('correctWindingTo20', e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Correct Winding to Baseline 20°C (Copper)</span>
          </label>

          {/* RLC Setup button */}
          <button
            onClick={() => setShowSetup(true)}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#334155', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            ⚙ RLC Setup
          </button>

          {/* Mode status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: demoMode ? 'rgba(234,179,8,0.08)' : multimeterOnline ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${demoMode ? '#ca8a04' : multimeterOnline ? '#a7f3d0' : '#fca5a5'}`,
            borderRadius: 20, padding: '3px 10px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: demoMode ? '#eab308' : multimeterOnline ? '#10b981' : '#ef4444', display: 'inline-block' }}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: demoMode ? '#854d0e' : multimeterOnline ? '#065f46' : '#991b1b' }}>
              {demoMode ? '🎭 Demo Mode' : multimeterOnline ? '✅ Multimeter Online' : '⚠️ Multimeter Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>

        {/* STATOR WINDING */}
        <div style={S.windingPanel}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', paddingBottom: 6, borderBottom: '2px solid #eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🔵 Stator Winding</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Winding Freq:</span>
              <input
                type="text"
                value={frequencies['stator_global_freq'] || ''}
                onChange={e => handleFreqChange('stator_global_freq', e.target.value)}
                style={{ width: 60, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11, textAlign: 'center' }}
                placeholder="e.g. 1kHz"
              />
            </div>
          </div>

          {/* Stator grid: Resistance+Inductance left, Capacitance right */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MeasGroup
                title="Winding Resistance"
                keys={RES_KEYS}
                prefix="stator_res"
                unit="ohm"
                captured={captured}
                frequencies={frequencies}
                onCapture={handleCapture}
                correctWindingTo20={correctWindingTo20}
                temp={temperature}
                focusedField={focusedField}
                editValues={editValues}
                handleFocus={handleFocus}
                handleTextChange={handleTextChange}
                handleBlur={handleBlur}
                handleFreqChange={handleFreqChange}
                handleCopyFreq={handleCopyFreq}
              />
              <MeasGroup
                title="Winding Inductance"
                keys={IND_KEYS}
                prefix="stator_ind"
                unit="mH"
                captured={captured}
                frequencies={frequencies}
                onCapture={handleCapture}
                focusedField={focusedField}
                editValues={editValues}
                handleFocus={handleFocus}
                handleTextChange={handleTextChange}
                handleBlur={handleBlur}
                handleFreqChange={handleFreqChange}
                handleCopyFreq={handleCopyFreq}
              />
            </div>
            <MeasGroup
              title="Winding Capacitance"
              keys={CAP_KEYS}
              prefix="stator_cap"
              unit="nF"
              captured={captured}
              frequencies={frequencies}
              onCapture={handleCapture}
              focusedField={focusedField}
              editValues={editValues}
              handleFocus={handleFocus}
              handleTextChange={handleTextChange}
              handleBlur={handleBlur}
              handleFreqChange={handleFreqChange}
              handleCopyFreq={handleCopyFreq}
            />
          </div>

          {/* Analysis box */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', borderBottom: '1px solid #f1f5f9', paddingBottom: 3 }}>📊 PHASE BALANCE ANALYSIS</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>Resistance Imbalance:</span>
              {renderImbalanceBadge(statorResImb)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>Inductance Imbalance:</span>
              {renderImbalanceBadge(statorIndImb)}
            </div>
          </div>

          {/* Temperature row */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {/* Thermometer */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 80, fontSize: 8, color: '#94a3b8', textAlign: 'right', paddingBottom: 2 }}>
                  <span>100</span><span>80</span><span>60</span><span>40</span><span>20</span><span>0</span>
                </div>
                <div style={{ position: 'relative', width: 12, height: 80 }}>
                  <div style={{ position: 'absolute', inset: 0, background: '#e2e8f0', borderRadius: '6px 6px 0 0', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${tempNum}%`, background: `hsl(${120 - tempNum * 1.2}, 80%, 45%)`, transition: 'height 0.4s ease' }}></div>
                  </div>
                </div>
              </div>
              <div style={{ width: 18, height: 18, background: '#ef4444', borderRadius: '50%', marginTop: -4, border: '2px solid #cbd5e1', zIndex: 1 }}></div>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>TEMPERATURE (°C)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={temperature}
                  onChange={e => {
                    const v = e.target.value;
                    setTemperature(v);
                    if (record) {
                      const tempNum = parseFloat(v) || 0;
                      Object.keys(captured).forEach(f => {
                        api.saveMultimeterField(record.id, f, { temperature: tempNum });
                      });
                    }
                  }}
                  style={{ width: 65, border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: 13, outline: 'none', fontWeight: 700 }}
                  min="0" max="200"
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>°C</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROTOR WINDING */}
        <div style={S.windingPanel}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', paddingBottom: 6, borderBottom: '2px solid #eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🔴 Rotor Winding</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Winding Freq:</span>
              <input
                type="text"
                value={frequencies['rotor_global_freq'] || ''}
                onChange={e => handleFreqChange('rotor_global_freq', e.target.value)}
                style={{ width: 60, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 4px', fontSize: 11, textAlign: 'center' }}
                placeholder="e.g. 1kHz"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MeasGroup
                title="Winding Resistance"
                keys={RES_KEYS}
                prefix="rotor_res"
                unit="ohm"
                captured={captured}
                frequencies={frequencies}
                onCapture={handleCapture}
                correctWindingTo20={correctWindingTo20}
                temp={temperature}
                focusedField={focusedField}
                editValues={editValues}
                handleFocus={handleFocus}
                handleTextChange={handleTextChange}
                handleBlur={handleBlur}
                handleFreqChange={handleFreqChange}
                handleCopyFreq={handleCopyFreq}
              />
              <MeasGroup
                title="Winding Inductance"
                keys={IND_KEYS}
                prefix="rotor_ind"
                unit="mH"
                captured={captured}
                frequencies={frequencies}
                onCapture={handleCapture}
                focusedField={focusedField}
                editValues={editValues}
                handleFocus={handleFocus}
                handleTextChange={handleTextChange}
                handleBlur={handleBlur}
                handleFreqChange={handleFreqChange}
                handleCopyFreq={handleCopyFreq}
              />
            </div>
            <MeasGroup
              title="Winding Capacitance"
              keys={CAP_KEYS}
              prefix="rotor_cap"
              unit="nF"
              captured={captured}
              frequencies={frequencies}
              onCapture={handleCapture}
              focusedField={focusedField}
              editValues={editValues}
              handleFocus={handleFocus}
              handleTextChange={handleTextChange}
              handleBlur={handleBlur}
              handleFreqChange={handleFreqChange}
              handleCopyFreq={handleCopyFreq}
            />
          </div>

          {/* Analysis box */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', borderBottom: '1px solid #f1f5f9', paddingBottom: 3 }}>📊 PHASE BALANCE ANALYSIS</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>Resistance Imbalance:</span>
              {renderImbalanceBadge(rotorResImb)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>Inductance Imbalance:</span>
              {renderImbalanceBadge(rotorIndImb)}
            </div>
          </div>

          {/* Live readout display */}
          <div style={{ background: '#0f172a', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 32 }}>
              <div>
                <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Primary ({mode})</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace', color: '#10b981', letterSpacing: -1 }}>
                    {((correctWindingTo20 && mode === 'R')
                      ? parseFloat((liveValue * (254.5 / (234.5 + (isNaN(parseFloat(temperature)) ? 25 : parseFloat(temperature))))).toFixed(3))
                      : liveValue
                    ).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>{unit}</span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Secondary ({secondary})</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: -1 }}>
                    {liveSecondaryValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
              {[
                ['Mode', mode === 'R' ? 'Resistance' : mode === 'L' ? 'Inductance' : 'Capacitance'],
                ['Freq', freq],
                ['Sec', secondary],
                ['Equivalent', equivalent === 'PAL' ? 'Parallel' : 'Series']
              ].map(([l, v]) => (
                <div key={l} style={{ fontSize: 10, color: '#64748b' }}>
                  {l}: <strong style={{ color: '#cbd5e1' }}>{v}</strong>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>STREAMING LIVE</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── RLC SETUP MODAL ── */}
      {showSetup && (
        <RLCSetupModal
          mode={mode}
          freq={freq}
          secondary={secondary}
          equivalent={equivalent}
          liveValue={liveValue}
          liveSecondaryValue={liveSecondaryValue}
          demoMode={demoMode}
          onSave={handleSetupSave}
          onClose={() => setShowSetup(false)}
        />
      )}

    </div>
  );
}
