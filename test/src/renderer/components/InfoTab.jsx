// src/renderer/components/InfoTab.jsx
import { useState, useCallback } from 'react';

export default function InfoTab({ record, records = [], onOpen, onDuplicate, onChange, loadRecords }) {
  const [savedMsg, setSavedMsg] = useState('💾 Auto-save enabled');
  const [redoModal, setRedoModal] = useState({ show: false, motor: null });

  const api = window.electronAPI;

  const handleFieldChange = useCallback((key, value) => {
    onChange(key, value);
    setSavedMsg('✅ Saved');
    setTimeout(() => setSavedMsg('💾 Auto-save enabled'), 1500);
  }, [onChange]);

  // Filter records by client name to show motors under the same client
  const clientNameFilter = record?.clientName || '';
  const clientMotors = records.filter(r => 
    clientNameFilter && r.clientName && 
    r.clientName.trim().toLowerCase() === clientNameFilter.trim().toLowerCase()
  );

  const openRedoModal = (motor) => {
    setRedoModal({ show: true, motor });
  };

  const closeRedoModal = () => {
    setRedoModal({ show: false, motor: null });
  };

  const handleRedoConfirm = async (overwrite) => {
    const motor = redoModal.motor;
    if (!motor) return;

    if (overwrite) {
      // OVERWRITE: Clear existing test data and open
      try {
        await api.clearRecordTestData(motor.id);
        if (loadRecords) await loadRecords();
        onOpen(motor);
      } catch (err) {
        console.error('Failed to clear test data:', err);
      }
    } else {
      // REPLICATE: Duplicate file with new test date
      try {
        const duplicated = await api.duplicateRecord(motor.id);
        // Set new date to current date
        const todayStr = new Date().toISOString().split('T')[0];
        const updated = await api.updateRecord(duplicated.id, { ...duplicated, date: todayStr });
        if (loadRecords) await loadRecords();
        onOpen(updated);
      } catch (err) {
        console.error('Failed to duplicate for redo:', err);
      }
    }
    closeRedoModal();
  };

  const inputStyle = {
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
    color: '#0f172a',
    outline: 'none',
    background: '#fff',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '16px',
    paddingRight: '28px',
  };

  const columnCardStyle = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    marginBottom: 4,
    letterSpacing: 0.3,
  };

  const sectionHeaderStyle = {
    fontSize: 14,
    fontWeight: 700,
    color: '#1e3a8a',
    borderBottom: '2px solid #eff6ff',
    paddingBottom: 8,
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <div style={{ padding: 16, height: 'calc(100vh - 112px)', overflowY: 'auto', boxSizing: 'border-box' }}>
      
      {/* 4-Column Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr 1fr', gap: 16, minHeight: '520px', alignItems: 'stretch' }}>
        
        {/* COLUMN 1: Client Information */}
        <div style={columnCardStyle}>
          <h3 style={sectionHeaderStyle}>👤 Client Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
            <div>
              <label style={labelStyle}>CLIENT NAME</label>
              <input
                type="text"
                value={record?.clientName || ''}
                onChange={e => handleFieldChange('clientName', e.target.value)}
                style={inputStyle}
                placeholder="e.g. Acme Industries"
              />
            </div>
            <div>
              <label style={labelStyle}>CLIENT ADDRESS</label>
              <input
                type="text"
                value={record?.clientAddress || ''}
                onChange={e => handleFieldChange('clientAddress', e.target.value)}
                style={inputStyle}
                placeholder="e.g. 100 Main St, NY"
              />
            </div>
            <div>
              <label style={labelStyle}>FACILITY NAME</label>
              <input
                type="text"
                value={record?.facilityName || ''}
                onChange={e => handleFieldChange('facilityName', e.target.value)}
                style={inputStyle}
                placeholder="e.g. Power Station A"
              />
            </div>
            <div>
              <label style={labelStyle}>FACILITY ADDRESS</label>
              <input
                type="text"
                value={record?.facilityAddress || ''}
                onChange={e => handleFieldChange('facilityAddress', e.target.value)}
                style={inputStyle}
                placeholder="e.g. Sector 4 Plant"
              />
            </div>
            <div>
              <label style={labelStyle}>TEST LOCATION</label>
              <input
                type="text"
                value={record?.location || ''}
                onChange={e => handleFieldChange('location', e.target.value)}
                style={inputStyle}
                placeholder="e.g. Substation 3B"
              />
            </div>
            <div>
              <label style={labelStyle}>MOTOR UTILITY TAG</label>
              <input
                type="text"
                value={record?.motorUtilityTag || ''}
                onChange={e => handleFieldChange('motorUtilityTag', e.target.value)}
                style={inputStyle}
                placeholder="e.g. 10DW12P001"
              />
            </div>
            <div>
              <label style={labelStyle}>MOTOR SERIAL NUMBER</label>
              <input
                type="text"
                value={record?.motorSerialNumber || ''}
                onChange={e => handleFieldChange('motorSerialNumber', e.target.value)}
                style={inputStyle}
                placeholder="e.g. SN-8839201"
              />
            </div>
            <div>
              <label style={labelStyle}>MOTOR MANUFACTURER</label>
              <input
                type="text"
                value={record?.motorManufacturer || ''}
                onChange={e => handleFieldChange('motorManufacturer', e.target.value)}
                style={inputStyle}
                placeholder="e.g. Siemens / GE"
              />
            </div>
            <div>
              <label style={labelStyle}>MOTOR MODEL NUMBER</label>
              <input
                type="text"
                value={record?.motorModelNumber || ''}
                onChange={e => handleFieldChange('motorModelNumber', e.target.value)}
                style={inputStyle}
                placeholder="e.g. 1LA8313-2AC"
              />
            </div>
            <div>
              <label style={labelStyle}>MANUFACTURING STANDARD</label>
              <input
                type="text"
                value={record?.manufacturingStandard || ''}
                onChange={e => handleFieldChange('manufacturingStandard', e.target.value)}
                style={inputStyle}
                placeholder="e.g. NEMA MG1 / IEC"
              />
            </div>
            <div>
              <label style={labelStyle}>TEST DATE</label>
              <input
                type="date"
                value={record?.date || ''}
                onChange={e => handleFieldChange('date', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* COLUMN 2: Motors List */}
        <div style={columnCardStyle}>
          <h3 style={sectionHeaderStyle}>📋 Client Motors List</h3>
          
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px 0', lineHeight: 1.4 }}>
            {clientNameFilter 
              ? `Showing motors for Client: "${clientNameFilter}"` 
              : "Enter a Client Name in Column 1 to filter motors."}
          </p>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #f1f5f9', borderRadius: 8, padding: 8, background: '#fafafa' }}>
            {clientMotors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#cbd5e1', fontSize: 12 }}>
                {clientNameFilter ? "No motor files found. Modify or duplicate this motor to expand the list." : "No client selected."}
              </div>
            ) : (
              clientMotors.map(m => {
                const isActive = m.id === record?.id;
                return (
                  <div
                    key={m.id}
                    style={{
                      border: `1px solid ${isActive ? '#bfdbfe' : '#e2e8f0'}`,
                      borderRadius: 8,
                      padding: 10,
                      background: isActive ? '#eff6ff' : '#fff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#1e40af' : '#1e293b', margin: 0 }}>
                          {m.motorUtilityTag || '(No Utility Tag)'}
                        </p>
                        <p style={{ fontSize: 10, color: '#64748b', margin: '2px 0 0 0' }}>
                          S/N: {m.motorSerialNumber || 'N/A'}
                        </p>
                      </div>
                      <span style={{ fontSize: 9, color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        {m.date || 'No Date'}
                      </span>
                    </div>

                    {/* Action buttons inside the item */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <button
                        onClick={() => onOpen(m)}
                        style={{
                          flex: 1, border: 'none', borderRadius: 4, background: isActive ? '#1e40af' : '#f1f5f9',
                          color: isActive ? '#fff' : '#475569', fontSize: 10, padding: '4px 6px', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        👁️ Open
                      </button>
                      <button
                        onClick={() => onDuplicate(m)}
                        style={{
                          flex: 1, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff',
                          color: '#475569', fontSize: 10, padding: '3px 6px', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        📋 Copy
                      </button>
                      <button
                        onClick={() => openRedoModal(m)}
                        style={{
                          flex: 1, border: 'none', borderRadius: 4, background: '#fee2e2',
                          color: '#b91c1c', fontSize: 10, padding: '4px 6px', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        🔄 Re-do
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 3: Nameplate Data */}
        <div style={columnCardStyle}>
          <h3 style={sectionHeaderStyle}>⚙️ Motor Nameplate Data</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
            <div>
              <label style={labelStyle}>EQUIPMENT TYPE</label>
              <select
                value={record?.equipmentType || 'Induction Motor'}
                onChange={e => handleFieldChange('equipmentType', e.target.value)}
                style={selectStyle}
              >
                <option value="Induction Motor">Induction Motor</option>
                <option value="Synchronous Motor">Synchronous Motor</option>
                <option value="DC Motor">DC Motor</option>
                <option value="Generator">Generator</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>POWER (kW)</label>
                <input
                  type="number"
                  value={record?.powerKw || ''}
                  onChange={e => handleFieldChange('powerKw', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 150"
                />
              </div>
              <div>
                <label style={labelStyle}>SPEED (RPM)</label>
                <input
                  type="number"
                  value={record?.speedRpm || ''}
                  onChange={e => handleFieldChange('speedRpm', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 1755"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>LINE VOLTAGE (V)</label>
                <input
                  type="number"
                  value={record?.lineVoltage || ''}
                  onChange={e => handleFieldChange('lineVoltage', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 600"
                />
              </div>
              <div>
                <label style={labelStyle}>COS FI (PF)</label>
                <input
                  type="number"
                  step="0.01"
                  value={record?.cosFi || ''}
                  onChange={e => handleFieldChange('cosFi', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 0.85"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>NOMINAL CURRENT (A)</label>
                <input
                  type="number"
                  value={record?.nominalCurrent || ''}
                  onChange={e => handleFieldChange('nominalCurrent', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 50"
                />
              </div>
              <div>
                <label style={labelStyle}>EFFICIENCY (%)</label>
                <input
                  type="number"
                  value={record?.efficiency || ''}
                  onChange={e => handleFieldChange('efficiency', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 92"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>STATOR CONNECTION</label>
                <select
                  value={record?.statorConnection || 'Star'}
                  onChange={e => handleFieldChange('statorConnection', e.target.value)}
                  style={selectStyle}
                >
                  <option value="Star">Star</option>
                  <option value="Delta">Delta</option>
                  <option value="Star-Delta">Star-Delta</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>ROTOR CONNECTION</label>
                <select
                  value={record?.rotorConnection || 'Star'}
                  onChange={e => handleFieldChange('rotorConnection', e.target.value)}
                  style={selectStyle}
                >
                  <option value="Star">Star</option>
                  <option value="Delta">Delta</option>
                  <option value="Star-Delta">Star-Delta</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>ROTOR VOLTAGE (V)</label>
                <input
                  type="number"
                  value={record?.rotorVoltage || ''}
                  onChange={e => handleFieldChange('rotorVoltage', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 12"
                />
              </div>
              <div>
                <label style={labelStyle}>ROTOR CURRENT (A)</label>
                <input
                  type="number"
                  value={record?.rotorCurrent || ''}
                  onChange={e => handleFieldChange('rotorCurrent', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 0"
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>INSULATION CLASS</label>
                <select
                  value={record?.insulationClass || 'A'}
                  onChange={e => handleFieldChange('insulationClass', e.target.value)}
                  style={selectStyle}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="F">F</option>
                  <option value="H">H</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>ROTOR BARS</label>
                <input
                  type="number"
                  value={record?.rotorBars || ''}
                  onChange={e => handleFieldChange('rotorBars', e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. 7"
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>REMARK / NOTE</label>
              <textarea
                value={record?.remark || ''}
                onChange={e => handleFieldChange('remark', e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
                rows={3}
                placeholder="Winding condition, visible issues..."
              />
            </div>
          </div>
        </div>

        {/* COLUMN 4: Offline Tests Config */}
        <div style={columnCardStyle}>
          <h3 style={sectionHeaderStyle}>🔌 Offline Test Configurations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
            <div>
              <label style={labelStyle}>TESTING LOCATION</label>
              <select
                value={record?.testingLocation || 'Motor Junction Box'}
                onChange={e => handleFieldChange('testingLocation', e.target.value)}
                style={selectStyle}
              >
                <option value="Motor Junction Box">Motor Junction Box</option>
                <option value="Disconnect Switch">Disconnect Switch</option>
                <option value="MCC">MCC</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: 8, background: '#fafafa' }}>
              <label style={{ ...labelStyle, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 8 }}>WIRE MARKING</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, width: 20, color: '#475569' }}>T1:</span>
                  <input
                    type="text"
                    value={record?.wireMarkingT1 || ''}
                    onChange={e => handleFieldChange('wireMarkingT1', e.target.value)}
                    style={inputStyle}
                    placeholder="U1 / L1"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, width: 20, color: '#475569' }}>T2:</span>
                  <input
                    type="text"
                    value={record?.wireMarkingT2 || ''}
                    onChange={e => handleFieldChange('wireMarkingT2', e.target.value)}
                    style={inputStyle}
                    placeholder="V1 / L2"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, width: 20, color: '#475569' }}>T3:</span>
                  <input
                    type="text"
                    value={record?.wireMarkingT3 || ''}
                    onChange={e => handleFieldChange('wireMarkingT3', e.target.value)}
                    style={inputStyle}
                    placeholder="W1 / L3"
                  />
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>PI / DAR TEST VOLTAGE</label>
              <select
                value={record?.testVoltagePiDar || '500V'}
                onChange={e => handleFieldChange('testVoltagePiDar', e.target.value)}
                style={selectStyle}
              >
                <option value="250V">250V</option>
                <option value="500V">500V</option>
                <option value="1kV">1kV</option>
                <option value="2.5kV">2.5kV</option>
                <option value="5kV">5kV</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>STEP TEST VOLTAGE</label>
              <input
                type="text"
                value={record?.testVoltageStep || ''}
                onChange={e => handleFieldChange('testVoltageStep', e.target.value)}
                style={inputStyle}
                placeholder="e.g. 500V / 1kV / 1.5kV"
              />
            </div>

            <div>
              <label style={labelStyle}>RAMP TEST VOLTAGE</label>
              <input
                type="text"
                value={record?.testVoltageRamp || ''}
                onChange={e => handleFieldChange('testVoltageRamp', e.target.value)}
                style={inputStyle}
                placeholder="e.g. 0 to 5kV Ramp"
              />
            </div>
          </div>
        </div>

      </div>

      {/* Auto-save status footer */}
      <div style={{ marginTop: 14, fontSize: 12, color: '#16a34a', fontWeight: 600, display: 'flex', justifyContent: 'flex-end' }}>
        {savedMsg}
      </div>

      {/* OVERWRITE / REPLICATE MODAL DIALOG */}
      {redoModal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
            width: '450px', padding: '24px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column', gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>🔄</span>
              <h4 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>Re-do Motor Winding & Insulation Test</h4>
            </div>

            <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.5 }}>
              Do you want to overwrite this motor's test measurements, or duplicate this motor file with a new test date?
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => handleRedoConfirm(true)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#dc2626',
                  color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'background 0.15s'
                }}
              >
                Yes, Overwrite
              </button>
              <button
                onClick={() => handleRedoConfirm(false)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
                  color: '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'background 0.15s'
                }}
              >
                No, Replicate
              </button>
              <button
                onClick={closeRedoModal}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc',
                  color: '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
