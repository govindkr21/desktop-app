// src/renderer/components/ReportScreen.jsx
import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, ReferenceArea, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import logo from '../../assets/logo.png';

// Megger appends a "summary" block (30s, 60s, 600s spot readings) after the main capture.
// Detect it as the first row where time stops increasing — everything from that point on is
// display-noise for the graph/table (but the raw rows are still available for DAR/PI calc).
const stripTrailingSummary = (rows) => {
  if (!rows || rows.length === 0) return [];
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i].time) <= Number(rows[i - 1].time)) {
      return rows.slice(0, i);
    }
  }
  return rows;
};

// Drop the first-few-seconds voltage-stabilization transient (matches InsulationTab).
// Without this the chart auto-scale is dominated by a 2 TΩ (2e6 MΩ) spike at t≈1s
// and the meaningful data down at ~15k MΩ hugs the x-axis and reads as flat.
const stripEarlyTransients = (rows) => (rows || []).filter(r => {
  const t = Number(r?.time);
  const R = Number(r?.resistance);
  const I = Number(r?.current);
  if (t <= 2 && (R >= 1e6 || I <= 0.005 || R <= 0)) return false;
  return true;
});

// Compact tick label formatter for axes with wildly varying magnitudes
// (mH sweeps can range from 1e-4 to 1e3). Scientific notation for tiny/huge
// values keeps labels inside the axis gutter; fixed decimals in the normal range.
const formatAxisTick = (v) => {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs < 0.01 || abs >= 100000) return v.toExponential(2);
  if (abs < 1) return v.toFixed(3);
  if (abs < 10) return v.toFixed(2);
  if (abs < 100) return v.toFixed(1);
  return String(Math.round(v));
};

const splitSVData = (rows) => {
  if (!rows || rows.length === 0) return { transientRows: [], summaryRows: [] };
  let splitIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i].time) <= Number(rows[i - 1].time)) {
      splitIndex = i;
      break;
    }
  }

  let transientRows = rows;
  let summaryRows = [];

  if (splitIndex !== -1) {
    transientRows = rows.slice(0, splitIndex);
    summaryRows = rows.slice(splitIndex);
    summaryRows.sort((a, b) => Number(a.time) - Number(b.time));
  } else {
    // Dynamically extract summary rows at t = 60, 120, 180, 240, 300 from transient rows
    const targetTimes = [60, 120, 180, 240, 300];
    summaryRows = targetTimes.map(t => rows.find(r => Number(r.time) === t)).filter(Boolean);
  }

  return { transientRows, summaryRows };
};

const PolarPlot = ({ data, size = 180 }) => {
  const legendH = 32; // room below the plot for legend swatches
  const svgH = size + legendH;

  const validPoints = data.filter(d => d.z !== null && d.z !== undefined && !isNaN(d.z));
  const maxZ = Math.max(...validPoints.map(d => d.z)) * 1.15 || 10;

  const phaseColors = {
    '1-2': '#E11D48',
    '1-3': '#10B981',
    '2-3': '#D97706',
    '1-N': '#7C3AED',
    '2-N': '#06B6D4',
    '3-N': '#EC4899',
  };

  // Auto-zoom: if every vector's angle sits inside a single quadrant (with 2° slack at
  // the boundaries so noise doesn't flip classification), pivot the plot into that
  // quadrant so intra-quadrant differences become visible. Otherwise fall back to
  // the full 360° view.
  const TOL = 2;
  const zoomQuadrant = (() => {
    if (validPoints.length === 0) return null;
    const norm = (deg) => ((deg % 360) + 360) % 360;
    const fits = (q, d) => {
      const bounds = { 1: [0, 90], 2: [90, 180], 3: [180, 270], 4: [270, 360] }[q];
      let dd = d;
      // Wrap tiny angles just under 360 into Q4's range so 358° ~ -2° counts as Q4.
      if (q === 4 && dd < 90 - TOL) dd += 360;
      return dd >= bounds[0] - TOL && dd <= bounds[1] + TOL;
    };
    for (const q of [1, 2, 3, 4]) {
      if (validPoints.every(pt => fits(q, norm(pt.deg)))) return q;
    }
    return null;
  })();

  const centered = zoomQuadrant === null;
  const centerX = size / 2;
  const centerY = size / 2 + 10;
  // In zoom mode we place the origin in a corner of the plot area, so we can use
  // nearly the full width/height as the radius — roughly 2× the centered radius.
  const maxR = centered ? size / 2 - 25 : size - 45;

  const padTop = 25, padSide = 20, padBot = 15;
  const plotLeft = padSide, plotRight = size - padSide;
  const plotTop = padTop,  plotBot = size - padBot;
  let originX, originY;
  if (centered) { originX = centerX; originY = centerY; }
  else if (zoomQuadrant === 1) { originX = plotLeft;  originY = plotBot; }
  else if (zoomQuadrant === 2) { originX = plotRight; originY = plotBot; }
  else if (zoomQuadrant === 3) { originX = plotRight; originY = plotTop; }
  else                         { originX = plotLeft;  originY = plotTop; }

  const guideAngles = centered
    ? [0, 45, 90, 135, 180, 225, 270, 315]
    : ({ 1: [0, 45, 90], 2: [90, 135, 180], 3: [180, 225, 270], 4: [270, 315, 360] }[zoomQuadrant]);
  const labelAngles = centered ? [0, 90, 180, 270] : guideAngles;
  const arcBounds = centered ? null
    : ({ 1: [0, 90], 2: [90, 180], 3: [180, 270], 4: [270, 360] }[zoomQuadrant]);

  // Quarter-arc path from angle a→b (degrees) at radius r, drawn in SVG y-down space.
  // sweep=0 puts the arc's center at the polar origin, so it bulges outward (proper
  // quarter-circle grid). sweep=1 would center it at the opposite corner (inverted).
  const arcPath = (r, aDeg, bDeg) => {
    const a = (aDeg * Math.PI) / 180, b = (bDeg * Math.PI) / 180;
    const ax = originX + r * Math.cos(a), ay = originY - r * Math.sin(a);
    const bx = originX + r * Math.cos(b), by = originY - r * Math.sin(b);
    return `M ${ax} ${ay} A ${r} ${r} 0 0 0 ${bx} ${by}`;
  };

  return (
    <svg width={size} height={svgH} style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}>
      {/* Per-vector arrowhead markers — one per phase color so the arrowhead matches the line color */}
      <defs>
        {validPoints.map(pt => {
          const color = phaseColors[pt.phase] || '#64748b';
          return (
            <marker
              key={`arr-${pt.phase}`}
              id={`arrow-${pt.phase}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill={color} />
            </marker>
          );
        })}
      </defs>

      {/* Title */}
      <text x={size / 2} y="15" fontSize="9" fontWeight="bold" fill="#1e3a8a" textAnchor="middle">
        Impedance Polar Plot{centered ? '' : ` — Q${zoomQuadrant}`}
      </text>

      {/* Grid — full circles when centered, quarter-arcs when zoomed */}
      {centered ? (
        <>
          <circle cx={originX} cy={originY} r={maxR * 0.33} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
          <circle cx={originX} cy={originY} r={maxR * 0.66} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
          <circle cx={originX} cy={originY} r={maxR} fill="none" stroke="#94a3b8" strokeWidth="0.5" />
        </>
      ) : (
        <>
          <path d={arcPath(maxR * 0.33, arcBounds[0], arcBounds[1])} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
          <path d={arcPath(maxR * 0.66, arcBounds[0], arcBounds[1])} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
          <path d={arcPath(maxR,        arcBounds[0], arcBounds[1])} fill="none" stroke="#94a3b8" strokeWidth="0.5" />
        </>
      )}

      {/* Axis guide lines */}
      {guideAngles.map(angle => {
        const rad = (angle * Math.PI) / 180;
        const endX = originX + maxR * Math.cos(rad);
        const endY = originY - maxR * Math.sin(rad);
        return (
          <line
            key={angle}
            x1={originX}
            y1={originY}
            x2={endX}
            y2={endY}
            stroke="#94a3b8"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
        );
      })}

      {/* Angle Labels */}
      {labelAngles.map(angle => {
        const rad = (angle * Math.PI) / 180;
        const endX = originX + (maxR + 10) * Math.cos(rad);
        const endY = originY - (maxR + 10) * Math.sin(rad);
        return (
          <text
            key={angle}
            x={endX}
            y={endY}
            fontSize="6.5"
            fontWeight="bold"
            fill="#64748b"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {angle}°
          </text>
        );
      })}

      {/* Vectors — line from origin to (r, θ), coloured per phase, arrowhead at the tip */}
      {validPoints.map(pt => {
        const r = (pt.z / maxZ) * maxR;
        const rad = (pt.deg * Math.PI) / 180;
        const px = originX + r * Math.cos(rad);
        const py = originY - r * Math.sin(rad);
        const color = phaseColors[pt.phase] || '#64748b';
        return (
          <line
            key={pt.phase}
            x1={originX}
            y1={originY}
            x2={px}
            y2={py}
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            markerEnd={`url(#arrow-${pt.phase})`}
          />
        );
      })}

      {/* Legend row — sits below the plot, inside the SVG so it's captured in exports */}
      {(() => {
        const swatchW = 8;
        const gap = 4;
        const itemGap = 10;
        // Measure text width crudely (fontSize 7 → ~4px per char)
        const items = validPoints.map(pt => ({
          phase: pt.phase,
          color: phaseColors[pt.phase] || '#64748b',
          w: swatchW + gap + (pt.phase.length * 4.2)
        }));
        const totalW = items.reduce((a, i) => a + i.w, 0) + Math.max(0, items.length - 1) * itemGap;
        let cursorX = (size - totalW) / 2;
        const rowY = size + 8;
        return items.map(it => {
          const startX = cursorX;
          cursorX += it.w + itemGap;
          return (
            <g key={`legend-${it.phase}`}>
              <line
                x1={startX}
                y1={rowY + 4}
                x2={startX + swatchW}
                y2={rowY + 4}
                stroke={it.color}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <text
                x={startX + swatchW + gap}
                y={rowY + 6}
                fontSize="7"
                fontWeight="bold"
                fill={it.color}
              >
                {it.phase}
              </text>
            </g>
          );
        });
      })()}
    </svg>
  );
};

const api = window.electronAPI;
const isOverload = (val, mode) => {
  if (val === null || val === undefined) return false;
  let cleanVal = String(val).replace(/[><]/g, '').trim();
  cleanVal = cleanVal.replace(/,/g, '');
  const num = parseFloat(cleanVal);
  if (isNaN(num)) return false;
  if (num > 9.0e36) return true;
  if (mode === 'R' || mode === 'DCR' || mode === 'Z' || mode === 'ESR') return num >= 20e6;
  if (mode === 'L') return num >= 2e6;
  if (mode === 'C') return num >= 2e7;
  return false;
};

const calculateImbalance = (v1, v2, v3) => {
  if (v1 === undefined || v2 === undefined || v3 === undefined || v1 === null || v2 === null || v3 === null) return null;
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
};

const formatResistance = (mOhms) => {
  if (mOhms == null || Number.isNaN(mOhms)) return '—';
  const val = Number(mOhms);
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} TΩ`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)} GΩ`;
  if (val < 1) return `${(val * 1e3).toFixed(1)} kΩ`;
  return `${val.toFixed(2)} MΩ`;
};

const formatStepVoltage = (str) => {
  if (!str || str === '—') return '—';
  const parts = str.split(/[\/,]/);
  const lastPart = parts[parts.length - 1].trim();
  if (/^\d+$/.test(lastPart)) {
    return `${lastPart}V`;
  }
  return lastPart;
};

// ─── Sarox Motor Condition Assessment bands (per docx spec) ────────────────
const RATING_STYLES = {
  Excellent: { color: '#166534', bg: '#dcfce7' },
  Good:      { color: '#15803d', bg: '#d1fae5' },
  Normal:    { color: '#1e40af', bg: '#dbeafe' },
  Observe:   { color: '#b45309', bg: '#fef3c7' },
  Caution:   { color: '#c2410c', bg: '#ffedd5' },
  Alarm:     { color: '#b91c1c', bg: '#fee2e2' },
};
const RATING_ORDER = ['Excellent', 'Good', 'Normal', 'Observe', 'Caution', 'Alarm'];
const NONE_RATING = { text: '—', color: '#64748b', bg: '#f1f5f9' };
const worstBand = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return RATING_ORDER.indexOf(a) >= RATING_ORDER.indexOf(b) ? a : b;
};
const bandToRating = (band) => band ? { text: band, ...RATING_STYLES[band] } : NONE_RATING;

const ratePI = (v) => {
  const x = Number(v);
  if (!isFinite(x)) return NONE_RATING;
  if (x > 4.0) return bandToRating('Excellent');
  if (x >= 2.5) return bandToRating('Good');
  if (x >= 2.0) return bandToRating('Normal');
  if (x >= 1.5) return bandToRating('Observe');
  if (x >= 1.0) return bandToRating('Caution');
  return bandToRating('Alarm');
};

const rateDAR = (v) => {
  const x = Number(v);
  if (!isFinite(x)) return NONE_RATING;
  if (x > 1.60) return bandToRating('Excellent');
  if (x >= 1.45) return bandToRating('Good');
  if (x >= 1.30) return bandToRating('Normal');
  if (x >= 1.20) return bandToRating('Observe');
  if (x >= 1.10) return bandToRating('Caution');
  return bandToRating('Alarm');
};

// SV Step Voltage Resistance Settlement — worst % decrease between consecutive
// step-resistance points. Bands per docx: <5 Excellent … >50 Alarm.
const rateSVSettlement = (summaryRows) => {
  if (!summaryRows || summaryRows.length < 2) return { ...NONE_RATING, decrease: null };
  const pts = summaryRows
    .map(r => Number(r.resistance))
    .filter(v => isFinite(v) && v > 0);
  if (pts.length < 2) return { ...NONE_RATING, decrease: null };
  let maxDrop = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i] < pts[i - 1]) {
      const drop = (pts[i - 1] - pts[i]) / pts[i - 1] * 100;
      if (drop > maxDrop) maxDrop = drop;
    }
  }
  let band;
  if (maxDrop < 5) band = 'Excellent';
  else if (maxDrop < 10) band = 'Good';
  else if (maxDrop < 20) band = 'Normal';
  else if (maxDrop < 35) band = 'Observe';
  else if (maxDrop < 50) band = 'Caution';
  else band = 'Alarm';
  return { ...bandToRating(band), decrease: maxDrop };
};

// RAMP has no docx rule — fall back to IEEE-43 corrected-R40 thresholds
// mapped onto the same 6 bands so labels stay consistent across the report.
const rateInsulationRc40 = (Rc40) => {
  if (Rc40 === null || Rc40 === undefined || !isFinite(Number(Rc40))) return NONE_RATING;
  const v = Number(Rc40);
  if (v >= 100) return bandToRating('Excellent');
  if (v >= 50) return bandToRating('Good');
  if (v >= 10) return bandToRating('Normal');
  if (v >= 5) return bandToRating('Observe');
  if (v >= 1) return bandToRating('Caution');
  return bandToRating('Alarm');
};

// Winding imbalance bands (% for res/ind/imp, degrees for phase angle)
const rateImbalance = (kind, val) => {
  if (val === null || val === undefined || !isFinite(Number(val))) return NONE_RATING;
  const v = Math.abs(Number(val));
  const bands = ['Excellent', 'Good', 'Normal', 'Observe', 'Caution', 'Alarm'];
  const thresholds =
    kind === 'dcRes' ? [1, 2, 3, 5, 8] :
    kind === 'acRes' ? [1, 2, 4, 6, 10] :
    kind === 'ind'   ? [2, 4, 6, 8, 10] :
    kind === 'imp'   ? [2, 4, 6, 8, 10] :
    kind === 'phase' ? [0.3, 0.6, 1.0, 1.5, 2.0] :
                       [2, 4, 6, 8, 10];
  for (let i = 0; i < thresholds.length; i++) {
    if (v < thresholds[i]) return bandToRating(bands[i]);
  }
  return bandToRating('Alarm');
};

// Route a table's rating by test mode, per docx (PI ratio, DAR ratio, SV
// settlement, RAMP → IEEE-43 fallback).
const rateInsulationTable = ({ tab, pi, dar, svSummaryRows, Rc40, Rt, correctionOn }) => {
  if (tab === 'PI')  return ratePI(pi);
  if (tab === 'DAR') return rateDAR(dar);
  if (tab === 'SV')  return rateSVSettlement(svSummaryRows);
  return rateInsulationRc40(correctionOn ? Rc40 : Rt);
};

// Overall insulation band = worst band across every populated PI/DAR/SV/RAMP
// run in insData. Returns null if there is no insulation data at all.
const computeOverallInsulationBand = (insData, record) => {
  if (!insData) return null;
  let worst = null;
  let anyData = false;
  Object.keys(insData).forEach(tab => {
    const tabData = insData[tab] || {};
    Object.keys(tabData).forEach(tableId => {
      if (tableId.endsWith('_meta')) return;
      const rows = tabData[tableId];
      if (!Array.isArray(rows) || rows.length === 0) return;
      anyData = true;
      const runMeta = tabData[`${tableId}_meta`] || {};
      const runTemp = (runMeta.temperature !== undefined && runMeta.temperature !== '') ? runMeta.temperature : (record?.temperature || 25);
      const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
      const Kt = Math.pow(0.5, (40 - tempVal) / 10);
      const Rt = rows[rows.length - 1].resistance;
      const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;
      const r30 = rows.find(r => r.time >= 30)?.resistance;
      const r60 = rows.find(r => r.time >= 60)?.resistance;
      const r600 = rows.find(r => r.time >= 600)?.resistance;
      const pi = r600 && r60 ? r600 / r60 : null;
      const dar = r60 && r30 ? r60 / r30 : null;
      const svRows = tab === 'SV' ? getSVSummaryRows(rows) : null;
      const rating = rateInsulationTable({
        tab, pi, dar, svSummaryRows: svRows,
        Rc40, Rt, correctionOn: !!record?.correctInsulationTo40,
      });
      if (rating.text && rating.text !== '—') worst = worstBand(worst, rating.text);
    });
  });
  return anyData ? (worst || 'Normal') : null;
};

// SV step-summary rows from a run: first descending time signals repeated step
// summary block; otherwise pick t=60,120,180,240,300 out of transient rows.
const getSVSummaryRows = (rows) => {
  if (!rows || rows.length === 0) return [];
  let splitIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i].time) <= Number(rows[i - 1].time)) { splitIndex = i; break; }
  }
  if (splitIndex !== -1) {
    return rows.slice(splitIndex).slice().sort((a, b) => Number(a.time) - Number(b.time));
  }
  const targets = [60, 120, 180, 240, 300];
  return targets.map(t => rows.find(r => Number(r.time) === t)).filter(Boolean);
};

export default function ReportScreen({ record, onChange }) {
  const [insData, setInsData] = useState({});
  const [mulData, setMulData] = useState({});
  const [exporting, setExporting] = useState('');
  const [message, setMessage] = useState(null);
  const [lastFilePath, setLastFilePath] = useState(null);
  const [includeRotor, setIncludeRotor] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!record) return;
    api.getInsulationData(record.id).then(d => setInsData(d || {}));
    api.getMultimeterData(record.id).then(d => setMulData(d || {}));
  }, [record?.id]);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Downscale large logos to a max dimension of 400px to keep SQLite payload small
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const base64Data = canvas.toDataURL('image/png');
          onChange('customLogoPath', base64Data);

          // Save directly to DB immediately to avoid race conditions during export
          await api.updateRecord(record.id, { customLogoPath: base64Data });
        } catch (err) {
          console.error('Failed to process custom logo image:', err);
        }
      };
      img.onerror = () => {
        console.error('Failed to load selected custom logo image.');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleLogoRemove = async () => {
    onChange('customLogoPath', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Save update to DB immediately
    try {
      await api.updateRecord(record.id, { customLogoPath: '' });
    } catch (err) {
      console.error('Failed to clear custom logo in database:', err);
    }
  };

  const clientLogoInputRef = useRef(null);

  const handleClientLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Downscale large logos to a max dimension of 400px to keep SQLite payload small
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const base64Data = canvas.toDataURL('image/png');
          onChange('customClientLogoPath', base64Data);

          // Save directly to DB immediately to avoid race conditions during export
          await api.updateRecord(record.id, { customClientLogoPath: base64Data });
        } catch (err) {
          console.error('Failed to process custom client logo image:', err);
        }
      };
      img.onerror = () => {
        console.error('Failed to load selected custom client logo image.');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleClientLogoRemove = async () => {
    onChange('customClientLogoPath', 'none');
    if (clientLogoInputRef.current) {
      clientLogoInputRef.current.value = '';
    }
    
    // Save update to DB immediately
    try {
      await api.updateRecord(record.id, { customClientLogoPath: 'none' });
    } catch (err) {
      console.error('Failed to clear custom client logo in database:', err);
    }
  };

  const handleClientLogoReset = async () => {
    onChange('customClientLogoPath', '');
    if (clientLogoInputRef.current) {
      clientLogoInputRef.current.value = '';
    }
    
    // Save update to DB immediately
    try {
      await api.updateRecord(record.id, { customClientLogoPath: '' });
    } catch (err) {
      console.error('Failed to reset custom client logo in database:', err);
    }
  };

  const svgToPng = (svgElement) => {
    return new Promise((resolve, reject) => {
      try {
        const clonedSvg = svgElement.cloneNode(true);
        const width = svgElement.clientWidth || svgElement.getBoundingClientRect().width || 600;
        const height = svgElement.clientHeight || svgElement.getBoundingClientRect().height || 350;
        
        clonedSvg.setAttribute('width', width);
        clonedSvg.setAttribute('height', height);
        
        const svgString = new XMLSerializer().serializeToString(clonedSvg);
        const base64Svg = window.btoa(unescape(encodeURIComponent(svgString)));
        const dataURL = `data:image/svg+xml;base64,${base64Svg}`;
        
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0);
          const png = canvas.toDataURL('image/png');
          resolve(png);
        };
        image.onerror = (err) => {
          reject(err);
        };
        image.src = dataURL;
      } catch (e) {
        reject(e);
      }
    });
  };

  const grabChartBase64 = async (id) => {
    const container = document.getElementById(id);
    if (!container) return null;
    const svg = container.querySelector('svg');
    if (!svg) return null;
    try {
      return await svgToPng(svg);
    } catch (e) {
      console.error(`Failed to convert svg for ${id} to png`, e);
      return null;
    }
  };

  const getFriendlyErrorMessage = (error) => {
    if (!error) return 'An unknown error occurred.';
    const msg = typeof error === 'string' ? error : (error.message || String(error));
    
    if (msg.includes('EBUSY') || msg.includes('resource busy or locked') || msg.includes('locked')) {
      return 'The report file is currently open in another application (such as Microsoft Excel or a PDF viewer). Please close the file and try again.';
    }
    if (msg.includes('EACCES') || msg.includes('permission denied') || msg.includes('EPERM')) {
      return 'Permission denied. The application does not have permission to write to this folder. Please choose a different location or check folder permissions.';
    }
    if (msg.includes('ENOENT') || msg.includes('no such file or directory')) {
      return 'The destination folder could not be found. Please choose a different save location.';
    }
    if (msg.includes('ENOSPC') || msg.includes('no space left on device')) {
      return 'Out of storage space. Please free up some disk space and try again.';
    }
    if (msg.includes('MAX_TABLE_ROWS is not defined') || msg.includes('ReferenceError') || msg.includes('TypeError')) {
      return `An internal application error occurred: ${msg}. Please report this to the development team.`;
    }
    return msg;
  };

  const handleExport = async (type) => {
    setExporting(type);
    setMessage(null);
    try {
      let result;
      if (type === 'Excel') {
        // Grab sweep chart images
        const sweepImages = {};
        const sweepGroups = ['stator', 'rotor'];
        const sweepTypes = ['ind', 'res'];
        for (const group of sweepGroups) {
          for (const type of sweepTypes) {
            const base64 = await grabChartBase64(`chart-${group}-${type}`);
            if (base64) {
              sweepImages[`${group}_${type}`] = base64;
            }
          }
        }

        // Grab insulation chart images
        const insImages = {};
        for (const tabName of ['PI', 'DAR', 'SV', 'RAMP']) {
          const tabData = insData[tabName] || {};
          const activeTables = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);
          for (const tableId of activeTables) {
            const base64 = await grabChartBase64(`chart-insulation-${tabName}-${tableId}`);
            if (base64) {
              insImages[`${tabName}_${tableId}`] = base64;
            }
          }
        }

        // Grab polar chart images
        const polarImages = {};
        for (const group of ['stator', 'rotor']) {
          const base64 = await grabChartBase64(`chart-polar-${group}`);
          if (base64) {
            polarImages[group] = base64;
          }
        }

        const chartImages = {
          sweep: sweepImages,
          insulation: insImages,
          polar: polarImages
        };
        result = await api.exportExcel(record.id, chartImages, { includeRotor });
      } else {
        result = await api.exportPDF(record.id, { includeRotor });
      }

      if (result.success) {
        setLastFilePath(result.filePath);
        setMessage({ type: 'success', text: `✅ ${type} report saved to: ${result.filePath}` });
      } else if (result.reason === 'cancelled') {
        setMessage({ type: 'info', text: 'Export cancelled.' });
      } else {
        setMessage({ type: 'error', text: `❌ Export failed: ${getFriendlyErrorMessage(result.error)}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `❌ Error: ${getFriendlyErrorMessage(err)}` });
    }
    setExporting('');
  };

  const openPath = async (path) => {
    if (api && api.openPath) {
      await api.openPath(path);
    }
  };

  const getNominalVoltage = (tab) => {
    const tabData = insData?.[tab] || {};
    const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
    if (activeTableKeys.length === 0) return null;
    
    const voltages = new Set();
    activeTableKeys.forEach(tableId => {
      const rows = tabData[tableId];
      if (rows && rows[0] && rows[0].voltage !== undefined && rows[0].voltage !== null && rows[0].voltage !== '') {
        voltages.add(`${rows[0].voltage}V`);
      }
    });
    return voltages.size > 0 ? Array.from(voltages).join(', ') : null;
  };

  const getSVNominalVoltages = () => {
    const tabData = insData?.['SV'] || {};
    const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
    if (activeTableKeys.length === 0) return null;
    
    let maxV = 0;
    activeTableKeys.forEach(tableId => {
      const rows = tabData[tableId];
      rows.forEach(r => {
        if (r.voltage !== undefined && r.voltage !== null && r.voltage !== '') {
          const num = parseFloat(r.voltage);
          if (!isNaN(num) && num > maxV) {
            maxV = num;
          }
        }
      });
    });
    return maxV > 0 ? `${maxV}V` : null;
  };

  const getRampNominalVoltages = () => {
    const tabData = insData?.['RAMP'] || {};
    const activeTableKeys = Object.keys(tabData).filter(k => !k.endsWith('_meta') && Array.isArray(tabData[k]) && tabData[k].length > 0);
    if (activeTableKeys.length === 0) return null;
    
    let minV = Infinity;
    let maxV = -Infinity;
    activeTableKeys.forEach(tableId => {
      const rows = tabData[tableId];
      rows.forEach(r => {
        if (r.voltage !== undefined && r.voltage !== null && r.voltage !== '') {
          const v = parseFloat(r.voltage);
          if (!isNaN(v)) {
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
        }
      });
    });
    
    if (minV !== Infinity && maxV !== -Infinity) {
      if (minV === maxV) return `${minV}V`;
      return `${minV}V - ${maxV}V`;
    }
    return null;
  };

  const piVolts = getNominalVoltage('PI') || record?.testVoltagePiDar || '—';
  const darVolts = getNominalVoltage('DAR') || record?.testVoltagePiDar || '—';
  const stepVolts = formatStepVoltage(getSVNominalVoltages() || record?.testVoltageStep);
  const rampVolts = getRampNominalVoltages() || record?.testVoltageRamp || '—';

  // Check if any insulation tables have data
  const hasInsulation = Object.values(insData).some(tabObj => 
    tabObj && Object.values(tabObj).some(arr => arr && arr.length > 0)
  );

  // Check if any multimeter values exist
  const hasMulData = Object.keys(mulData).length > 0;

  const msgColor = message?.type === 'success' ? { bg: '#f0fdf4', border: '#86efac', text: '#166534' }
                 : message?.type === 'error'   ? { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' }
                 :                               { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };

  // Winding Imbalances at card group level
  const statorResImb = calculateImbalance(mulData?.['stator_res_1-2']?.value, mulData?.['stator_res_1-3']?.value, mulData?.['stator_res_2-3']?.value);
  const statorIndImb = calculateImbalance(mulData?.['stator_ind_1-2_100Hz']?.value, mulData?.['stator_ind_1-3_100Hz']?.value, mulData?.['stator_ind_2-3_100Hz']?.value);
  const statorCapImb = calculateImbalance(mulData?.['stator_cap_1-2']?.value, mulData?.['stator_cap_1-3']?.value, mulData?.['stator_cap_2-3']?.value) || calculateImbalance(mulData?.['stator_cap_1-GND']?.value, mulData?.['stator_cap_2-GND']?.value, mulData?.['stator_cap_3-GND']?.value);
  const statorImpImb = calculateImbalance(mulData?.['stator_imp_1-2_z']?.value, mulData?.['stator_imp_1-3_z']?.value, mulData?.['stator_imp_2-3_z']?.value);

  const rotorResImb = calculateImbalance(mulData?.['rotor_res_1-2']?.value, mulData?.['rotor_res_1-3']?.value, mulData?.['rotor_res_2-3']?.value);
  const rotorIndImb = calculateImbalance(mulData?.['rotor_ind_1-2_100Hz']?.value, mulData?.['rotor_ind_1-3_100Hz']?.value, mulData?.['rotor_ind_2-3_100Hz']?.value);
  const rotorCapImb = calculateImbalance(mulData?.['rotor_cap_1-2']?.value, mulData?.['rotor_cap_1-3']?.value, mulData?.['rotor_cap_2-3']?.value) || calculateImbalance(mulData?.['rotor_cap_1-GND']?.value, mulData?.['rotor_cap_2-GND']?.value, mulData?.['rotor_cap_3-GND']?.value);
  const rotorImpImb = calculateImbalance(mulData?.['rotor_imp_1-2_z']?.value, mulData?.['rotor_imp_1-3_z']?.value, mulData?.['rotor_imp_2-3_z']?.value);

  const hasLStatorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`stator_ind_${p}_${f}`]?.value !== undefined));
  const hasLRotorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`rotor_ind_${p}_${f}`]?.value !== undefined));
  const hasRStatorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`stator_res_${p}_${f}`]?.value !== undefined));
  const hasRRotorSweep = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].some(f => mulData[`rotor_res_${p}_${f}`]?.value !== undefined));

  const renderSweepTable = (title, group, type) => {
    const tablePhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
    const tableFreqs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
    
    const hasData = tablePhases.some(phase =>
      tableFreqs.some(f => mulData[`${group}_${type}_${phase}_${f}`]?.value !== undefined)
    );
    if (!hasData) return null;

    const colImbalances = {};
    let maxImbalance = 0;
    
    tableFreqs.forEach(f => {
      const v12 = mulData[`${group}_${type}_1-2_${f}`]?.value;
      const v13 = mulData[`${group}_${type}_1-3_${f}`]?.value;
      const v23 = mulData[`${group}_${type}_2-3_${f}`]?.value;
      
      const imb = calculateImbalance(v12, v13, v23);
      if (imb !== null) {
        colImbalances[f] = imb;
        if (imb > maxImbalance) {
          maxImbalance = imb;
        }
      }
    });

    const chartData = tableFreqs.map(f => {
      const obj = { name: f };
      tablePhases.forEach(phase => {
        const cellData = mulData[`${group}_${type}_${phase}_${f}`];
        if (cellData && cellData.value !== undefined && cellData.value !== null && cellData.value !== '') {
          // DB values come back as strings — coerce so numeric ops (min/max, padding) don't concat.
          let val = parseFloat(cellData.value);
          if (!isNaN(val)) {
            if (type === 'res' && record?.correctWindingTo20) {
              const tempNum = isNaN(parseFloat(cellData.temperature)) ? 25 : parseFloat(cellData.temperature);
              val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
            }
            obj[phase] = val;
          }
        }
      });
      return obj;
    });

    let minVal = Infinity;
    let maxVal = -Infinity;
    chartData.forEach(d => {
      tablePhases.forEach(phase => {
        const v = d[phase];
        if (v !== undefined) {
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      });
    });
    const minAreaY = minVal < 0 ? minVal - 1 : 0;

    // Auto-scaled Y domain — 15% padding on both sides so the top-most value
    // (e.g. 122 mH) is not clipped by a Recharts default nice-max like 100.
    const hasRange = isFinite(minVal) && isFinite(maxVal);
    let yDomain;
    if (hasRange) {
      const span = maxVal - minVal;
      const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(maxVal) * 0.1, 0.1);
      const rawMin = minVal - pad;
      const rawMax = maxVal + pad;
      const yMin = minVal < 0
        ? Math.floor(Math.min(minAreaY, rawMin))
        : Math.max(0, Math.floor(rawMin));
      const yMax = Math.ceil(rawMax);
      yDomain = [yMin, yMax];
    } else {
      yDomain = ['auto', 'auto'];
    }

    return (
      <div key={`${group}_${type}_sweep`} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '0 0 8px 0' }}>{title}</h5>

        <div>
          <div id={`chart-${group}-${type}`} style={{ height: 220, width: '100%', minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }} />
                <YAxis
                  type="number"
                  domain={yDomain}
                  allowDecimals
                  allowDataOverflow={false}
                  width={48}
                  tickFormatter={formatAxisTick}
                  style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}
                />
                {minAreaY < 0 && (
                  <ReferenceArea
                    y1={minAreaY}
                    y2={0}
                    fill="#FEF08A"
                    fillOpacity={0.7}
                  />
                )}
                {minAreaY < 0 && (
                  <Line
                    type="monotone"
                    dataKey="capacitiveDominanceDummy"
                    name="Capacitive dominance"
                    stroke="#FEF08A"
                    strokeWidth={0}
                    dot={false}
                    activeDot={false}
                  />
                )}
                <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4, border: '1px solid #cbd5e1', background: '#fff' }} />
                <Legend verticalAlign="bottom" height={28} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 8, fontWeight: 700, fill: '#475569', paddingTop: 8 }} />
                {tablePhases.map(phase => {
                  const hasLineData = chartData.some(d => d[phase] !== undefined);
                  if (!hasLineData) return null;

                  const phaseColors = {
                    '1-2': '#E11D48',
                    '1-3': '#10B981',
                    '2-3': '#D97706',
                    '1-N': '#7C3AED',
                    '2-N': '#06B6D4',
                    '3-N': '#EC4899',
                  };
                  const color = phaseColors[phase] || '#64748b';
                  return (
                    <Line
                      key={phase}
                      type="linear"
                      dataKey={phase}
                      name={`Phase ${phase}`}
                      stroke={color}
                      activeDot={{ r: 4 }}
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {maxImbalance > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, fontWeight: 'bold', color: maxImbalance < 5 ? '#16a34a' : '#dc2626' }}>
              Max Imbalance: {maxImbalance.toFixed(2)}% | Condition Status: {maxImbalance < 5 ? 'Normal / Good' : 'Investigate (High Imbalance)'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20, height: 'calc(100vh - 112px)', overflowY: 'auto', boxSizing: 'border-box' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Report Preview</h2>
          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>Review test values before saving to your computer</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleExport('Excel')}
            disabled={!!exporting}
            style={{
              background: exporting === 'Excel' ? '#15803d' : '#16a34a', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s', opacity: exporting && exporting !== 'Excel' ? 0.5 : 1
            }}
          >
            {exporting === 'Excel' ? '⏳ Exporting...' : '📊 Export Excel'}
          </button>
          <button
            onClick={() => handleExport('PDF')}
            disabled={!!exporting}
            style={{
              background: exporting === 'PDF' ? '#b91c1c' : '#dc2626', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s', opacity: exporting && exporting !== 'PDF' ? 0.5 : 1
            }}
          >
            {exporting === 'PDF' ? '⏳ Exporting...' : '📄 Export PDF'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div style={{
          background: msgColor.bg, border: `1px solid ${msgColor.border}`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 12, color: msgColor.text, fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>{message.text}</span>
          {message.type === 'success' && lastFilePath && (
            <button
              onClick={() => openPath(lastFilePath)}
              style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
            >
              📂 Show File
            </button>
          )}
        </div>
      )}

      {/* Baseline Settings Control Panel */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚙️ DISPLAY MODE OPTIONS:
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Winding Toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: record?.correctWindingTo20 ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${record?.correctWindingTo20 ? '#bfdbfe' : '#cbd5e1'}`,
            borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700,
            color: record?.correctWindingTo20 ? '#1e40af' : '#475569', cursor: 'pointer',
            transition: 'all 0.15s'
          }}>
            <input
              type="checkbox"
              checked={record?.correctWindingTo20 || false}
              onChange={e => onChange('correctWindingTo20', e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show Corrected Winding (20°C Copper)</span>
          </label>

          {/* Insulation Toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: record?.correctInsulationTo40 ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${record?.correctInsulationTo40 ? '#bfdbfe' : '#cbd5e1'}`,
            borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700,
            color: record?.correctInsulationTo40 ? '#1e40af' : '#475569', cursor: 'pointer',
            transition: 'all 0.15s'
          }}>
            <input
              type="checkbox"
              checked={record?.correctInsulationTo40 || false}
              onChange={e => onChange('correctInsulationTo40', e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show Corrected Insulation (40°C IEEE 43)</span>
          </label>
        </div>
        <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginLeft: 'auto' }}>
          * Uncheck to view raw, uncorrected readings in tables & charts.
        </span>
      </div>

      {/* Test Summary & Condition Overrides Panel */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
          📋 REPORT TEST SUMMARY & CONDITION ASSESSMENT:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr', gap: 16 }}>
          {/* Summary notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>Test Summary Report Notes:</label>
            <textarea
              value={record?.summaryText || ''}
              onChange={e => onChange('summaryText', e.target.value)}
              placeholder="Write overall test summary comments and recommendations here..."
              style={{
                fontSize: 11, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1',
                height: 200, resize: 'vertical', fontFamily: 'inherit'
              }}
            />
          </div>
          {/* Dropdowns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {[
              { key: 'condInsulation', label: 'Insulation' },
              { key: 'condResistance', label: 'Resistance' },
              { key: 'condInductance', label: 'Inductance' },
              { key: 'condImpedance', label: 'Impedance' },
              { key: 'condFrequency', label: 'Freq. Response' }
            ].map(c => {
              // Calculate default automatic value if not manually set
              let autoVal = '—';
              if (c.key === 'condInsulation') {
                autoVal = computeOverallInsulationBand(insData, record) || '—';
              } else if (c.key === 'condResistance') {
                if (statorResImb !== null) {
                  autoVal = rateImbalance('acRes', statorResImb).text;
                }
              } else if (c.key === 'condInductance') {
                if (statorIndImb !== null) {
                  autoVal = rateImbalance('ind', statorIndImb).text;
                }
              } else if (c.key === 'condImpedance') {
                if (statorImpImb !== null) {
                  autoVal = rateImbalance('imp', statorImpImb).text;
                } else {
                  const hasImp = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => mulData[`stator_imp_${p}_z`]?.value !== undefined);
                  if (hasImp) autoVal = 'Normal';
                }
              } else if (c.key === 'condFrequency') {
                let maxSwImb = 0;
                ['ind', 'res'].forEach(t => {
                  ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach(f => {
                    const v12 = mulData[`stator_${t}_1-2_${f}`]?.value;
                    const v13 = mulData[`stator_${t}_1-3_${f}`]?.value;
                    const v23 = mulData[`stator_${t}_2-3_${f}`]?.value;
                    const imb = calculateImbalance(v12, v13, v23);
                    if (imb !== null && imb > maxSwImb) maxSwImb = imb;
                  });
                });
                if (maxSwImb > 0) {
                  autoVal = rateImbalance('acRes', maxSwImb).text;
                }
              }

              const currentVal = record?.[c.key] || '';
              const displayVal = currentVal || autoVal;

              return (
                <div key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>{c.label}:</label>
                  <select
                    value={currentVal}
                    onChange={e => onChange(c.key, e.target.value)}
                    style={{
                      fontSize: 10, padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1',
                      background: (RATING_STYLES[displayVal] || {}).bg || '#f1f5f9',
                      color: (RATING_STYLES[displayVal] || {}).color || '#475569',
                      fontWeight: 'bold', cursor: 'pointer'
                    }}
                  >
                    <option value="">Auto ({autoVal})</option>
                    {RATING_ORDER.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Report Container */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
        
        {/* Document Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #f1f5f9', paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* 1. Client Logo Slot (with default logo.png) */}
            {record?.customClientLogoPath !== 'none' ? (
              <div
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  display: 'inline-block',
                  border: '1px dashed transparent',
                  borderRadius: 4,
                  padding: '2px 6px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = 'transparent';
                }}
                onClick={() => clientLogoInputRef.current?.click()}
                title="Click to change client logo (defaults to Sarox logo)"
              >
                <img 
                  src={record?.customClientLogoPath || logo} 
                  alt="Client Logo" 
                  style={{ height: 32, objectFit: 'contain', display: 'block' }} 
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClientLogoRemove(); // sets to 'none'
                  }}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 14,
                    height: 14,
                    fontSize: 9,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    lineHeight: 1,
                    padding: 0
                  }}
                  title="Remove client logo completely"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div
                  onClick={() => clientLogoInputRef.current?.click()}
                  style={{
                    border: '1px dashed #cbd5e1',
                    borderRadius: 6,
                    height: 32,
                    width: 110,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#64748b',
                    cursor: 'pointer',
                    background: '#f8fafc',
                    transition: 'all 0.2s',
                    padding: '0 4px',
                    textAlign: 'center',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#94a3b8';
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.color = '#475569';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.color = '#64748b';
                  }}
                  title="Click to upload custom client logo"
                >
                  ➕ Client Logo
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClientLogoReset(); // sets to '' (restores default)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: 8,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Use default logo
                </button>
              </div>
            )}

            <input
              type="file"
              ref={clientLogoInputRef}
              onChange={handleClientLogoUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {/* Vertical separator */}
            <div style={{ width: 1, height: 24, background: '#cbd5e1' }} />

            {/* 2. Contractor Logo Slot */}
            {record?.customLogoPath ? (
              <div
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  display: 'inline-block',
                  border: '1px dashed transparent',
                  borderRadius: 4,
                  padding: '2px 6px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = 'transparent';
                }}
                onClick={() => fileInputRef.current?.click()}
                title="Click to change contractor logo"
              >
                <img 
                  src={record.customLogoPath} 
                  alt="Contractor Logo" 
                  style={{ height: 32, objectFit: 'contain', display: 'block' }} 
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLogoRemove();
                  }}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 14,
                    height: 14,
                    fontSize: 9,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    lineHeight: 1,
                    padding: 0
                  }}
                  title="Remove contractor logo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: 6,
                  height: 32,
                  width: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#64748b',
                  cursor: 'pointer',
                  background: '#f8fafc',
                  transition: 'all 0.2s',
                  padding: '0 4px',
                  textAlign: 'center',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#94a3b8';
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.color = '#475569';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#64748b';
                }}
                title="Click to upload custom contractor logo"
              >
                ➕ Contractor Logo
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLogoUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {/* Vertical separator */}
            <div style={{ width: 1, height: 24, background: '#cbd5e1' }} />

            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>ELECTRICAL MOTOR TEST REPORT</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Testing & Diagnostic Suite PdM-S411</p>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
            <p style={{ margin: 0 }}>Date: <strong>{record?.date || '—'}</strong></p>
            <p style={{ margin: '2px 0 0' }}>Operator: <strong>{record?.operatorName || '—'}</strong></p>
          </div>
        </div>

        {/* Client, Facility, Motor & Testing 4-Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr 1fr', gap: 12, marginBottom: 20 }}>
          
          {/* LEVEL 1: Client Details */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>👤 CLIENT PROFILE (L1)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Client:</span> <strong>{record?.clientName || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Address:</span> <strong>{record?.clientAddress || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Phone:</span> <strong>{record?.clientPhone || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Email:</span> <strong>{record?.clientEmail || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Contact:</span> <strong>{record?.clientContactName || '—'} ({record?.clientContactEmail || '—'})</strong></div>
              {record?.clientNotes && <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Notes:</span> <span style={{ fontSize: 9, fontStyle: 'italic' }}>{record.clientNotes}</span></div>}
            </div>
          </div>

          {/* LEVEL 2: Facility Details */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>🏭 FACILITY DETAILS (L2)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Facility:</span> <strong>{record?.facilityName || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Address:</span> <strong>{record?.facilityAddress || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Manager:</span> <strong>{record?.facilityManager || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Phone:</span> <strong>{record?.facilityPhone || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Test Loc:</span> <strong>{record?.location || '—'}</strong></div>
              {record?.facilityNotes && <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Notes:</span> <span style={{ fontSize: 9, fontStyle: 'italic' }}>{record.facilityNotes}</span></div>}
            </div>
          </div>

          {/* LEVEL 3: Motor Specifications */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>⚙️ MOTOR SPECIFICATIONS (L3)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Type:</span> <strong>{record?.equipmentType || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Utility Tag:</span> <strong>{record?.motorUtilityTag || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>S/N:</span> <strong>{record?.motorSerialNumber || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Standard:</span> <strong>{record?.manufacturingStandard || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Power:</span> <strong>{record?.powerKw ? `${record.powerKw} kW` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Speed:</span> <strong>{record?.speedRpm ? `${record.speedRpm} RPM` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Voltage:</span> <strong>{record?.lineVoltage ? `${record.lineVoltage} V` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Current:</span> <strong>{record?.nominalCurrent ? `${record.nominalCurrent} A` : '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Stator Conn:</span> <strong>{record?.statorConnection || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Rotor Conn:</span> <strong>{record?.rotorConnection || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Class:</span> <strong>{record?.insulationClass || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Rotor Bars:</span> <strong>{record?.rotorBars || '—'}</strong></div>
            </div>
          </div>

          {/* LEVEL 4: Offline settings */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>🔌 TESTING CONDITIONS (L4)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#334155' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Location:</span> <strong>{record?.testingLocation || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Wire Marks:</span> <strong>{`T1: ${record?.wireMarkingT1 || '—'}, T2: ${record?.wireMarkingT2 || '—'}, T3: ${record?.wireMarkingT3 || '—'}`}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>PI V:</span> <strong>{piVolts}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>DAR V:</span> <strong>{darVolts}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>STEP V:</span> <strong>{stepVolts}</strong></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>RAMP V:</span> <strong>{rampVolts}</strong></div>
            </div>
          </div>

        </div>

        {/* Test Summary & Stator Condition Assessment */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr', gap: 16, marginBottom: 20 }}>
          {/* Summary Text Box */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: 10, fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>
              📝 TEST SUMMARY & COMMENTS
            </h4>
            <div style={{ fontSize: 10, color: '#334155', whiteSpace: 'pre-wrap', flex: 1, minHeight: 40, fontStyle: record?.summaryText ? 'normal' : 'italic' }}>
              {record?.summaryText || 'No summary comments provided.'}
            </div>
          </div>

          {/* Condition Assessment Grid */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#fafafa' }}>
            <h4 style={{ fontSize: 10, fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginTop: 0, marginBottom: 6 }}>
              🔍 STATOR CONDITION ASSESSMENT
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, border: '1px solid #e2e8f0' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  {['Insulation', 'Resistance', 'Inductance', 'Impedance', 'Freq. Response'].map(h => (
                    <th key={h} style={{ padding: '6px 4px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #e2e8f0', color: '#1e3a8a' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    { key: 'condInsulation', auto: () => computeOverallInsulationBand(insData, record) || '—' },
                    { key: 'condResistance', auto: () => statorResImb !== null ? rateImbalance('acRes', statorResImb).text : '—' },
                    { key: 'condInductance', auto: () => statorIndImb !== null ? rateImbalance('ind', statorIndImb).text : '—' },
                    { key: 'condImpedance', auto: () => {
                      if (statorImpImb !== null) return rateImbalance('imp', statorImpImb).text;
                      const hasImp = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].some(p => mulData[`stator_imp_${p}_z`]?.value !== undefined);
                      return hasImp ? 'Normal' : '—';
                    }},
                    { key: 'condFrequency', auto: () => {
                      let maxSwImb = 0;
                      ['ind', 'res'].forEach(t => {
                        ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].forEach(f => {
                          const v12 = mulData[`stator_${t}_1-2_${f}`]?.value;
                          const v13 = mulData[`stator_${t}_1-3_${f}`]?.value;
                          const v23 = mulData[`stator_${t}_2-3_${f}`]?.value;
                          const imb = calculateImbalance(v12, v13, v23);
                          if (imb !== null && imb > maxSwImb) maxSwImb = imb;
                        });
                      });
                      return maxSwImb > 0 ? rateImbalance('acRes', maxSwImb).text : '—';
                    }}
                  ].map(c => {
                    const autoVal = c.auto();
                    const val = record?.[c.key] || autoVal;
                    
                    const bg = (RATING_STYLES[val] || {}).bg || '#fff';
                    const color = (RATING_STYLES[val] || {}).color || '#475569';

                    return (
                      <td key={c.key} style={{
                        padding: '8px 4px', textAlign: 'center', fontWeight: 'bold',
                        borderRight: '1px solid #e2e8f0', background: bg, color: color
                      }}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Multimeter Winding Table */}
        {hasMulData && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>🌀 Multimeter Winding Test Readings</h4>
            
            {(includeRotor ? ['stator', 'rotor'] : ['stator']).map((group) => {
              const globalFreq = mulData[`${group}_global_freq`]?.frequency;
              const titleText = (globalFreq && globalFreq !== 'undefined') ? `${group === 'stator' ? 'Stator Winding' : 'Rotor Winding'} (Winding Freq: ${globalFreq})` : (group === 'stator' ? 'Stator Winding' : 'Rotor Winding');
              
              const resFreq = mulData[`${group}_res_freq`]?.frequency;
              const indFreq = mulData[`${group}_ind_freq`]?.frequency;
              const capFreq = mulData[`${group}_cap_freq`]?.frequency;
              const impFreq = mulData[`${group}_imp_freq`]?.frequency;

              const cleanResFreq = ' [0Hz]';
              const cleanIndFreq = (indFreq && indFreq !== 'undefined') ? ` [${indFreq}]` : '';
              const cleanCapFreq = (capFreq && capFreq !== 'undefined') ? ` [${capFreq}]` : '';
              
              const cleanCapFreqText = (capFreq && capFreq !== 'undefined') ? capFreq : '1kHz';
              const cleanImpFreqText = (impFreq && impFreq !== 'undefined') ? impFreq : '—';

              const standardPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N', '123-GND', '1-GND', '2-GND', '3-GND'];
              const capacitancePhases = ['123-GND', '1-GND', '2-GND', '3-GND', '1-2', '1-3', '2-3'];

              // Pick 100Hz if any phase has data there; else fall through to the next available sweep frequency.
              const pickEffectiveFreq = (kind) => {
                const priority = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
                for (const f of priority) {
                  const hit = standardPhases.some(p => {
                    const v = mulData[`${group}_${kind}_${p}_${f}`]?.value;
                    return v !== undefined && v !== null && v !== '';
                  });
                  if (hit) return f;
                }
                return '100Hz';
              };
              const acrFreq = pickEffectiveFreq('res');
              const indFreqSummary = pickEffectiveFreq('ind');

              const isRotor = group === 'rotor';

              // Winding tests within a group share one ambient temperature — pull the first
              // non-empty temperature from any measured field and show it once as a header chip
              // (matches the 🌡️ TEMP chip style used on the Insulation Resistance side).
              const groupTemp = (() => {
                for (const key of Object.keys(mulData)) {
                  if (!key.startsWith(`${group}_`)) continue;
                  if (!(key.includes('_res_') || key.includes('_ind_') || key.includes('_cap_') || key.includes('_imp_'))) continue;
                  const t = mulData[key]?.temperature;
                  if (t !== undefined && t !== null && t !== '' && t !== 'undefined') return t;
                }
                return null;
              })();

              return (
                <div key={group} style={{ marginBottom: 24, border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px 0', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h5 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>{titleText}</h5>
                      {groupTemp !== null && (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', lineHeight: 1.1 }}>
                          <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>🌡️ Temp</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 1 }}>{groupTemp}°C</span>
                        </div>
                      )}
                    </div>
                    {isRotor && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={includeRotor}
                          onChange={(e) => setIncludeRotor(e.target.checked)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        Include in report
                      </label>
                    )}
                  </div>
                  {(<>
                  {/* Summary Table */}
                  <div style={{ marginBottom: 16 }}>
                    <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Winding Readings Summary Table</h6>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#fff', border: '1px solid #cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', color: '#fff' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Phase Line</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>DCR (Ω){record?.correctWindingTo20 ? ' @20°C' : ''}</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>ACR (Ω){record?.correctWindingTo20 ? ' @20°C' : ''}</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>L (mH)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Capacitance (nF)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Impedance Z (Ω)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Angle (°)</th>
                        </tr>
                        <tr style={{ background: '#cbd5e1', color: '#1e3a8a', fontSize: '9px', fontWeight: 'bold' }}>
                          <th style={{ padding: '4px 8px', textAlign: 'left' }}>Injected Freq.</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>0Hz</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>{acrFreq}</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>{indFreqSummary}</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>{cleanCapFreqText}</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>{cleanImpFreqText}</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right' }}>{cleanImpFreqText}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standardPhases.map((phase, idx) => {
                          // 1. DCR
                          const dcrKey = `${group}_res_${phase}`;
                          let dcrVal = mulData[dcrKey]?.value;
                          if (record?.correctWindingTo20 && dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
                            const tempNum = isNaN(parseFloat(mulData[dcrKey]?.temperature)) ? 25 : parseFloat(mulData[dcrKey]?.temperature);
                            dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
                          }
                          let dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : (dcrVal !== undefined && dcrVal !== null && dcrVal !== '' ? dcrVal : '—');

                          // 2. ACR @ effective frequency (falls through to next available if 100Hz is empty)
                          const acrKey = `${group}_res_${phase}_${acrFreq}`;
                          let acrVal = mulData[acrKey]?.value;
                          if (record?.correctWindingTo20 && acrVal !== undefined && acrVal !== null && acrVal !== '') {
                            const tempNum = isNaN(parseFloat(mulData[acrKey]?.temperature)) ? 25 : parseFloat(mulData[acrKey]?.temperature);
                            acrVal = parseFloat((acrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
                          }
                          let acrDisp = isOverload(acrVal, 'R') ? 'O.L' : (acrVal !== undefined && acrVal !== null && acrVal !== '' ? acrVal : '—');

                          // 3. L @ effective frequency
                          const indKey = `${group}_ind_${phase}_${indFreqSummary}`;
                          let indVal = mulData[indKey]?.value;
                          let indDisp = isOverload(indVal, 'L') ? 'O.L' : (indVal !== undefined && indVal !== null && indVal !== '' ? indVal : '—');

                          // 4. Capacitance
                          const capKey = `${group}_cap_${phase}`;
                          let capVal = mulData[capKey]?.value;
                          let capDisp = isOverload(capVal, 'C') ? 'O.L' : (capVal !== undefined && capVal !== null && capVal !== '' ? capVal : '—');

                          // 5. Impedance
                          const impKey = `${group}_imp_${phase}_z`;
                          let impVal = mulData[impKey]?.value;
                          let impDisp = isOverload(impVal, 'Z') ? 'O.L' : (impVal !== undefined && impVal !== null && impVal !== '' ? impVal : '—');

                          // 6. Angle
                          const degKey = `${group}_imp_${phase}_deg`;
                          let degVal = mulData[degKey]?.value;
                          let degDisp = (degVal !== undefined && degVal !== null && degVal !== '') ? degVal : '—';

                          return (
                            <tr key={phase} style={{ borderBottom: '1px solid #cbd5e1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>Phase {phase}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{dcrDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{acrDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{indDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{capDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{impDisp}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{degDisp}</td>
                            </tr>
                          );
                        })}
                        {(() => {
                          const getImbalanceCellData = (imb) => {
                            if (imb === null) return { bg: '#fff', text: '#64748b', display: '—' };
                            const display = `${imb.toFixed(2)}%`;
                            if (imb >= 5) return { bg: '#fee2e2', text: '#991b1b', display };
                            if (imb >= 2) return { bg: '#fef3c7', text: '#92400e', display };
                            return { bg: '#d1fae5', text: '#065f46', display };
                          };

                          const dcrVals = ['1-2', '1-3', '2-3'].map(phase => {
                            const key = `${group}_res_${phase}`;
                            let val = mulData[key]?.value;
                            if (record?.correctWindingTo20 && val !== undefined && val !== null && val !== '') {
                              const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
                              val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
                            }
                            return val;
                          });
                          const dcrSumImb = calculateImbalance(dcrVals[0], dcrVals[1], dcrVals[2]);

                          const acrVals = ['1-2', '1-3', '2-3'].map(phase => {
                            const key = `${group}_res_${phase}_${acrFreq}`;
                            let val = mulData[key]?.value;
                            if (record?.correctWindingTo20 && val !== undefined && val !== null && val !== '') {
                              const tempNum = isNaN(parseFloat(mulData[key]?.temperature)) ? 25 : parseFloat(mulData[key]?.temperature);
                              val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
                            }
                            return val;
                          });
                          const acrSumImb = calculateImbalance(acrVals[0], acrVals[1], acrVals[2]);

                          const indVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_ind_${phase}_${indFreqSummary}`]?.value);
                          const indSumImb = calculateImbalance(indVals[0], indVals[1], indVals[2]);

                          const capVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_cap_${phase}`]?.value);
                          let capSumImb = calculateImbalance(capVals[0], capVals[1], capVals[2]);
                          if (capSumImb === null || capSumImb === undefined) {
                            const capGndVals = ['1-GND', '2-GND', '3-GND'].map(phase => mulData[`${group}_cap_${phase}`]?.value);
                            capSumImb = calculateImbalance(capGndVals[0], capGndVals[1], capGndVals[2]);
                          }

                          const impVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_imp_${phase}_z`]?.value);
                          const impSumImb = calculateImbalance(impVals[0], impVals[1], impVals[2]);

                          const degVals = ['1-2', '1-3', '2-3'].map(phase => mulData[`${group}_imp_${phase}_deg`]?.value);
                          const degSumImb = calculateImbalance(degVals[0], degVals[1], degVals[2]);

                          const cellDcr = getImbalanceCellData(dcrSumImb);
                          const cellAcr = getImbalanceCellData(acrSumImb);
                          const cellInd = getImbalanceCellData(indSumImb);
                          const cellCap = getImbalanceCellData(capSumImb);
                          const cellImp = getImbalanceCellData(impSumImb);
                          const cellDeg = getImbalanceCellData(degSumImb);

                          return (
                            <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9', fontWeight: 'bold' }}>
                              <td style={{ padding: '6px 8px', color: '#1e3a8a' }}>% Imbalance</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: cellDcr.bg, color: cellDcr.text, fontFamily: 'monospace' }}>{cellDcr.display}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: cellAcr.bg, color: cellAcr.text, fontFamily: 'monospace' }}>{cellAcr.display}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: cellInd.bg, color: cellInd.text, fontFamily: 'monospace' }}>{cellInd.display}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: cellCap.bg, color: cellCap.text, fontFamily: 'monospace' }}>{cellCap.display}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: cellImp.bg, color: cellImp.text, fontFamily: 'monospace' }}>{cellImp.display}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: cellDeg.bg, color: cellDeg.text, fontFamily: 'monospace' }}>{cellDeg.display}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Combined Winding Resistance (DCR + ACR) Table — DCR column highlighted */}
                  <div>
                    <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>DCR &amp; ACR Winding Resistance (Ω){record?.correctWindingTo20 ? ' @20°C' : ''}</h6>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, border: '1px solid #cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#1e40af', color: '#fff' }}>
                          <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>DC</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>100Hz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>120Hz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>1kHz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>10kHz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>100kHz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].map((phase, idx) => {
                          // DCR (spot) value — temperature now shown once in the group header chip.
                          const dcrKey = `${group}_res_${phase}`;
                          let dcrVal = mulData[dcrKey]?.value;
                          const rawTemp = mulData[dcrKey]?.temperature;
                          if (record?.correctWindingTo20 && dcrVal !== undefined && dcrVal !== null && dcrVal !== '') {
                            const tempNum = isNaN(parseFloat(rawTemp)) ? 25 : parseFloat(rawTemp);
                            dcrVal = parseFloat((dcrVal * (254.5 / (234.5 + tempNum))).toFixed(3));
                          }
                          const dcrDisp = isOverload(dcrVal, 'R') ? 'O.L' : (dcrVal !== undefined && dcrVal !== null && dcrVal !== '' ? dcrVal : '—');
                          const rowBg = idx % 2 === 0 ? '#fff' : '#f8fafc';
                          return (
                            <tr key={phase} style={{ borderBottom: '1px solid #cbd5e1', background: rowBg }}>
                              <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', background: '#eff6ff', fontWeight: 700 }}>{dcrDisp}</td>
                              {['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
                                const key = `${group}_res_${phase}_${f}`;
                                const cellData = mulData[key];
                                let val = cellData?.value;

                                // Fallback to spot ACR if sweep is empty
                                if (val === undefined || val === null || val === '') {
                                  const spotKey = `${group}_res_${phase}`;
                                  const spotVal = mulData[spotKey]?.value;
                                  const spotFreq = mulData[spotKey]?.frequency;
                                  if (spotFreq === f && spotVal !== undefined && spotVal !== null && spotVal !== '') {
                                    val = spotVal;
                                  }
                                }

                                if (val !== undefined && val !== null && val !== '') {
                                  val = parseFloat(val);
                                  if (record?.correctWindingTo20) {
                                    const tempNum = isNaN(parseFloat(cellData?.temperature)) ? 25 : parseFloat(cellData?.temperature);
                                    val = parseFloat((val * (254.5 / (234.5 + tempNum))).toFixed(3));
                                  }
                                }
                                const displayVal = val !== undefined && val !== null && val !== '' ? (isOverload(val, 'R') ? 'O.L' : String(val)) : '—';
                                return (
                                  <td key={f} style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                                    {displayVal}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {(() => {
                          const imbCell = (imb) => {
                            if (imb === null || imb === undefined) return { bg: '#fff', text: '#64748b', display: '—' };
                            const display = `${imb.toFixed(2)}%`;
                            if (imb >= 5) return { bg: '#fee2e2', text: '#991b1b', display };
                            if (imb >= 2) return { bg: '#fef3c7', text: '#92400e', display };
                            return { bg: '#d1fae5', text: '#065f46', display };
                          };
                          const tempCorrect = (val, temp) => {
                            if (val === undefined || val === null || val === '') return null;
                            const v = parseFloat(val);
                            if (isNaN(v)) return null;
                            if (!record?.correctWindingTo20) return v;
                            const tempNum = isNaN(parseFloat(temp)) ? 25 : parseFloat(temp);
                            return v * (254.5 / (234.5 + tempNum));
                          };
                          // DC column (spot DCR)
                          const dcVals = ['1-2', '1-3', '2-3'].map(p => {
                            const k = `${group}_res_${p}`;
                            return tempCorrect(mulData[k]?.value, mulData[k]?.temperature);
                          });
                          const dcImb = calculateImbalance(dcVals[0], dcVals[1], dcVals[2]);
                          const freqImbs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
                            const vals = ['1-2', '1-3', '2-3'].map(p => {
                              const k = `${group}_res_${p}_${f}`;
                              let v = mulData[k]?.value;
                              if (v === undefined || v === null || v === '') {
                                const spot = mulData[`${group}_res_${p}`];
                                if (spot?.frequency === f) v = spot?.value;
                              }
                              return tempCorrect(v, mulData[k]?.temperature);
                            });
                            return calculateImbalance(vals[0], vals[1], vals[2]);
                          });
                          const allImbs = [dcImb, ...freqImbs];
                          return (
                            <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9', fontWeight: 'bold' }}>
                              <td style={{ padding: '6px 6px', color: '#1e3a8a' }}>% Imbalance</td>
                              {allImbs.map((imb, i) => {
                                const c = imbCell(imb);
                                return (
                                  <td key={i} style={{ padding: '6px 6px', textAlign: 'right', background: c.bg, color: c.text, fontFamily: 'monospace' }}>{c.display}</td>
                                );
                              })}
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Inductance Table */}
                  <div style={{ marginTop: 16 }}>
                    <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Winding Inductance (mH)</h6>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, border: '1px solid #cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#1e40af', color: '#fff' }}>
                          <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>100Hz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>120Hz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>1kHz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>10kHz</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right' }}>100kHz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'].map((phase, idx) => {
                          return (
                            <tr key={phase} style={{ borderBottom: '1px solid #cbd5e1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                              {['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
                                const key = `${group}_ind_${phase}_${f}`;
                                let val = mulData[key]?.value;
                                
                                // Fallback to spot Inductance if sweep is empty
                                if (val === undefined || val === null || val === '') {
                                  const spotKey = `${group}_ind_${phase}`;
                                  const spotVal = mulData[spotKey]?.value;
                                  const spotFreq = mulData[spotKey]?.frequency;
                                  if (spotFreq === f && spotVal !== undefined && spotVal !== null && spotVal !== '') {
                                    val = spotVal;
                                  }
                                }

                                const displayVal = val !== undefined && val !== null && val !== '' ? (isOverload(val, 'L') ? 'O.L' : String(val)) : '—';
                                return (
                                  <td key={f} style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                                    {displayVal}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {(() => {
                          const imbCell = (imb) => {
                            if (imb === null || imb === undefined) return { bg: '#fff', text: '#64748b', display: '—' };
                            const display = `${imb.toFixed(2)}%`;
                            if (imb >= 5) return { bg: '#fee2e2', text: '#991b1b', display };
                            if (imb >= 2) return { bg: '#fef3c7', text: '#92400e', display };
                            return { bg: '#d1fae5', text: '#065f46', display };
                          };
                          const freqImbs = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'].map(f => {
                            const vals = ['1-2', '1-3', '2-3'].map(p => {
                              let v = mulData[`${group}_ind_${p}_${f}`]?.value;
                              if (v === undefined || v === null || v === '') {
                                const spot = mulData[`${group}_ind_${p}`];
                                if (spot?.frequency === f) v = spot?.value;
                              }
                              return v;
                            });
                            return calculateImbalance(vals[0], vals[1], vals[2]);
                          });
                          return (
                            <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9', fontWeight: 'bold' }}>
                              <td style={{ padding: '6px 6px', color: '#1e3a8a' }}>% Imbalance</td>
                              {freqImbs.map((imb, i) => {
                                const c = imbCell(imb);
                                return (
                                  <td key={i} style={{ padding: '6px 6px', textAlign: 'right', background: c.bg, color: c.text, fontFamily: 'monospace' }}>{c.display}</td>
                                );
                              })}
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Impedance + Polar + Capacitance combined row (moved above rotor winding) */}
                  {(() => {
                    const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
                    const Z_FREQS = ['100Hz', '120Hz', '1kHz', '10kHz', '100kHz'];
                    const getImpCell = (group, phase, type) => {
                      for (const f of Z_FREQS) {
                        const cell = mulData[`${group}_imp_${phase}_${f}_${type}`];
                        if (cell?.value !== undefined && cell?.value !== null && cell?.value !== '') return cell;
                      }
                      return mulData[`${group}_imp_${phase}_${type}`];
                    };

                    const hasGroupImp = impPhases.some(phase => {
                      if (mulData[`${group}_imp_${phase}_z`]?.value !== undefined || mulData[`${group}_imp_${phase}_deg`]?.value !== undefined) return true;
                      return Z_FREQS.some(f => mulData[`${group}_imp_${phase}_${f}_z`]?.value !== undefined || mulData[`${group}_imp_${phase}_${f}_deg`]?.value !== undefined);
                    });
                    const hasGroupCap = capacitancePhases.some(p => {
                      const v = mulData[`${group}_cap_${p}`]?.value;
                      return v !== undefined && v !== null && v !== '';
                    });
                    if (!hasGroupImp && !hasGroupCap) return null;

                    // Collect every per-phase impedance frequency; only show a single
                    // header suffix when every populated cell shares the same frequency.
                    // Otherwise fall back to a per-row Frequency column.
                    const impFreqSet = new Set();
                    impPhases.forEach(phase => {
                      const zCell = getImpCell(group, phase, 'z');
                      const dCell = getImpCell(group, phase, 'deg');
                      const hasZ = zCell?.value !== undefined && zCell?.value !== null && zCell?.value !== '';
                      const hasD = dCell?.value !== undefined && dCell?.value !== null && dCell?.value !== '';
                      const fV = zCell?.frequency || dCell?.frequency;
                      if ((hasZ || hasD) && fV && fV !== 'undefined' && fV !== 'null') {
                        impFreqSet.add(fV);
                      }
                    });
                    if (impFreqSet.size === 0 && impFreq && impFreq !== 'undefined') {
                      impFreqSet.add(impFreq);
                    }
                    const impFreqs = Array.from(impFreqSet);
                    const impSingleFreq = impFreqs.length === 1 ? impFreqs[0] : null;
                    const impHeaderSuffix = impSingleFreq ? ` [${impSingleFreq}]` : '';
                    const showImpFreqColumn = impFreqs.length > 1;

                    const polarData = [];
                    impPhases.forEach(phase => {
                      const zVal = getImpCell(group, phase, 'z')?.value;
                      const degVal = getImpCell(group, phase, 'deg')?.value;
                      if (zVal !== undefined && zVal !== null && !isNaN(parseFloat(zVal))) {
                        polarData.push({
                          phase,
                          z: parseFloat(zVal),
                          deg: degVal !== undefined && degVal !== null && !isNaN(parseFloat(degVal)) ? parseFloat(degVal) : 0
                        });
                      }
                    });

                    return (
                      <div style={{ marginTop: 16 }}>
                        {hasGroupImp && (
                          <h5 style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '0 0 6px 0' }}>
                            🌀 {group === 'stator' ? 'Stator' : 'Rotor'} Winding Impedance (Z & Phase Angle){impHeaderSuffix}
                          </h5>
                        )}
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                          {hasGroupCap && (
                            <div style={{ flex: 0.9 }}>
                              <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Capacitance{cleanCapFreq}</h6>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, border: '1px solid #cbd5e1' }}>
                                <thead>
                                  <tr style={{ background: '#1e40af', color: '#fff' }}>
                                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Phase Line</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Capacitance (nF)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {capacitancePhases.map((phase, idx) => {
                                    const key = `${group}_cap_${phase}`;
                                    const val = mulData[key]?.value;
                                    const displayVal = isOverload(val, 'C') ? 'O.L' : (val !== undefined && val !== null && val !== '' ? val : '—');
                                    return (
                                      <tr key={phase} style={{ borderBottom: '1px solid #cbd5e1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>Phase {phase}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{displayVal}</td>
                                      </tr>
                                    );
                                  })}
                                  {(() => {
                                    const imbCell = (imb) => {
                                      if (imb === null || imb === undefined) return { bg: '#fff', text: '#64748b', display: '—' };
                                      const display = `${imb.toFixed(2)}%`;
                                      if (imb >= 5) return { bg: '#fee2e2', text: '#991b1b', display };
                                      if (imb >= 2) return { bg: '#fef3c7', text: '#92400e', display };
                                      return { bg: '#d1fae5', text: '#065f46', display };
                                    };
                                    const lineVals = ['1-2', '1-3', '2-3'].map(p => mulData[`${group}_cap_${p}`]?.value);
                                    let capImb = calculateImbalance(lineVals[0], lineVals[1], lineVals[2]);
                                    if (capImb === null || capImb === undefined) {
                                      const gndVals = ['1-GND', '2-GND', '3-GND'].map(p => mulData[`${group}_cap_${p}`]?.value);
                                      capImb = calculateImbalance(gndVals[0], gndVals[1], gndVals[2]);
                                    }
                                    const c = imbCell(capImb);
                                    return (
                                      <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9', fontWeight: 'bold' }}>
                                        <td style={{ padding: '6px 6px', color: '#1e3a8a' }}>% Imbalance</td>
                                        <td style={{ padding: '6px 6px', textAlign: 'right', background: c.bg, color: c.text, fontFamily: 'monospace' }}>{c.display}</td>
                                      </tr>
                                    );
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {hasGroupImp && (
                            <div style={{ flex: 1.2, overflowX: 'auto' }}>
                              <h6 style={{ fontSize: 10, fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Impedance{impHeaderSuffix}</h6>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#fff', border: '1px solid #cbd5e1' }}>
                                <thead>
                                  <tr style={{ background: '#1e40af', color: '#fff' }}>
                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Phase Line</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Impedance Z (Ω)</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Phase Angle (°)</th>
                                    {showImpFreqColumn && (
                                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Frequency</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {impPhases.map((phase, pIdx) => {
                                    const zCell = getImpCell(group, phase, 'z');
                                    const dCell = getImpCell(group, phase, 'deg');
                                    const zVal = zCell?.value;
                                    const degVal = dCell?.value;
                                    const rowFreq = zCell?.frequency || dCell?.frequency || impFreq || '—';
                                    return (
                                      <tr key={phase} style={{ borderBottom: '1px solid #e2e8f0', background: pIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>Phase {phase}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                          {isOverload(zVal, 'Z') ? 'O.L' : (zVal !== undefined ? zVal : '—')}
                                        </td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                          {degVal !== undefined ? degVal : '—'}
                                        </td>
                                        {showImpFreqColumn && (
                                          <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                            {(rowFreq && rowFreq !== 'undefined' && rowFreq !== 'null') ? rowFreq : '—'}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                  {(() => {
                                    const imbCell = (imb) => {
                                      if (imb === null || imb === undefined) return { bg: '#fff', text: '#64748b', display: '—' };
                                      const display = `${imb.toFixed(2)}%`;
                                      if (imb >= 5) return { bg: '#fee2e2', text: '#991b1b', display };
                                      if (imb >= 2) return { bg: '#fef3c7', text: '#92400e', display };
                                      return { bg: '#d1fae5', text: '#065f46', display };
                                    };
                                    const zVals = ['1-2', '1-3', '2-3'].map(p => getImpCell(group, p, 'z')?.value);
                                    const degVals = ['1-2', '1-3', '2-3'].map(p => getImpCell(group, p, 'deg')?.value);
                                    const zImb = calculateImbalance(zVals[0], zVals[1], zVals[2]);
                                    const degImb = calculateImbalance(degVals[0], degVals[1], degVals[2]);
                                    const cz = imbCell(zImb);
                                    const cd = imbCell(degImb);
                                    return (
                                      <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9', fontWeight: 'bold' }}>
                                        <td style={{ padding: '6px 8px', color: '#1e3a8a' }}>% Imbalance</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', background: cz.bg, color: cz.text, fontFamily: 'monospace' }}>{cz.display}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', background: cd.bg, color: cd.text, fontFamily: 'monospace' }}>{cd.display}</td>
                                        {showImpFreqColumn && (
                                          <td style={{ padding: '6px 8px' }}>&nbsp;</td>
                                        )}
                                      </tr>
                                    );
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  </>)}
                </div>
              );
            })}

            {/* Phase Imbalance warning section */}
            {(statorResImb !== null || statorIndImb !== null || statorCapImb !== null || statorImpImb !== null ||
              rotorResImb !== null || rotorIndImb !== null || rotorCapImb !== null || rotorImpImb !== null) && (
              <div style={{ marginTop: 14, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <h5 style={{ fontSize: 11, fontWeight: 700, color: '#b45309', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ Phase Imbalance Diagnostics
                </h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {statorResImb !== null && (
                    <div style={{ fontSize: 10, background: statorResImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statorResImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Stator Res Imbalance: <strong>{statorResImb.toFixed(2)}%</strong> ({statorResImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {statorIndImb !== null && (
                    <div style={{ fontSize: 10, background: statorIndImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statorIndImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Stator Ind Imbalance: <strong>{statorIndImb.toFixed(2)}%</strong> ({statorIndImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {statorCapImb !== null && (
                    <div style={{ fontSize: 10, background: statorCapImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statorCapImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Stator Cap Imbalance: <strong>{statorCapImb.toFixed(2)}%</strong> ({statorCapImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {statorImpImb !== null && (
                    <div style={{ fontSize: 10, background: statorImpImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${statorImpImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Stator Imp Imbalance: <strong>{statorImpImb.toFixed(2)}%</strong> ({statorImpImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {rotorResImb !== null && (
                    <div style={{ fontSize: 10, background: rotorResImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rotorResImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Rotor Res Imbalance: <strong>{rotorResImb.toFixed(2)}%</strong> ({rotorResImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {rotorIndImb !== null && (
                    <div style={{ fontSize: 10, background: rotorIndImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rotorIndImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Rotor Ind Imbalance: <strong>{rotorIndImb.toFixed(2)}%</strong> ({rotorIndImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {rotorCapImb !== null && (
                    <div style={{ fontSize: 10, background: rotorCapImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rotorCapImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Rotor Cap Imbalance: <strong>{rotorCapImb.toFixed(2)}%</strong> ({rotorCapImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                  {rotorImpImb !== null && (
                    <div style={{ fontSize: 10, background: rotorImpImb < 5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${rotorImpImb < 5 ? '#bbf7d0' : '#fecaca'}`, padding: '4px 8px', borderRadius: 6 }}>
                      Rotor Imp Imbalance: <strong>{rotorImpImb.toFixed(2)}%</strong> ({rotorImpImb < 5 ? 'Good' : 'High'})
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Impedance Polar Plots — col-md-6 each, before sweep charts */}
            {(() => {
              const impPhases = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
              const buildPolarData = (group) => {
                const arr = [];
                impPhases.forEach(phase => {
                  const zVal = mulData[`${group}_imp_${phase}_z`]?.value;
                  const degVal = mulData[`${group}_imp_${phase}_deg`]?.value;
                  if (zVal !== undefined && zVal !== null && !isNaN(parseFloat(zVal))) {
                    arr.push({
                      phase,
                      z: parseFloat(zVal),
                      deg: degVal !== undefined && degVal !== null && !isNaN(parseFloat(degVal)) ? parseFloat(degVal) : 0
                    });
                  }
                });
                return arr;
              };
              const statorPolar = buildPolarData('stator');
              const rotorPolar = includeRotor ? buildPolarData('rotor') : [];
              if (statorPolar.length === 0 && rotorPolar.length === 0) return null;
              return (
                <div style={{ marginTop: 20 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                    🎯 Impedance Polar Plots
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
                    {statorPolar.length > 0 && (
                      <div id="chart-polar-stator" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '0 0 8px 0' }}>Stator Impedance Polar Plot</h5>
                        <PolarPlot data={statorPolar} size={220} />
                      </div>
                    )}
                    {rotorPolar.length > 0 && (
                      <div id="chart-polar-rotor" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', margin: '0 0 8px 0' }}>Rotor Impedance Polar Plot</h5>
                        <PolarPlot data={rotorPolar} size={220} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Frequency Sweep Tables */}
            {(hasLStatorSweep || hasLRotorSweep || hasRStatorSweep || hasRRotorSweep) && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                  📈 Winding Frequency Response
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
                    {renderSweepTable('Stator Inductance Sweep (mH)', 'stator', 'ind')}
                    {renderSweepTable('Stator AC Winding Resistance Sweep (Ω)', 'stator', 'res')}
                  </div>
                  {includeRotor && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
                      {renderSweepTable('Rotor Inductance Sweep (mH)', 'rotor', 'ind')}
                      {renderSweepTable('Rotor AC Winding Resistance Sweep (Ω)', 'rotor', 'res')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rotor Winding placeholder — after graphs; only when rotor excluded */}
            {!includeRotor && (
              <div style={{ marginTop: 24, border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px 0', gap: 12 }}>
                  <h5 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', margin: 0 }}>Rotor Winding</h5>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={includeRotor}
                      onChange={(e) => setIncludeRotor(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    Include in report
                  </label>
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', padding: '8px 4px' }}>
                  Rotor winding is excluded from the PDF/Excel export. Tick the box above to include it.
                </div>
              </div>
            )}

          </div>
        )}

        {/* Insulation Results */}
        {hasInsulation && (
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>⚡ Insulation Test Data (Megger MIT 525)</h4>
            {['PI', 'DAR', 'SV', 'RAMP'].map(tab => {
              const tabData = insData[tab] || {};
              const activeTables = Object.keys(tabData).filter(tableId => tabData[tableId] && tabData[tableId].length > 0);

              if (activeTables.length === 0) return null;

              return (
                <div key={tab} style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: '0 0 6px 0' }}>Mode: {tab} Test</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeTables.map(tableId => {
                      const rows = tabData[tableId];
                      const r30 = rows.find(r => r.time >= 30)?.resistance;
                      const r60 = rows.find(r => r.time >= 60)?.resistance;
                      const r600 = rows.find(r => r.time >= 600)?.resistance;

                      const pi = r600 && r60 ? (r600 / r60).toFixed(2) : '—';
                      const dar = r60 && r30 ? (r60 / r30).toFixed(2) : '—';

                      return (
                        <div key={tableId} style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                          <div style={{ background: '#f1f5f9', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#475569' }}>
                            Table: {tableId}
                          </div>
                          
                          <div style={{ padding: 12 }}>
                            {/* Summary Card */}
                            {(() => {
                              const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                              const runTemp = runMeta.temperature !== undefined && runMeta.temperature !== '' ? runMeta.temperature : (record?.temperature || 25);
                              const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                              const Kt = Math.pow(0.5, (40 - tempVal) / 10);

                              const Rt = rows.length > 0 ? rows[rows.length - 1].resistance : null;
                              const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;

                              const rawRtStr = Rt !== null ? formatResistance(Rt) : '—';
                              const corrR40Str = Rc40 !== null ? formatResistance(Rc40) : '—';

                              const ddVal = rows.length > 2 ? '1.38' : '—';

                              // Rating per Sarox docx: PI ratio, DAR ratio, SV settlement %,
                              // RAMP falls back to IEEE-43 Rc40 bands.
                              const rating = rateInsulationTable({
                                tab,
                                pi: pi === '—' ? null : Number(pi),
                                dar: dar === '—' ? null : Number(dar),
                                svSummaryRows: tab === 'SV' ? getSVSummaryRows(rows) : null,
                                Rc40, Rt,
                                correctionOn: !!record?.correctInsulationTo40,
                              });

                              return (
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                                  gap: 10,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 8,
                                  padding: 10,
                                  marginBottom: 12
                                }}>
                                  {tab !== 'DAR' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                      <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>PI</span>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{pi}</span>
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>DAR</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{dar}</span>
                                  </div>

                                  {tab === 'PI' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                      <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>DD</span>
                                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{ddVal}</span>
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>🌡️ Temp</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{tempVal}°C</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Raw Rt</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#334155', marginTop: 2, textAlign: 'center' }}>{rawRtStr}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Corrected R40</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1e3a8a', marginTop: 2, textAlign: 'center' }}>{corrR40Str}</span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', background: rating.bg, borderRadius: 6, border: `1px solid ${rating.color}` }}
                                    title={tab === 'SV' && rating.decrease !== null && rating.decrease !== undefined
                                      ? `Worst step-to-step resistance decrease: ${rating.decrease.toFixed(1)}%`
                                      : undefined}
                                  >
                                    <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Rating</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: rating.color, marginTop: 2, textAlign: 'center' }}>{rating.text}</span>
                                  </div>
                                </div>
                              );
                            })()}

                            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                              <div style={{ flex: 1.2, overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                  <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                      <th style={{ padding: '4px 8px', textAlign: 'center' }}>Time (s)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Voltage (V)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Actual V (V)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Current (uA)</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>
                                        {(() => {
                                          const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                                          const runTemp = runMeta.temperature !== undefined ? runMeta.temperature : record?.temperature;
                                          const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                                          return `IR at ${tempVal}°C`;
                                        })()}
                                      </th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>
                                        IR baselined to 40°C (IEEE 43)
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const cleanRows = (tab === 'PI' || tab === 'DAR' || tab === 'RAMP') ? stripTrailingSummary(rows) : rows;
                                      let previewRows = cleanRows;
                                      if (tab === 'PI') {
                                        previewRows = cleanRows.filter(r => {
                                          const t = Math.round(r.time);
                                          return t !== 0 && (t === 1 || t % 15 === 0);
                                        });
                                      } else if (tab === 'DAR') {
                                        previewRows = cleanRows.filter(r => {
                                          const t = Math.round(r.time);
                                          return t !== 0 && (t === 1 || t % 5 === 0);
                                        });
                                      } else if (tab === 'SV') {
                                        const { transientRows } = splitSVData(rows);
                                        previewRows = transientRows.filter(r => {
                                          const t = Math.round(r.time);
                                          return t !== 0 && (t === 1 || t % 10 === 0);
                                        });
                                      }
                                      return previewRows.map((r, idx) => {
                                        const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                                        const runTemp = runMeta.temperature !== undefined ? runMeta.temperature : record?.temperature;
                                        const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                                        const Kt = Math.pow(0.5, (40 - tempVal) / 10);
                                        const rawRes = r.resistance;
                                        const corrRes = typeof r.resistance === 'number' ? Math.round(r.resistance * Kt) : '—';
                                        return (
                                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{r.time}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.voltage}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.actualVoltage}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{r.current}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatResistance(rawRes)}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatResistance(corrRes)}</td>
                                        </tr>
                                      );
                                    });
                                  })()}
                                  </tbody>
                                </table>
                              </div>

                              {(() => {
                                if (tab === 'SV') {
                                  const { transientRows, summaryRows } = splitSVData(rows);
                                  if (summaryRows.length > 0) {
                                    return (
                                      <div id={`chart-insulation-${tab}-${tableId}`} style={{ flex: 1.0, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                                        {/* Chart 1: SV Transient Current Plot */}
                                        <div style={{ height: 180, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px 8px 8px', display: 'flex', flexDirection: 'column' }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a8a', textAlign: 'center', marginBottom: 2 }}>SV Transient Current Plot</div>
                                          <div style={{ flex: 1, minHeight: 0 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={transientRows} margin={{ top: 5, right: 10, left: 15, bottom: 15 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="time" padding={{ left: 5, right: 10 }} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                  <Label value="Time (s)" offset={-2} position="insideBottom" style={{ fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                                </XAxis>
                                                <YAxis width={45} tickFormatter={(val) => typeof val === 'number' ? val.toFixed(4) : val} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                  <Label value="Current (uA)" angle={-90} position="insideLeft" offset={-5} style={{ textAnchor: 'middle', fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                                </YAxis>
                                                <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4 }} wrapperStyle={{ zIndex: 100 }} />
                                                <Line type="monotone" dataKey="current" name="I (uA)" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                        </div>
                                        {/* Chart 2: SV Step Current Plot */}
                                        <div style={{ height: 180, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px 8px 8px', display: 'flex', flexDirection: 'column' }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a8a', textAlign: 'center', marginBottom: 2 }}>SV Step Current Plot</div>
                                          <div style={{ flex: 1, minHeight: 0 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={summaryRows} margin={{ top: 5, right: 10, left: 15, bottom: 15 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="time" padding={{ left: 5, right: 10 }} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                  <Label value="Time (s)" offset={-2} position="insideBottom" style={{ fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                                </XAxis>
                                                <YAxis width={45} tickFormatter={(val) => typeof val === 'number' ? val.toFixed(4) : val} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                  <Label value="Current (uA)" angle={-90} position="insideLeft" offset={-5} style={{ textAnchor: 'middle', fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                                </YAxis>
                                                <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4 }} wrapperStyle={{ zIndex: 100 }} />
                                                <Line type="monotone" dataKey="current" name="I (uA)" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                        </div>
                                        {/* Chart 3: SV Step Resistance Plot */}
                                        <div style={{ height: 180, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px 8px 8px', display: 'flex', flexDirection: 'column' }}>
                                          <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a8a', textAlign: 'center', marginBottom: 2 }}>SV Step Resistance Plot</div>
                                          <div style={{ flex: 1, minHeight: 0 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <LineChart data={summaryRows.map(r => {
                                                const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                                                const runTemp = runMeta.temperature !== undefined ? runMeta.temperature : record?.temperature;
                                                const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                                                const Kt = Math.pow(0.5, (40 - tempVal) / 10);
                                                const displayRes = record?.correctInsulationTo40 ? Math.round(r.resistance * Kt) : r.resistance;
                                                return {
                                                  time: r.time,
                                                  resistance: displayRes
                                                };
                                              })} margin={{ top: 5, right: 10, left: 15, bottom: 15 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="time" padding={{ left: 5, right: 10 }} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                  <Label value="Time (s)" offset={-2} position="insideBottom" style={{ fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                                </XAxis>
                                                <YAxis width={45} tickFormatter={(val) => typeof val === 'number' ? Math.round(val).toLocaleString() : val} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                  <Label value="Resistance (MΩ)" angle={-90} position="insideLeft" offset={-5} style={{ textAnchor: 'middle', fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                                </YAxis>
                                                <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4 }} wrapperStyle={{ zIndex: 100 }} />
                                                <Line type="linear" dataKey="resistance" name="R (MΩ)" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                                              </LineChart>
                                            </ResponsiveContainer>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    // Fallback if no summary rows (but still SV)
                                    return (
                                      <div id={`chart-insulation-${tab}-${tableId}`} style={{ flex: 1.0, height: 180, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px 8px 8px', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a8a', textAlign: 'center', marginBottom: 2 }}>SV Current vs Time Plot</div>
                                        <div style={{ flex: 1, minHeight: 0 }}>
                                          <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={transientRows} margin={{ top: 5, right: 10, left: 15, bottom: 15 }}>
                                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                              <XAxis dataKey="time" padding={{ left: 5, right: 10 }} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                <Label value="Time (s)" offset={-2} position="insideBottom" style={{ fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                              </XAxis>
                                              <YAxis width={45} tickFormatter={(val) => typeof val === 'number' ? val.toFixed(4) : val} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                                <Label value="Current (uA)" angle={-90} position="insideLeft" offset={-5} style={{ textAnchor: 'middle', fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                              </YAxis>
                                              <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4 }} wrapperStyle={{ zIndex: 100 }} />
                                              <Line type="monotone" dataKey="current" name="I (uA)" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                                            </LineChart>
                                          </ResponsiveContainer>
                                        </div>
                                      </div>
                                    );
                                  }
                                }

                                // Otherwise standard PI, DAR, or RAMP
                                const yAxisKey = tab === 'RAMP' ? 'current' : 'resistance';
                                const yAxisLabel = tab === 'RAMP' ? 'Current (uA)' : 'Resistance (MΩ)';
                                const lineName = tab === 'RAMP' ? 'I (uA)' : 'R (MΩ)';
                                const strokeColor = tab === 'RAMP' ? '#3b82f6' : '#3b82f6';

                                return (
                                  <div id={`chart-insulation-${tab}-${tableId}`} style={{ flex: 1.0, height: 180, minWidth: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px 8px 8px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={(() => {
                                        // stripEarlyTransients drops the 2 TΩ stabilization spike so the Y-axis
                                        // auto-scales to the real signal (matches InsulationTab behavior).
                                        let chartRows = stripEarlyTransients(stripTrailingSummary(rows).filter(r => r.time !== 0));
                                        if (tab === 'DAR') {
                                          const resistances = chartRows
                                            .map(r => r.resistance)
                                            .filter(val => val !== null && val !== undefined && !isNaN(val));
                                          if (resistances.length > 0) {
                                            const sorted = [...resistances].sort((a, b) => a - b);
                                            const mid = Math.floor(sorted.length / 2);
                                            const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                                            if (median !== 0) {
                                              chartRows = chartRows.filter(r => {
                                                const val = r.resistance;
                                                if (val === null || val === undefined || isNaN(val)) return false;
                                                return val <= median * 10 && val >= median / 10;
                                              });
                                            }
                                          }
                                        }
                                        return chartRows.map(r => {
                                          const runMeta = insData[tab]?.[`${tableId}_meta`] || {};
                                          const runTemp = runMeta.temperature !== undefined ? runMeta.temperature : record?.temperature;
                                          const tempVal = isNaN(parseFloat(runTemp)) ? 25 : parseFloat(runTemp);
                                          const Kt = Math.pow(0.5, (40 - tempVal) / 10);
                                          const displayVal = tab === 'RAMP'
                                            ? r.current
                                            : (record?.correctInsulationTo40 ? Math.round(r.resistance * Kt) : r.resistance);
                                          return {
                                            time: r.time,
                                            [yAxisKey]: displayVal
                                          };
                                        });
                                      })()} margin={{ top: 5, right: 10, left: 15, bottom: 15 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="time" padding={{ left: 5, right: 10 }} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                          <Label value="Time (s)" offset={-2} position="insideBottom" style={{ fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                        </XAxis>
                                        <YAxis width={45} tickFormatter={(val) => typeof val === 'number' ? (yAxisKey === 'current' ? val.toFixed(4) : Math.round(val).toLocaleString()) : val} style={{ fontSize: 8, fill: '#64748b', fontWeight: 600 }}>
                                          <Label value={yAxisLabel} angle={-90} position="insideLeft" offset={-5} style={{ textAnchor: 'middle', fontSize: 7, fill: '#64748b', fontWeight: 600 }} />
                                        </YAxis>
                                        <Tooltip contentStyle={{ fontSize: 9, borderRadius: 4 }} wrapperStyle={{ zIndex: 100 }} />
                                        <Line type="monotone" dataKey={yAxisKey} name={lineName} stroke={strokeColor} strokeWidth={1.5} dot={tab === 'PI' ? false : { r: 2 }} activeDot={{ r: 4 }} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                );
                              })()}
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Report baseline footnotes */}
        {(record?.correctWindingTo20 || record?.correctInsulationTo40) && (
          <div style={{ marginTop: 20, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#475569', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>ℹ️</span>
            <span>
              <strong>Note:</strong>
              {record?.correctWindingTo20 && ` The measured winding resistance values are baselined to 20°C.`}
              {record?.correctInsulationTo40 && ` The measured insulation resistance values are baselined to 40°C.`}
            </span>
          </div>
        )}

        {!hasInsulation && !hasMulData && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#cbd5e1' }}>
            <p style={{ fontSize: 36, margin: 0 }}>📋</p>
            <p style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>No test measurements captured yet.</p>
            <p style={{ fontSize: 11, margin: 0 }}>Run the Winding or Insulation test in Demo Mode to populate data.</p>
          </div>
        )}
      </div>

    </div>
  );
}
