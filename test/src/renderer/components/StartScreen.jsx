// src/renderer/components/StartScreen.jsx
export default function StartScreen({ records, onNew, onOpen, onDuplicate }) {
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

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>

      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 52 }}>⚡</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginTop: 8 }}>Electrical Testing Suite</h1>
        <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>Insulation & LCR Measurement System</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 36 }}>
        <button onClick={onNew} style={cardStyle(true)}>
          <span style={{ fontSize: 28 }}>📄</span>
          New Record
        </button>
        <button onClick={() => records[0] && onOpen(records[0])} style={cardStyle(false)}>
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
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{r.projectName || '(Untitled)'}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{r.customerName}</p>
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.date}</span>
            </div>
          ))}
        </div>
      )}

      {records.length === 0 && (
        <p style={{ color: '#cbd5e1', fontSize: 13 }}>No records yet. Click "New Record" to start.</p>
      )}
    </div>
  );
}
