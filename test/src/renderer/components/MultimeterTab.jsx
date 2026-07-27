// src/renderer/components/MultimeterTab.jsx
import { useState, useEffect, useRef } from 'react';

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
  if (mode === 'L') return num >= 2e6; // 2,000,000 mH (2000 H)
  if (mode === 'C') return num >= 2e7; // 20,000,000 nF (20 mF)
  return false;
};

const RES_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const IND_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const CAP_KEYS = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];
const IMP_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];

const L_FREQS = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
const R_FREQS = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
const Z_FREQS = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];

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
  symbol,
  onModeToggle,
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
  handleCopyFreq,
  onSweep,
  sweepingField,
  activeSweepFreq,
  onSelectGroup,
  onFreqTabClick,
  onHeaderFreqChange,
  currentMode,
  currentFreq
}) {
  const groupFreqKey = `${prefix}_freq`;
  const groupFreq = frequencies[groupFreqKey] || '';
  const isInd = prefix.includes('_ind');
  const isImp = prefix.includes('_imp');
  const isRes = prefix.includes('_res');
  const isResAcSweep = isRes && currentMode === 'R';


  const isActive = (prefix.includes('_res') && (currentMode === 'DCR' || currentMode === 'R')) ||
                   (prefix.includes('_ind') && currentMode === 'L') ||
                   (prefix.includes('_cap') && currentMode === 'C') ||
                   (prefix.includes('_imp') && currentMode === 'Z');

  return (
    <div
      onClick={() => onSelectGroup && onSelectGroup(prefix)}
      style={{
        ...S.sectionBox,
        border: isActive ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
        background: isActive ? '#f8fafc' : '#fff',
        boxShadow: isActive ? '0 1px 3px rgba(37, 99, 235, 0.15)' : 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {/* Group Header with Title, Symbol Badge, Frequency Input */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 4, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a' }}>{title}</span>
          {symbol && (
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: isActive ? '#1e40af' : '#64748b',
              background: isActive ? '#dbeafe' : '#f1f5f9',
              border: `1px solid ${isActive ? '#93c5fd' : '#e2e8f0'}`,
              borderRadius: 4,
              padding: '1px 5px',
              fontFamily: 'monospace',
              letterSpacing: 0.5,
              transition: 'all 0.2s',
            }}>{symbol}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
          {/* DCR / R toggle — only for resistance groups */}
          {onModeToggle && (
            <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
              {['DCR', 'R'].map(m => (
                <button
                  key={m}
                  onClick={() => onModeToggle(m)}
                  title={m === 'DCR' ? 'DC Resistance — 4-wire Kelvin method for low-resistance windings' : 'AC Resistance — measured at set frequency'}
                  style={{
                    padding: '2px 7px',
                    fontSize: 9,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    background: currentMode === m ? '#1e40af' : '#f1f5f9',
                    color: currentMode === m ? '#fff' : '#64748b',
                    transition: 'all 0.15s',
                    fontFamily: 'monospace',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {!isInd && !isImp && !onModeToggle && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Freq:</span>
              <select
                value={groupFreq || '1kHz'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (onHeaderFreqChange) onHeaderFreqChange(groupFreqKey, v);
                  else handleFreqChange(groupFreqKey, v);
                }}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  padding: '2px 4px',
                  fontSize: 10,
                  color: '#1e293b',
                  background: '#fff',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="100Hz">100Hz</option>
                <option value="120Hz">120Hz</option>
                <option value="1kHz">1kHz</option>
                <option value="10kHz">10kHz</option>
                <option value="100kHz">100kHz</option>
              </select>
            </div>
          )}
          {isImp && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }} title="Frequency mirrored to the single-value `_z`/`_deg` spot keys for reports">Spot Freq:</span>
              <select
                value={groupFreq || '1kHz'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (onHeaderFreqChange) onHeaderFreqChange(groupFreqKey, v);
                  else handleFreqChange(groupFreqKey, v);
                }}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  padding: '2px 4px',
                  fontSize: 10,
                  color: '#1e293b',
                  background: '#fff',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="100Hz">100Hz</option>
                <option value="120Hz">120Hz</option>
                <option value="1kHz">1kHz</option>
                <option value="10kHz">10kHz</option>
                <option value="100kHz">100kHz</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Columns Header for Inductance Sweep */}
      {isInd && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, paddingRight: 26, paddingLeft: 82 }}>
          {L_FREQS.map(f => {
            const isCurrentFreq = currentFreq === f && isActive;
            return (
              <span
                key={f}
                onClick={(e) => {
                  e.stopPropagation();
                  onFreqTabClick && onFreqTabClick(f);
                }}
                style={{
                  flex: 1,
                  fontSize: 9,
                  fontWeight: 700,
                  color: isCurrentFreq ? '#1e40af' : '#64748b',
                  background: isCurrentFreq ? '#dbeafe' : '#f1f5f9',
                  border: `1px solid ${isCurrentFreq ? '#3b82f6' : '#cbd5e1'}`,
                  borderRadius: 4,
                  padding: '2px 0',
                  textAlign: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
                title={`Click to configure multimeter frequency to ${f}`}
              >
                {f}
              </span>
            );
          })}
        </div>
      )}

      {/* Columns Header for AC Resistance Sweep (R mode) */}
      {isResAcSweep && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, paddingRight: 26, paddingLeft: 82 }}>
          {R_FREQS.map(f => {
            const isCurrentFreq = currentFreq === f && isActive;
            return (
              <span
                key={f}
                onClick={(e) => {
                  e.stopPropagation();
                  onFreqTabClick && onFreqTabClick(f);
                }}
                style={{
                  flex: 1,
                  fontSize: 9,
                  fontWeight: 700,
                  color: isCurrentFreq ? '#7c3aed' : '#64748b',
                  background: isCurrentFreq ? '#ede9fe' : '#f1f5f9',
                  border: `1px solid ${isCurrentFreq ? '#a78bfa' : '#cbd5e1'}`,
                  borderRadius: 4,
                  padding: '2px 0',
                  textAlign: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
                title={`Click to configure multimeter frequency to ${f}`}
              >
                {f}
              </span>
            );
          })}
        </div>
      )}

      {/* Columns Header for Impedance Z sweep (5 freqs — each cell holds Z on top, θ on bottom) */}
      {isImp && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 2, paddingRight: 26, paddingLeft: 82 }}>
            {Z_FREQS.map(f => {
              const isCurrentFreq = currentFreq === f && isActive;
              return (
                <span
                  key={f}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFreqTabClick && onFreqTabClick(f, 'Z');
                  }}
                  style={{
                    flex: 1,
                    fontSize: 9,
                    fontWeight: 700,
                    color: isCurrentFreq ? '#0e7490' : '#64748b',
                    background: isCurrentFreq ? '#cffafe' : '#f1f5f9',
                    border: `1px solid ${isCurrentFreq ? '#22d3ee' : '#cbd5e1'}`,
                    borderRadius: 4,
                    padding: '2px 0',
                    textAlign: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.15s ease-in-out',
                  }}
                  title={`Click to configure multimeter to Z @ ${f}`}
                >
                  {f}
                </span>
              );
            })}
            <span style={{ width: 22, flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, paddingRight: 26, paddingLeft: 82 }}>
            {Z_FREQS.map(f => (
              <span key={f} style={{ flex: 1, fontSize: 7.5, fontWeight: 700, color: '#94a3b8', textAlign: 'center' }}>
                Z (Ω) / θ (°)
              </span>
            ))}
            <span style={{ width: 22, flexShrink: 0 }} />
          </div>
        </>
      )}

      {/* Phase Rows */}
      {keys.map(k => {
        const fKey = `${prefix}_${k}`;
        const val = captured[fKey];
        
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
          : (isOverload(correctedVal, currentMode) ? 'O.L' : (correctedVal !== undefined && correctedVal !== null ? String(correctedVal) : ''));

        const zVal = captured[`${fKey}_z`];
        const degVal = captured[`${fKey}_deg`];

        const isZFocused = focusedField === `${fKey}_z`;
        const isDegFocused = focusedField === `${fKey}_deg`;

        const displayZ = isZFocused 
          ? (editValues[`${fKey}_z`] ?? '') 
          : (isOverload(zVal, 'Z') ? 'O.L' : (zVal !== undefined && zVal !== null ? String(zVal) : ''));

        const displayDeg = isDegFocused 
          ? (editValues[`${fKey}_deg`] ?? '') 
          : (degVal !== undefined && degVal !== null ? String(degVal) : '');

        return (
          <div key={k} style={{ ...S.row, gap: 4 }} onClick={e => e.stopPropagation()}>
            <span style={{ ...S.phaseLabel, width: 78 }}>Phase {k}</span>
            
            {isResAcSweep ? (
              <>
                {R_FREQS.map(f => {
                  const sweepKey = `${fKey}_${f}`;
                  const sweepVal = captured[sweepKey];
                  const isFocusedField = focusedField === sweepKey;

                  const activeVal = sweepVal;
                  const hasValue = activeVal !== undefined && activeVal !== null;
                  const displaySweepVal = isFocusedField
                    ? (editValues[sweepKey] ?? '')
                    : (isOverload(activeVal, 'R') ? 'O.L' : (hasValue ? String(activeVal) : ''));
                  const isCurrentSweep = sweepingField === fKey && activeSweepFreq === f;
                  return (
                    <input
                      key={f}
                      type="text"
                      value={displaySweepVal}
                      onFocus={() => handleFocus(sweepKey, activeVal)}
                      onChange={(e) => handleTextChange(sweepKey, e.target.value)}
                      onBlur={() => handleBlur(sweepKey)}
                      style={{
                        ...S.captureInput(hasValue),
                        borderColor: isCurrentSweep ? '#a78bfa' : undefined,
                        boxShadow: isCurrentSweep ? '0 0 0 2px #ede9fe' : undefined,
                        outline: 'none',
                        textAlign: 'center',
                        fontSize: 9,
                        padding: '2px 2px',
                      }}
                      placeholder="—"
                      title={`AC Resistance at ${f}`}
                    />
                  );
                })}
                <button
                  onClick={() => onSweep && onSweep(fKey, 'R')}
                  disabled={sweepingField !== null}
                  title="Sweep all frequencies (AC R mode) and capture values"
                  style={{
                    background: sweepingField === fKey ? '#f5f3ff' : '#f5f3ff',
                    border: `1px solid ${sweepingField === fKey ? '#a78bfa' : '#c4b5fd'}`,
                    borderRadius: 4,
                    width: 22,
                    height: 20,
                    fontSize: 10,
                    cursor: sweepingField !== null ? 'not-allowed' : 'pointer',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {sweepingField === fKey ? '⏳' : '⚡'}
                </button>
              </>
            ) : isInd ? (
              <>
                {L_FREQS.map(f => {
                  const sweepKey = `${fKey}_${f}`;
                  const sweepVal = captured[sweepKey];
                  const isFocusedField = focusedField === sweepKey;

                  const activeVal = sweepVal;
                  const hasValue = activeVal !== undefined && activeVal !== null;
                  const displaySweepVal = isFocusedField
                    ? (editValues[sweepKey] ?? '')
                    : (isOverload(activeVal, 'L') ? 'O.L' : (hasValue ? String(activeVal) : ''));
                  
                  const isCurrentSweep = sweepingField === fKey && activeSweepFreq === f;

                  return (
                    <input
                      key={f}
                      type="text"
                      value={displaySweepVal}
                      onFocus={() => handleFocus(sweepKey, activeVal)}
                      onChange={(e) => handleTextChange(sweepKey, e.target.value)}
                      onBlur={() => handleBlur(sweepKey)}
                      style={{
                        ...S.captureInput(hasValue),
                        borderColor: isCurrentSweep ? '#eab308' : undefined,
                        boxShadow: isCurrentSweep ? '0 0 0 2px #fef08a' : undefined,
                        outline: 'none',
                        textAlign: 'center',
                        fontSize: 9,
                        padding: '2px 2px'
                      }}
                      placeholder="—"
                      title={`Inductance at ${f}`}
                    />
                  );
                })}
                
                <button
                  onClick={() => onSweep && onSweep(fKey, 'L')}
                  disabled={sweepingField !== null}
                  title="Sweep all frequencies and capture values"
                  style={{
                    background: sweepingField === fKey ? '#fefce8' : '#eff6ff',
                    border: `1px solid ${sweepingField === fKey ? '#eab308' : '#bfdbfe'}`,
                    borderRadius: 4,
                    width: 22,
                    height: 20,
                    fontSize: 10,
                    cursor: sweepingField !== null ? 'not-allowed' : 'pointer',
                    color: '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {sweepingField === fKey ? '⏳' : '⚡'}
                </button>
              </>
            ) : isImp ? (
              <>
                {Z_FREQS.map(f => {
                  const zKey = `${fKey}_${f}_z`;
                  const dKey = `${fKey}_${f}_deg`;
                  const zSweepVal = captured[zKey];
                  const dSweepVal = captured[dKey];
                  const isZFocusedField = focusedField === zKey;
                  const isDFocusedField = focusedField === dKey;
                  const hasZ = zSweepVal !== undefined && zSweepVal !== null;
                  const hasD = dSweepVal !== undefined && dSweepVal !== null;
                  const displaySweepZ = isZFocusedField
                    ? (editValues[zKey] ?? '')
                    : (isOverload(zSweepVal, 'Z') ? 'O.L' : (hasZ ? String(zSweepVal) : ''));
                  const displaySweepD = isDFocusedField
                    ? (editValues[dKey] ?? '')
                    : (hasD ? String(dSweepVal) : '');
                  const isCurrentSweep = sweepingField === fKey && activeSweepFreq === f;

                  return (
                    <div key={f} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <input
                        type="text"
                        value={displaySweepZ}
                        onFocus={() => handleFocus(zKey, zSweepVal)}
                        onChange={(e) => handleTextChange(zKey, e.target.value)}
                        onBlur={() => handleBlur(zKey)}
                        style={{
                          ...S.captureInput(hasZ),
                          borderColor: isCurrentSweep ? '#22d3ee' : undefined,
                          boxShadow: isCurrentSweep ? '0 0 0 2px #cffafe' : undefined,
                          outline: 'none',
                          textAlign: 'center',
                          fontSize: 9,
                          padding: '2px 2px',
                        }}
                        placeholder="Z"
                        title={`Impedance Z at ${f}`}
                      />
                      <input
                        type="text"
                        value={displaySweepD}
                        onFocus={() => handleFocus(dKey, dSweepVal)}
                        onChange={(e) => handleTextChange(dKey, e.target.value)}
                        onBlur={() => handleBlur(dKey)}
                        style={{
                          ...S.captureInput(hasD),
                          borderColor: isCurrentSweep ? '#22d3ee' : undefined,
                          boxShadow: isCurrentSweep ? '0 0 0 2px #cffafe' : undefined,
                          outline: 'none',
                          textAlign: 'center',
                          fontSize: 9,
                          padding: '2px 2px',
                        }}
                        placeholder="θ°"
                        title={`Phase angle θ at ${f}`}
                      />
                    </div>
                  );
                })}

                <button
                  onClick={() => onSweep && onSweep(fKey, 'Z')}
                  disabled={sweepingField !== null}
                  title="Sweep all frequencies (Z + θ) and capture values"
                  style={{
                    background: sweepingField === fKey ? '#ecfeff' : '#ecfeff',
                    border: `1px solid ${sweepingField === fKey ? '#22d3ee' : '#a5f3fc'}`,
                    borderRadius: 4,
                    width: 22,
                    height: 42,
                    fontSize: 10,
                    cursor: sweepingField !== null ? 'not-allowed' : 'pointer',
                    color: '#0e7490',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {sweepingField === fKey ? '⏳' : '⚡'}
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
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

  const unit = (localMode === 'R' || localMode === 'DCR') ? 'Ω' : localMode === 'L' ? 'mH' : localMode === 'Z' ? 'Ω' : 'nF';

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
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>L / C / R / Z / DCR (Primary)</label>
              <select value={localMode} onChange={e => setLocalMode(e.target.value)} style={selectStyle}>
                <option value="L">L — Inductance (H)</option>
                <option value="C">C — Capacitance (F)</option>
                <option value="R">R — Resistance (Ω)</option>
                <option value="DCR">DCR — DC Resistance (Ω)</option>
                <option value="Z">Z — Impedance (Ω∠°)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Q / D / R / THETA (Secondary)</label>
              <select value={localSecondary} onChange={e => setLocalSecondary(e.target.value)} style={selectStyle}>
                <option value="Q">Q (Quality Factor)</option>
                <option value="D">D (Dissipation)</option>
                <option value="R">R (ESR)</option>
                <option value="THETA">THETA (Phase Angle)</option>
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

          {/* Demo mode notice — DISABLED */}
          {false && demoMode && (
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
export default function MultimeterTab({ record, demoMode = false, multimeterStatus, onChange, onCaptureChange, visible = true }) {
  const correctWindingTo20 = record?.correctWindingTo20 || false;
  const [mode,      setMode]      = useState('DCR');
  const [freq,      setFreq]      = useState('120Hz');
  const [secondary, setSecondary] = useState('THETA');
  const [equivalent, setEquivalent] = useState('SER');
  const [liveValue, setLiveValue] = useState(0);
  const [liveSecondaryValue, setLiveSecondaryValue] = useState(0);
  const [captured,  setCaptured]  = useState({});
  const [frequencies, setFrequencies] = useState({});
  const [temperature, setTemperature] = useState('25');
  const [showSetup, setShowSetup] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState('stator');
  const [sweepingField, setSweepingField] = useState(null);
  const [activeSweepFreq, setActiveSweepFreq] = useState(null);
  const [sweepErrors, setSweepErrors] = useState([]);

  const getPanelStyle = (panelName) => {
    const isCollapsed = expandedPanel !== 'both' && expandedPanel !== panelName;
    return {
      ...S.windingPanel,
      flex: isCollapsed ? 'none' : 1,
      width: isCollapsed ? 45 : undefined,
      padding: isCollapsed ? '10px 4px' : 10,
      cursor: isCollapsed ? 'pointer' : undefined,
      overflow: 'hidden',
      transition: 'all 0.3s ease-in-out',
    };
  };

  const handlePanelHeaderClick = (panelName) => {
    if (expandedPanel === panelName) {
      setExpandedPanel('both');
    } else {
      setExpandedPanel(panelName);
    }
  };

  // sweepMode: 'L' for inductance sweep, 'R' for AC resistance sweep
  const handleSweep = async (fKey, sweepMode = 'L') => {
    if (!confirmReTest()) return;
    setSweepingField(fKey);
    setSweepErrors([]);

    const freqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    const originalFreq = freq;
    const originalMode = mode;

    // Force the app mode + secondary to match the sweep type so the header/live
    // readout reflect the sweep in progress and the group card highlights active.
    const sweepSecondary = sweepMode === 'Z' ? 'THETA' : secondary;
    if (sweepMode !== mode) {
      setMode(sweepMode);
      if (sweepMode === 'Z') setSecondary('THETA');
      // Send an explicit mode change command to the device up-front so the
      // physical LCR is in the right mode before we start the sweep loop.
      // Without this, users who click ⚡ without first clicking the group card
      // see the sweep populate values while the device (and mode badge) still
      // read the previous mode until the first per-freq command lands.
      if (!demoMode && api.sendMultimeterCommand) {
        try {
          await api.sendMultimeterCommand(sweepMode, freqs[0], sweepSecondary, equivalent);
          // Small settle after the initial mode switch so the device is ready
          // for the first frequency step.
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          console.error(`[Sweep] Failed to pre-set mode ${sweepMode}:`, err);
        }
      }
    }

    // For Z sweep: compute the group's spot freq so we can mirror to `_z`/`_deg`
    // (keeps the existing single-freq report path working unchanged).
    const groupPrefix = sweepMode === 'Z' ? fKey.substring(0, fKey.lastIndexOf('_')) : null;
    const groupFreqKey = groupPrefix ? `${groupPrefix}_freq` : null;
    const spotFreq = groupFreqKey ? (frequencies[groupFreqKey] || '1kHz') : null;

    for (const f of freqs) {
      setActiveSweepFreq(f);
      // Move the header freq tab along with the sweep so it's visually clear
      // the mapping runs 100Hz → 100kHz regardless of the previously-selected freq.
      setFreq(f);
      const phaseSweepKey = `${fKey}_${f}`;

      // ── DEMO SWEEP DISABLED (kept for reference) ──────────────────
      // if (demoMode) {
      //   await new Promise(resolve => setTimeout(resolve, 300));
      //   if (sweepMode === 'Z') {
      //     const zBase = f === '100Hz' ? 91.2 : f === '120Hz' ? 108.7 : f === '1kHz' ? 902.4 : f === '10kHz' ? 9012.5 : 89250.0;
      //     const degBase = f === '100Hz' ? 82.1 : f === '120Hz' ? 83.4 : f === '1kHz' ? 87.9 : f === '10kHz' ? 89.1 : 89.6;
      //     const zNoise = (Math.random() - 0.5) * zBase * 0.02;
      //     const degNoise = (Math.random() - 0.5) * 0.8;
      //     const zVal = parseFloat((zBase + zNoise).toFixed(3));
      //     const degVal = parseFloat((degBase + degNoise).toFixed(2));
      //     setCaptured(prev => {
      //       const next = { ...prev, [`${phaseSweepKey}_z`]: zVal, [`${phaseSweepKey}_deg`]: degVal };
      //       if (f === spotFreq) {
      //         next[`${fKey}_z`] = zVal;
      //         next[`${fKey}_deg`] = degVal;
      //       }
      //       return next;
      //     });
      //     if (record) {
      //       await api.saveMultimeterField(record.id, `${phaseSweepKey}_z`, { value: zVal, temperature: parseFloat(temperature) || 0 });
      //       await api.saveMultimeterField(record.id, `${phaseSweepKey}_deg`, { value: degVal, temperature: parseFloat(temperature) || 0 });
      //       if (f === spotFreq) {
      //         await api.saveMultimeterField(record.id, `${fKey}_z`, { value: zVal, temperature: parseFloat(temperature) || 0 });
      //         await api.saveMultimeterField(record.id, `${fKey}_deg`, { value: degVal, temperature: parseFloat(temperature) || 0 });
      //       }
      //     }
      //   } else {
      //     let simVal;
      //     if (sweepMode === 'R') {
      //       const base = f === '100Hz' ? 12.41 : f === '120Hz' ? 12.43 : f === '1kHz' ? 12.48 : f === '10kHz' ? 12.89 : 14.21;
      //       const noise = (Math.random() - 0.5) * base * 0.01;
      //       simVal = parseFloat((base + noise).toFixed(4));
      //     } else {
      //       const base = f === '100Hz' ? 145.2 : f === '120Hz' ? 144.8 : f === '1kHz' ? 142.1 : f === '10kHz' ? 138.5 : 132.0;
      //       const noise = (Math.random() - 0.5) * base * 0.02;
      //       simVal = parseFloat((base + noise).toFixed(3));
      //     }
      //     setCaptured(prev => ({ ...prev, [phaseSweepKey]: simVal }));
      //     if (record) {
      //       await api.saveMultimeterField(record.id, phaseSweepKey, {
      //         value: simVal,
      //         temperature: parseFloat(temperature) || 0
      //       });
      //     }
      //   }
      // } else {
      // ── end demo sweep ──
      {
        // In Real Device Mode — robust 3-step capture:
        try {
          // ── Step 1: Send mode + frequency command to the LCR meter ──
          await api.sendMultimeterCommand(sweepMode, f, sweepSecondary, equivalent);
        } catch (err) {
          console.error(`[Sweep] Failed to send command for ${f}:`, err);
          setSweepErrors(prev => [...prev, `⚠️ Failed to send command at ${f}: ${err.message || err}`]);
          continue;
        }

        try {
          // ── Step 2: Wait 1500ms for LCR analog circuit to fully settle ──
          await new Promise(resolve => setTimeout(resolve, 1500));

          // ── Step 3: Wait for the NEXT fresh IPC packet after settling ──
          const countAfterSettle = packetCountRef.current;
          const packetTimeout = Date.now() + 3000;
          while (packetCountRef.current <= countAfterSettle) {
            if (Date.now() > packetTimeout) {
              setSweepErrors(prev => [...prev, `⚠️ No fresh reading received at ${f} — skipped`]);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          const val = liveValueRef.current;

          if (sweepMode === 'Z') {
            const degVal = liveSecondaryValue;
            setCaptured(prev => {
              const next = { ...prev, [`${phaseSweepKey}_z`]: val, [`${phaseSweepKey}_deg`]: degVal };
              if (f === spotFreq) {
                next[`${fKey}_z`] = val;
                next[`${fKey}_deg`] = degVal;
              }
              return next;
            });
            if (record) {
              await api.saveMultimeterField(record.id, `${phaseSweepKey}_z`, { value: val, temperature: parseFloat(temperature) || 0 });
              await api.saveMultimeterField(record.id, `${phaseSweepKey}_deg`, { value: degVal, temperature: parseFloat(temperature) || 0 });
              if (f === spotFreq) {
                await api.saveMultimeterField(record.id, `${fKey}_z`, { value: val, temperature: parseFloat(temperature) || 0 });
                await api.saveMultimeterField(record.id, `${fKey}_deg`, { value: degVal, temperature: parseFloat(temperature) || 0 });
              }
            }
          } else {
            setCaptured(prev => ({ ...prev, [phaseSweepKey]: val }));
            if (record) {
              await api.saveMultimeterField(record.id, phaseSweepKey, {
                value: val,
                temperature: parseFloat(temperature) || 0
              });
            }
          }
        } catch (err) {
          console.error(`[Sweep] Error capturing value at ${f}:`, err);
          setSweepErrors(prev => [...prev, `⚠️ Capture error at ${f}: ${err.message || err}`]);
        }
      }
    }

    // Cleanup/restore original mode + frequency
    setActiveSweepFreq(null);
    setSweepingField(null);
    setFreq(originalFreq);
    if (originalMode !== sweepMode) {
      setMode(originalMode);
    }

    if (!demoMode && api.sendMultimeterCommand) {
      try {
        const restoreSecondary = originalMode === 'Z' ? 'THETA' : secondary;
        await api.sendMultimeterCommand(originalMode, originalFreq, restoreSecondary, equivalent);
      } catch (err) {
        console.error('[Sweep] Failed to restore original mode/frequency:', err);
        setSweepErrors(prev => [...prev, `⚠️ Failed to restore to ${originalMode}/${originalFreq}: ${err.message || err}`]);
      }
    }
  };

  // Focus & manual edit values
  const [focusedField, setFocusedField] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Watchdog Telemetry states
  const [telemetryAlert, setTelemetryAlert] = useState(false);

  const liveRef = useRef(null);
  const watchdogIntervalRef = useRef(null);
  const lastValueTime = useRef(Date.now());
  // Mutable refs for sweep: avoids React closure stale-value bug
  const liveValueRef = useRef(0);
  const packetCountRef = useRef(0);

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
      let tempVal = record?.temperature || '25';
      Object.entries(data || {}).forEach(([field, d]) => {
        if (d.value !== undefined && d.value !== null) {
          vals[field] = d.value;
        }
        if (d.frequency !== undefined && d.frequency !== null) {
          freqs[field] = d.frequency;
        }
        if (d.temperature !== undefined && d.temperature !== 0) tempVal = String(d.temperature);
      });

      // Backfill legacy single-freq Z spot values (`{group}_imp_{phase}_z` /
      // `_deg`) into the split-freq grid at the group's Spot Freq column,
      // so records saved before the split-freq Z UI still display data.
      ['stator', 'rotor'].forEach(group => {
        const spotFreq = freqs[`${group}_imp_freq`] || '1kHz';
        IMP_KEYS.forEach(phase => {
          const zSpot = `${group}_imp_${phase}_z`;
          const dSpot = `${group}_imp_${phase}_deg`;
          const zBucket = `${group}_imp_${phase}_${spotFreq}_z`;
          const dBucket = `${group}_imp_${phase}_${spotFreq}_deg`;
          if (vals[zSpot] !== undefined && vals[zBucket] === undefined) {
            vals[zBucket] = vals[zSpot];
          }
          if (vals[dSpot] !== undefined && vals[dBucket] === undefined) {
            vals[dBucket] = vals[dSpot];
          }
        });
      });

      setCaptured(vals);
      setFrequencies(freqs);
      setTemperature(tempVal);

      if (Object.keys(vals).length > 0) {
        hadDataOnLoad.current = true;
      }
    });
  // NOTE: Only re-run when the record ID changes (different record opened).
  // Do NOT include record?.temperature here — temperature is loaded from the
  // stored DB data inside the effect. Including it would reload all captured
  // state every time the user edits the temperature field in InfoTab.
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watchdog & live feed simulation
  useEffect(() => {
    clearInterval(liveRef.current);
    clearInterval(watchdogIntervalRef.current);
    setTelemetryAlert(false);

    // ── DEMO SIMULATION DISABLED (kept for reference) ──────────────────
    // if (demoMode) {
    //   const getBase = () => {
    //     if (mode === 'R' || mode === 'DCR') return 12.4;
    //     if (mode === 'L') return 145.2;
    //     if (mode === 'C') return 47.8;
    //     if (mode === 'Z') {
    //       return freq === '100Hz' ? 91.2
    //            : freq === '120Hz' ? 108.7
    //            : freq === '1kHz'  ? 902.4
    //            : freq === '10kHz' ? 9012.5
    //            : freq === '100kHz' ? 89250.0
    //            : 902.4;
    //     }
    //     return 47.8;
    //   };
    //   liveRef.current = setInterval(() => {
    //     const base = getBase();
    //     const noise = (Math.random() - 0.5) * base * 0.05;
    //     const val = parseFloat((base + noise).toFixed(3));
    //     setLiveValue(val);
    //     liveValueRef.current = val;
    //     packetCountRef.current += 1;
    //     let secVal;
    //     if (mode === 'Z') {
    //       const degBase = freq === '100Hz' ? 82.1
    //                     : freq === '120Hz' ? 83.4
    //                     : freq === '1kHz'  ? 87.9
    //                     : freq === '10kHz' ? 89.1
    //                     : freq === '100kHz' ? 89.6
    //                     : 87.9;
    //       secVal = parseFloat((degBase + (Math.random() - 0.5) * 0.8).toFixed(2));
    //     } else if (mode === 'L') {
    //       secVal = parseFloat((5 + (Math.random() - 0.5) * 0.6).toFixed(4));
    //     } else if (mode === 'C') {
    //       secVal = parseFloat((0.02 + (Math.random() - 0.5) * 0.006).toFixed(4));
    //     } else {
    //       secVal = parseFloat((Math.random() * 0.1).toFixed(4));
    //     }
    //     setLiveSecondaryValue(secVal);
    //   }, 400);
    // }
    // ── end demo simulation ──

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
        liveValueRef.current = v.primary;  // keep mutable ref in sync
        packetCountRef.current += 1;        // increment on every new IPC packet
      });
    }

    return () => {
      clearInterval(liveRef.current);
      clearInterval(watchdogIntervalRef.current);
      api.removeAllListeners('multimeter:live');
    };
  }, [mode, freq, multimeterOnline]);

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

    // ── Auto-switch mode to match the field being captured ──────────────────
    let requiredMode = null;
    if (fieldKey.includes('_res_')) {
      // Keep whichever resistance mode (DCR or R) is already active; default to DCR
      requiredMode = (mode === 'R') ? 'R' : 'DCR';
    } else if (fieldKey.includes('_ind_')) {
      requiredMode = 'L';
    } else if (fieldKey.includes('_cap_')) {
      requiredMode = 'C';
    } else if (fieldKey.includes('_imp_')) {
      requiredMode = 'Z';
    }

    if (requiredMode && requiredMode !== mode) {
      setMode(requiredMode);
      if (!demoMode && api.sendMultimeterCommand) {
        try {
          await api.sendMultimeterCommand(requiredMode, freq, secondary, equivalent);
        } catch (err) {
          console.error('Failed to auto-switch mode before capture:', err);
        }
      }
      // Wait for the device to stream a fresh reading in the new mode
      await new Promise(res => setTimeout(res, 600));
    }
    // ────────────────────────────────────────────────────────────────────────

    if (fieldKey.includes('_imp')) {
      const zVal = liveValueRef.current;
      const degVal = liveSecondaryValue;
      setCaptured(prev => ({ ...prev, [`${fieldKey}_z`]: zVal, [`${fieldKey}_deg`]: degVal }));
      if (record) {
        await api.saveMultimeterField(record.id, `${fieldKey}_z`, {
          value: zVal,
          temperature: parseFloat(temperature) || 0
        });
        await api.saveMultimeterField(record.id, `${fieldKey}_deg`, {
          value: degVal,
          temperature: parseFloat(temperature) || 0
        });
      }
    } else {
      const val = liveValueRef.current;
      setCaptured(prev => ({ ...prev, [fieldKey]: val }));
      if (record) {
        await api.saveMultimeterField(record.id, fieldKey, {
          value: val,
          temperature: parseFloat(temperature) || 0
        });
      }
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
  const handleFocus = async (fieldKey, currentVal) => {
    setFocusedField(fieldKey);
    setEditValues(prev => ({ ...prev, [fieldKey]: currentVal !== undefined && currentVal !== null ? String(currentVal) : '' }));

    let newMode = null;
    let newSecondary = secondary;

    if (fieldKey.includes('_res_')) {
      newMode = (mode === 'R') ? 'R' : 'DCR';
    } else if (fieldKey.includes('_ind_')) {
      newMode = 'L';
    } else if (fieldKey.includes('_cap_')) {
      newMode = 'C';
    } else if (fieldKey.includes('_imp_')) {
      newMode = 'Z';
    }

    if (newMode && newMode !== mode) {
      setMode(newMode);
      if (sweepingField === null && !demoMode && api.sendMultimeterCommand) {
        try {
          await api.sendMultimeterCommand(newMode, freq, secondary, equivalent);
        } catch (err) {
          console.error('Failed to auto-configure multimeter mode on focus:', err);
        }
      }
    }
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
        value: finalVal === undefined ? null : finalVal,
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

  const handleSelectGroup = async (prefix) => {
    let newMode = mode;

    if (prefix.includes('_res')) {
      newMode = (mode === 'R') ? 'R' : 'DCR';
    } else if (prefix.includes('_ind')) {
      newMode = 'L';
    } else if (prefix.includes('_cap')) {
      newMode = 'C';
    } else if (prefix.includes('_imp')) {
      newMode = 'Z';
    }

    if (newMode !== mode) {
      setMode(newMode);
      if (sweepingField === null && !demoMode && api.sendMultimeterCommand) {
        try {
          await api.sendMultimeterCommand(newMode, freq, secondary, equivalent);
        } catch (err) {
          console.error('Failed to configure multimeter mode on group click:', err);
        }
      }
    }
  };

  const handleResistanceModeToggle = async (m) => {
    setMode(m);
    if (!demoMode && api.sendMultimeterCommand) {
      try {
        await api.sendMultimeterCommand(m, freq, secondary, equivalent);
      } catch (err) {
        console.error('Failed to toggle resistance mode:', err);
      }
    }
  };

  const handleFreqTabClick = async (f, targetMode = null) => {
    // Preserve current mode if compatible; otherwise use targetMode (from Z tab) or fall back to L
    let newMode;
    if (targetMode) {
      newMode = targetMode;
    } else if (mode === 'R' || mode === 'L' || mode === 'Z') {
      newMode = mode;
    } else {
      newMode = 'L';
    }
    const newSecondary = newMode === 'Z' ? 'THETA' : secondary;
    setFreq(f);
    setMode(newMode);
    if (!demoMode && api.sendMultimeterCommand) {
      try {
        await api.sendMultimeterCommand(newMode, f, newSecondary, equivalent);
      } catch (err) {
        console.error('Failed to configure multimeter frequency on tab click:', err);
      }
    }
  };

  // Updates global freq + sends multimeter command (keeps current mode) when
  // the group-header frequency dropdown is changed for C / R / Z groups.
  const handleHeaderFreqChange = async (groupFreqKey, freqVal) => {
    // Save per-group frequency for record-keeping
    setFrequencies(prev => ({ ...prev, [groupFreqKey]: freqVal }));
    if (record) {
      await api.saveMultimeterField(record.id, groupFreqKey, { frequency: freqVal });
    }
    // Update the global freq and push to the device
    setFreq(freqVal);
    if (!demoMode && api.sendMultimeterCommand) {
      try {
        await api.sendMultimeterCommand(mode, freqVal, secondary, equivalent);
      } catch (err) {
        console.error('Failed to update multimeter frequency from group header:', err);
      }
    }
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

  const currentLImbFreq = (L_FREQS.includes(freq) ? freq : '100Hz');
  const statorResImb = calculateImbalance(captured['stator_res_1-2'], captured['stator_res_1-3'], captured['stator_res_2-3']);
  const statorIndImb = calculateImbalance(captured[`stator_ind_1-2_${currentLImbFreq}`], captured[`stator_ind_1-3_${currentLImbFreq}`], captured[`stator_ind_2-3_${currentLImbFreq}`]);
  const statorCapImb = calculateImbalance(captured['stator_cap_1-2'], captured['stator_cap_1-3'], captured['stator_cap_2-3']) || calculateImbalance(captured['stator_cap_1-GND'], captured['stator_cap_2-GND'], captured['stator_cap_3-GND']);
  const statorImpImb = calculateImbalance(captured['stator_imp_1-2_z'], captured['stator_imp_1-3_z'], captured['stator_imp_2-3_z']);

  const rotorResImb = calculateImbalance(captured['rotor_res_1-2'], captured['rotor_res_1-3'], captured['rotor_res_2-3']);
  const rotorIndImb = calculateImbalance(captured[`rotor_ind_1-2_${currentLImbFreq}`], captured[`rotor_ind_1-3_${currentLImbFreq}`], captured[`rotor_ind_2-3_${currentLImbFreq}`]);
  const rotorCapImb = calculateImbalance(captured['rotor_cap_1-2'], captured['rotor_cap_1-3'], captured['rotor_cap_2-3']) || calculateImbalance(captured['rotor_cap_1-GND'], captured['rotor_cap_2-GND'], captured['rotor_cap_3-GND']);
  const rotorImpImb = calculateImbalance(captured['rotor_imp_1-2_z'], captured['rotor_imp_1-3_z'], captured['rotor_imp_2-3_z']);

  function renderImbalanceChip(imb, label) {
    const isPending = imb === null;
    const pct = isPending ? 0 : Math.min(imb, 100);
    const color = isPending ? '#94a3b8' : imb > 5 ? '#dc2626' : imb > 2 ? '#d97706' : '#10b981';
    const statusText = isPending ? '—' : imb > 5 ? 'HIGH' : imb > 2 ? 'WARN' : 'OK';
    const bgColor = isPending ? '#f8fafc' : imb > 5 ? '#fef2f2' : imb > 2 ? '#fffbeb' : '#f0fdf4';
    const borderColor = isPending ? '#e2e8f0' : imb > 5 ? '#fecaca' : imb > 2 ? '#fde68a' : '#bbf7d0';

    return (
      <div style={{
        background: bgColor, border: `1px solid ${borderColor}`,
        borderRadius: 5, padding: '3px 6px',
        display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: isPending ? '#cbd5e1' : color, fontFamily: 'monospace' }}>
              {isPending ? '—' : `${imb.toFixed(1)}%`}
            </span>
            <span style={{
              fontSize: 6.5, fontWeight: 800, color: '#fff',
              background: color, borderRadius: 2, padding: '1px 2px',
              lineHeight: 1,
            }}>{statusText}</span>
          </div>
        </div>
        <div style={{ height: 2, background: '#e2e8f0', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1, transition: 'width 0.4s ease' }} />
        </div>
      </div>
    );
  }

  const tempNum = Math.min(Math.max(parseFloat(temperature) || 0, 0), 100);
  const unit = (mode === 'R' || mode === 'DCR' || mode === 'Z') ? 'Ω' : mode === 'L' ? 'mH' : 'nF';

  if (!visible) {
    return <div style={{ display: 'none' }} />;
  }

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
            ['Mode', sweepingField ? (sweepingField.includes('_res') ? 'Resistance (R)' : sweepingField.includes('_imp') ? 'Impedance (Z)' : 'Inductance (L)') : (mode === 'DCR' ? 'DCR' : mode === 'R' ? 'Resistance (R)' : mode === 'L' ? 'Inductance (L)' : mode === 'C' ? 'Capacitance (C)' : mode === 'Z' ? 'Impedance (Z)' : 'Capacitance')],
            ['Freq', sweepingField ? activeSweepFreq : (mode === 'DCR' ? '—' : freq)],
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
            background: multimeterOnline ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${multimeterOnline ? '#a7f3d0' : '#fca5a5'}`,
            borderRadius: 20, padding: '3px 10px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: multimeterOnline ? '#10b981' : '#ef4444', display: 'inline-block' }}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: multimeterOnline ? '#065f46' : '#991b1b' }}>
              {multimeterOnline ? '✅ Multimeter Online' : '⚠️ Multimeter Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>

        {/* STATOR WINDING */}
        <div
          style={getPanelStyle('stator')}
          onClick={() => {
            if (expandedPanel === 'rotor') setExpandedPanel('both');
          }}
        >
          {expandedPanel === 'rotor' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, height: '100%', justifyContent: 'center', userSelect: 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', writingMode: 'vertical-lr', textOrientation: 'mixed', whiteSpace: 'nowrap' }}>
                🔵 Stator Winding
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>▶</span>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', paddingBottom: 6, borderBottom: '2px solid #eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePanelHeaderClick('stator');
                  }} 
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}
                  title="Click to expand stator / collapse rotor tests"
                >
                  <span>🔵 Stator Winding</span>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                    {expandedPanel === 'stator' ? ' ◀ (Show Both)' : ' ◀▶ (Expand)'}
                  </span>
                </span>
              </div>

              {/* Stator grid: Resistance+Inductance left, Capacitance+Impedance right */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MeasGroup
                    title="Winding Resistance"
                    symbol="R"
                    keys={RES_KEYS}
                    prefix="stator_res"
                    unit="Ω"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    onHeaderFreqChange={handleHeaderFreqChange}
                    onModeToggle={handleResistanceModeToggle}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                  <MeasGroup
                    title="Winding Inductance"
                    symbol="L"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MeasGroup
                    title="Winding Capacitance"
                    symbol="C"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    onHeaderFreqChange={handleHeaderFreqChange}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                  <MeasGroup
                    title="Winding Impedance"
                    symbol="Z"
                    keys={IMP_KEYS}
                    prefix="stator_imp"
                    unit="Ω"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    onHeaderFreqChange={handleHeaderFreqChange}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                </div>
              </div>

            </>
          )}
        </div>

        {/* ROTOR WINDING */}
        <div
          style={getPanelStyle('rotor')}
          onClick={() => {
            if (expandedPanel === 'stator') setExpandedPanel('both');
          }}
        >
          {expandedPanel === 'stator' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, height: '100%', justifyContent: 'center', userSelect: 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', writingMode: 'vertical-lr', textOrientation: 'mixed', whiteSpace: 'nowrap' }}>
                🔴 Rotor Winding
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>◀</span>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e3a8a', paddingBottom: 6, borderBottom: '2px solid #eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePanelHeaderClick('rotor');
                  }} 
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}
                  title="Click to expand rotor / collapse stator tests"
                >
                  <span>🔴 Rotor Winding</span>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                    {expandedPanel === 'rotor' ? ' ◀ (Show Both)' : ' ◀▶ (Expand)'}
                  </span>
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MeasGroup
                    title="Winding Resistance"
                    symbol="R"
                    keys={RES_KEYS}
                    prefix="rotor_res"
                    unit="Ω"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    onHeaderFreqChange={handleHeaderFreqChange}
                    onModeToggle={handleResistanceModeToggle}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                  <MeasGroup
                    title="Winding Inductance"
                    symbol="L"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MeasGroup
                    title="Winding Capacitance"
                    symbol="C"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    onHeaderFreqChange={handleHeaderFreqChange}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                  <MeasGroup
                    title="Winding Impedance"
                    symbol="Z"
                    keys={IMP_KEYS}
                    prefix="rotor_imp"
                    unit="Ω"
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
                    onSweep={handleSweep}
                    sweepingField={sweepingField}
                    activeSweepFreq={activeSweepFreq}
                    onSelectGroup={handleSelectGroup}
                    onFreqTabClick={handleFreqTabClick}
                    onHeaderFreqChange={handleHeaderFreqChange}
                    currentMode={mode}
                    currentFreq={freq}
                  />
                </div>
              </div>

            </>
          )}
        </div>

      </div>

      {/* ── SWEEP ERROR BANNERS ── */}
      {sweepErrors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          {sweepErrors.map((msg, i) => (
            <div key={i} style={{
              background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8,
              padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, fontSize: 11, color: '#9a3412', fontWeight: 600,
            }}>
              <span>{msg}</span>
              <button
                onClick={() => setSweepErrors(prev => prev.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c2410c', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── ALWAYS-VISIBLE BOTTOM ROW: Live Readout | Temperature | Phase Balance ── */}
      <div style={{
        display: 'flex', gap: 10, flexShrink: 0, alignItems: 'stretch',
      }}>

        {/* Live Readout */}
        <div style={{ background: '#0f172a', borderRadius: 10, padding: '10px 20px', display: 'flex', gap: 36, alignItems: 'center', flex: '0 0 auto', minWidth: 520 }}>
          <div>
            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Primary ({mode})</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: '#10b981', letterSpacing: -1 }}>
                {isOverload(liveValue, mode) ? 'O.L' : 
                  ((correctWindingTo20 && (mode === 'R' || mode === 'DCR'))
                    ? parseFloat((liveValue * (254.5 / (234.5 + (isNaN(parseFloat(temperature)) ? 25 : parseFloat(temperature))))).toFixed(3))
                    : liveValue
                  ).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                }
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{unit}</span>
            </div>
          </div>
          <div>
            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, display: 'block', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Secondary ({secondary})</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: -1 }}>
                {liveSecondaryValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderLeft: '1px solid #1e293b', paddingLeft: 16, marginLeft: 'auto' }}>
            {[
              ['Mode', sweepingField ? (sweepingField.includes('_res') ? 'R' : 'L') : (mode === 'DCR' ? 'DCR' : mode === 'R' ? 'R' : mode === 'L' ? 'L' : mode === 'C' ? 'C' : mode === 'Z' ? 'Z' : 'C')],
              ['Freq', sweepingField ? activeSweepFreq : (mode === 'DCR' ? '—' : freq)],
              ['Sec', secondary],
              ['Eq', equivalent === 'PAL' ? 'PAR' : 'SER']
            ].map(([l, v]) => (
              <div key={l} style={{ fontSize: 9, color: '#64748b' }}>
                {l}: <strong style={{ color: '#cbd5e1' }}>{v}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              <span style={{ fontSize: 8, color: '#10b981', fontWeight: 700 }}>LIVE</span>
            </div>
          </div>
        </div>

        {/* Temperature */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto', minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 14 }}>🌡️</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase' }}>Temperature</span>
          </div>
          {/* Big number */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <input
              type="number"
              step="0.1"
              value={temperature}
              onChange={e => {
                const v = e.target.value;
                setTemperature(v);
                if (record) {
                  const tNum = parseFloat(v) || 0;
                  Object.keys(captured).forEach(f => {
                    api.saveMultimeterField(record.id, f, { temperature: tNum });
                  });
                }
              }}
              style={{
                width: 112, border: 'none', outline: 'none',
                fontSize: 28, fontWeight: 800, color: `hsl(${120 - tempNum * 1.2}, 70%, 40%)`,
                fontFamily: 'monospace', background: 'transparent', padding: 0,
              }}
              min="0" max="200"
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>°C</span>
          </div>
          {/* Gradient bar */}
          <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${tempNum}%`,
              background: `linear-gradient(to right, #10b981, hsl(${120 - tempNum * 1.2}, 80%, 45%))`,
              borderRadius: 3,
              transition: 'width 0.4s ease, background 0.4s ease',
            }} />
          </div>
        </div>

        {/* Phase Balance Analysis */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, borderBottom: '1px solid #f1f5f9', paddingBottom: 3, width: '100%', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: 0.4 }}>📊 Phase Balance</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>R, L, C, Z imbalance</span>
          </div>

          {/* Stator & Rotor columns side by side */}
          <div style={{ display: 'flex', gap: 10, width: '100%', flex: 1 }}>
            {/* Stator column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid #f8fafc', paddingBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1e3a8a' }} />
                <span style={{ fontSize: 8, fontWeight: 800, color: '#1e3a8a', letterSpacing: 0.5 }}>STA</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {renderImbalanceChip(statorResImb, 'R Res')}
                {renderImbalanceChip(statorIndImb, 'L Ind')}
                {renderImbalanceChip(statorCapImb, 'C Cap')}
                {renderImbalanceChip(statorImpImb, 'Z Imp')}
              </div>
            </div>

            {/* Separator line between Stator & Rotor */}
            <div style={{ width: 1, background: '#e2e8f0', alignSelf: 'stretch', margin: '2px 0' }} />

            {/* Rotor column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid #f8fafc', paddingBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#991b1b' }} />
                <span style={{ fontSize: 8, fontWeight: 800, color: '#991b1b', letterSpacing: 0.5 }}>ROT</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {renderImbalanceChip(rotorResImb, 'R Res')}
                {renderImbalanceChip(rotorIndImb, 'L Ind')}
                {renderImbalanceChip(rotorCapImb, 'C Cap')}
                {renderImbalanceChip(rotorImpImb, 'Z Imp')}
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
