import { useState } from 'react';
import logo from '../../assets/logo.png';

export default function StartScreen({ records, onNew, onOpen, onDuplicate, onDelete }) {
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const cardStyle = (primary) => ({
    background: primary ? '#1e40af' : '#fff',
    color: primary ? '#fff' : '#334155',
    border: primary ? 'none' : '1px solid #e2e8f0',
    borderRadius: 14, padding: '22px 28px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 10, width: 140, fontSize: 13, fontWeight: 600,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    transition: 'transform 0.1s, box-shadow 0.1s',
  });

  const filtered = records.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (r.clientName || '').toLowerCase().includes(q) ||
      (r.motorUtilityTag || '').toLowerCase().includes(q) ||
      (r.motorSerialNumber || '').toLowerCase().includes(q) ||
      (r.motorManufacturer || '').toLowerCase().includes(q) ||
      (r.equipmentType || '').toLowerCase().includes(q) ||
      (r.date || '').toLowerCase().includes(q) ||
      (r.operatorName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>

      <div style={{ textAlign: 'center', marginBottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img src={logo} alt="Sarox Technology Inc." style={{ height: 80, objectFit: 'contain', marginBottom: 8 }} />
        <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>Motor condition
          Monitoring system
          PDM-S411</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 36 }}>
        <button onClick={onNew} style={cardStyle(true)}>
          <span style={{ fontSize: 28 }}>📄</span>
          New Record
        </button>
        <button onClick={() => setShowOpenModal(true)} style={cardStyle(false)}>
          <span style={{ fontSize: 28 }}>📂</span>
          Open Record
        </button>
        <button onClick={() => records[0] && onDuplicate(records[0])} style={cardStyle(false)}>
          <span style={{ fontSize: 28 }}>📋</span>
          Duplicate
        </button>
      </div>

      {records.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, width: 420 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10, letterSpacing: 1 }}>RECENT RECORDS</p>
          {records.slice(0, 8).map((r) => (
            <div
              key={r.id}
              onClick={() => onOpen(r)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 10px', borderRadius: 8, cursor: 'pointer', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                  {r.clientName || '(No Client)'}
                  {r.motorUtilityTag ? <span style={{ color: '#1e40af' }}> — {r.motorUtilityTag}</span> : ''}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                  {r.motorManufacturer ? `${r.motorManufacturer} · ` : ''}{r.equipmentType || 'Motor'}
                </p>
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.date}</span>
            </div>
          ))}
        </div>
      )}

      {records.length === 0 && (
        <p style={{ color: '#cbd5e1', fontSize: 13 }}>
          No records yet. Click &quot;New Record&quot; to start.
          <br />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Records are saved on this PC and persist after restart.
          </span>
        </p>
      )}

      {/* Searchable Open Record Modal */}
      {showOpenModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
            width: '600px', maxHeight: '80vh', padding: '24px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column', gap: 16
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>📂</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>Open Test Record</h3>
              </div>
              <button
                onClick={() => { setShowOpenModal(false); setSearchQuery(''); }}
                style={{
                  background: 'none', border: 'none', fontSize: 20, color: '#94a3b8',
                  cursor: 'pointer', transition: 'color 0.15s', fontWeight: 'bold'
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#475569'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              >
                ×
              </button>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by client, tag, serial number, date..."
                style={{
                  width: '100%', border: '1px solid #cbd5e1', borderRadius: 8,
                  padding: '10px 12px', paddingLeft: '36px', fontSize: 13, color: '#0f172a',
                  outline: 'none', background: '#fff', boxSizing: 'border-box'
                }}
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>
                🔍
              </span>
            </div>

            {/* Records List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: '#cbd5e1', fontSize: 13 }}>
                  No records found.
                </div>
              ) : (
                filtered.map(r => (
                  <div
                    key={r.id}
                    style={{
                      border: '1px solid #e2e8f0', borderRadius: 10, padding: 12,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#f8fafc', transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        {r.clientName || '(No Client)'}
                        {r.motorUtilityTag ? <span style={{ color: '#1e40af' }}> — {r.motorUtilityTag}</span> : ''}
                      </p>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                        {r.motorManufacturer ? `${r.motorManufacturer} · ` : ''}{r.equipmentType || 'Motor'}
                        {r.motorSerialNumber ? ` · S/N: ${r.motorSerialNumber}` : ''}
                      </p>
                      <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                        Operator: {r.operatorName || 'N/A'} · Date: {r.date || 'N/A'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { onOpen(r); setShowOpenModal(false); }}
                        style={{
                          border: 'none', borderRadius: 6, background: '#1e40af',
                          color: '#fff', fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontWeight: 600,
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                        onMouseLeave={e => e.currentTarget.style.background = '#1e40af'}
                      >
                        Open
                      </button>
                      <button
                        onClick={async () => {
                          await onDuplicate(r);
                          setShowOpenModal(false);
                        }}
                        style={{
                          border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff',
                          color: '#475569', fontSize: 11, padding: '5px 12px', cursor: 'pointer', fontWeight: 600,
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => onDelete(r.id)}
                        style={{
                          border: 'none', borderRadius: 6, background: '#fee2e2',
                          color: '#b91c1c', fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontWeight: 600,
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fecaca'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
