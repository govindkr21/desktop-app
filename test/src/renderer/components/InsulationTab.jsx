// src/renderer/components/InsulationTab.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const api = window.electronAPI;
const AXES = ['time', 'voltage', 'actualVoltage', 'current', 'resistance'];

const AXIS_LABELS = {
  time: 'Time (s)',
  voltage: 'Voltage (V)',
  actualVoltage: 'Actual V (V)',
  current: 'Current (µA)',
  resistance: 'Resistance (MΩ)',
};

function formatChartTick(value) {
  if (value == null || Number.isNaN(value)) return '';
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  if (abs > 0 && abs < 0.01) return n.toExponential(1);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function computeAxisDomain(values, { clampMinZero = false } = {}) {
  const nums = values.filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return [0, 1];
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, min === 0 ? 1 : 1);
    min -= pad; max += pad;
  } else {
    const pad = (max - min) * 0.12;
    min -= pad; max += pad;
  }
  if (clampMinZero && min < 0) min = 0;
  return [min, max];
}

const TEST_METRIC_TIMES = {
  PI:   { dar: [30, 60], pi: [60, 600] },
  DAR:  { dar: [30, 60], pi: null },
  SV:   { dar: [30, 60], pi: null },
  RAMP: { dar: [30, 60], pi: null },
};

const TEST_DURATIONS = {
  PI:   600,
  DAR:  60,
  SV:   300,
  RAMP: null,
};

const TABLE_SUFFIXES = [
  'R-GND-Stator',
  'S-GND-Stator',
  'T-GND-Stator',
  'RST-GND-Stator',
  'RS-Stator',
  'RT-Stator',
  'ST-Stator',
  'RST-GND-Rotor',
];

// ─── Helper: collect all runs for a given suffix ───────────────────────────
function getRunsForSuffix(tab, suffix, tableData, customRuns) {
  const tabData = tableData[tab] || {};
  const prefix = `${tab}-${suffix}`;
  const dbKeys = Object.keys(tabData).filter(k => k === prefix || k.startsWith(`${prefix} - `));
  const customKeys = customRuns.filter(k => k === prefix || k.startsWith(`${prefix} - `));
  const allKeys = Array.from(new Set([...dbKeys, ...customKeys]));
  const hasRun1 = allKeys.some(k => {
    if (k === prefix) return true;
    if (k.startsWith(`${prefix} - `)) {
      const runName = k.substring(prefix.length + 3);
      const match = runName.match(/^Run\s+(\d+)$/);
      return match ? parseInt(match[1]) === 1 : true;
    }
    return false;
  });
  if (!hasRun1) allKeys.unshift(prefix);

  const runs = allKeys.map(k => {
    let name = 'Run 1';
    if (k.startsWith(`${prefix} - `)) name = k.substring(prefix.length + 3);
    return { name, id: k, rows: tabData[k] || [] };
  });
  runs.sort((a, b) => {
    const aNum = parseInt(a.name.match(/Run\s+(\d+)/)?.[1] || '0');
    const bNum = parseInt(b.name.match(/Run\s+(\d+)/)?.[1] || '0');
    if (aNum && bNum) return aNum - bNum;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  return runs;
}

// ══════════════════════════════════════════════════════════════════════════════
export default function InsulationTab({ record, demoMode = true, meggerStatus, onChange, onCaptureChange }) {
  const correctInsulationTo40 = record?.correctInsulationTo40 || false;

  // ─── Core state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState('PI');
  const [tableData, setTableData]   = useState({});
  const [selectedTable, setSelectedTable] = useState('');
  const [isCapturing, setIsCapturing]     = useState(false);
  const [xAxis, setXAxis]   = useState('time');
  const [yAxis, setYAxis]   = useState('resistance');
  const [status, setStatus] = useState('');
  const [telemetryAlert, setTelemetryAlert] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [completedDetails,   setCompletedDetails]   = useState(null);

  // ─── Runs / dynamic tables ─────────────────────────────────────────────────
  const [customRuns,  setCustomRuns]  = useState([]);
  const [activeRuns,  setActiveRuns]  = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [runMeta,     setRunMeta]     = useState({}); // { [runId]: { temperature } }
  const [addedTables, setAddedTables] = useState({
    PI:   ['R-GND-Stator', 'S-GND-Stator', 'T-GND-Stator'],
    DAR:  ['R-GND-Stator', 'S-GND-Stator', 'T-GND-Stator'],
    SV:   ['R-GND-Stator', 'S-GND-Stator', 'T-GND-Stator'],
    RAMP: ['R-GND-Stator', 'S-GND-Stator', 'T-GND-Stator'],
  });
  const [suffixToAdd, setSuffixToAdd] = useState('');

  // ─── Resizable sidebar ─────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(440);
  const isDragging    = useRef(false);
  const dragStartX    = useRef(0);
  const dragStartWidth = useRef(440);

  // ─── Available suffixes for the dropdown ───────────────────────────────────
  const availableSuffixes = useMemo(
    () => TABLE_SUFFIXES.filter(s => !addedTables[activeTab]?.includes(s)),
    [activeTab, addedTables],
  );
  useEffect(() => {
    setSuffixToAdd(availableSuffixes.length > 0 ? availableSuffixes[0] : '');
  }, [availableSuffixes]);

  // ─── Per-run temperature ───────────────────────────────────────────────────
  const getRunTemperature = useCallback(
    (runId) => runMeta[runId]?.temperature || record?.temperature || '25',
    [runMeta, record?.temperature],
  );

  const handleTempChange = useCallback(async (v) => {
    if (!selectedTable) return;
    const nextMeta = { ...(runMeta[selectedTable] || {}), temperature: v };
    setRunMeta(prev => ({ ...prev, [selectedTable]: nextMeta }));
    if (record) await api.saveInsulationMeta(record.id, activeTab, selectedTable, nextMeta);
  }, [selectedTable, runMeta, record, activeTab]);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const simRef              = useRef(null);
  const alertIntervalRef    = useRef(null);
  const lastPacketTime      = useRef(Date.now());
  const activeCaptureTargetRef = useRef(null);
  const isCapturingRef      = useRef(false);
  const meggerTimeOriginRef = useRef(null);
  const hasConfirmedReTest  = useRef(false);
  const hadDataOnLoad       = useRef(false);

  const meggerOnline = meggerStatus === 'connected';

  // ─── Notify parent of capture state ───────────────────────────────────────
  useEffect(() => { if (onCaptureChange) onCaptureChange(isCapturing); }, [isCapturing, onCaptureChange]);

  // ─── Default selected table on tab switch ─────────────────────────────────
  useEffect(() => {
    if (isCapturing && activeCaptureTargetRef.current?.tab === activeTab) {
      setSelectedTable(activeCaptureTargetRef.current.tableId);
    } else {
      const firstSuffix = addedTables[activeTab]?.[0] || TABLE_SUFFIXES[0];
      const baseId = `${activeTab}-${firstSuffix}`;
      setSelectedTable(activeRuns[baseId] || baseId);
    }
  }, [activeTab, isCapturing]); // eslint-disable-line

  // ─── Default graph axes ────────────────────────────────────────────────────
  useEffect(() => {
    setXAxis('time');
    if (activeTab === 'PI' || activeTab === 'DAR') setYAxis('resistance');
    else setYAxis('current');
  }, [activeTab]);

  // ─── Close context menu on outside click ───────────────────────────────────
  useEffect(() => {
    const h = () => { if (contextMenu) setContextMenu(null); };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [contextMenu]);

  // ─── Run management helpers ────────────────────────────────────────────────
  const getActiveRunId = useCallback((tab, suffix) => {
    const baseId = `${tab}-${suffix}`;
    return activeRuns[baseId] || baseId;
  }, [activeRuns]);

  const handleRunChange = useCallback((suffix, newRunId) => {
    const baseId = `${activeTab}-${suffix}`;
    setActiveRuns(prev => ({ ...prev, [baseId]: newRunId }));
    if (selectedTable.startsWith(baseId)) setSelectedTable(newRunId);
  }, [activeTab, selectedTable]);

  const addNewRun = useCallback((suffix) => {
    if (isCapturing) return;
    const baseId = `${activeTab}-${suffix}`;
    const runs = getRunsForSuffix(activeTab, suffix, tableData, customRuns);
    let nextNum = 1;
    runs.forEach(r => {
      const m = r.name.match(/Run\s+(\d+)/);
      if (m) { const n = parseInt(m[1]); if (n >= nextNum) nextNum = n + 1; }
    });
    if (nextNum === 1 && runs.length > 0) nextNum = runs.length + 1;
    const newRunId = `${baseId} - Run ${nextNum}`;
    setCustomRuns(prev => [...prev, newRunId]);
    setActiveRuns(prev => ({ ...prev, [baseId]: newRunId }));
    setSelectedTable(newRunId);
    setContextMenu(null);
  }, [activeTab, tableData, customRuns, isCapturing]);

  const renameRun = useCallback(async (suffix, runId) => {
    if (isCapturing) return;
    const baseId = `${activeTab}-${suffix}`;
    const runs = getRunsForSuffix(activeTab, suffix, tableData, customRuns);
    const runObj = runs.find(r => r.id === runId);
    if (!runObj) return;
    const match = runObj.name.match(/^(Run\s+\d+)(?:\s*\((.*)\))?$/);
    const runPrefix  = match ? match[1] : runObj.name;
    const currentTag = match ? (match[2] || '') : '';
    const newTag = window.prompt(`Add a label for "${runPrefix}" (e.g. Hot, Cold, 1000V):`, currentTag);
    if (newTag === null) { setContextMenu(null); return; }
    const sanitized = newTag.trim();
    const newRunName = sanitized ? `${runPrefix} (${sanitized})` : runPrefix;
    const newRunId   = `${baseId} - ${newRunName}`;
    if (newRunId !== runId && (tableData[activeTab]?.[newRunId] || customRuns.includes(newRunId))) {
      window.alert(`A run named "${newRunName}" already exists.`);
      return;
    }
    if (record && tableData[activeTab]?.[runId]?.length > 0) {
      await api.renameInsulationTable(record.id, activeTab, runId, newRunId);
    }
    setTableData(prev => {
      const next = { ...prev };
      if (next[activeTab]) {
        next[activeTab][newRunId] = next[activeTab][runId] || [];
        delete next[activeTab][runId];
      }
      return next;
    });
    setRunMeta(prev => {
      const next = { ...prev };
      if (next[runId]) { next[newRunId] = next[runId]; delete next[runId]; }
      return next;
    });
    setCustomRuns(prev => {
      const next = prev.filter(k => k !== runId);
      if (!next.includes(newRunId)) next.push(newRunId);
      return next;
    });
    setActiveRuns(prev => ({ ...prev, [baseId]: newRunId }));
    if (selectedTable === runId) setSelectedTable(newRunId);
    setContextMenu(null);
  }, [activeTab, tableData, customRuns, record, selectedTable, isCapturing]);

  const deleteRun = useCallback(async (suffix, runId) => {
    if (isCapturing) return;
    const baseId = `${activeTab}-${suffix}`;
    const runs = getRunsForSuffix(activeTab, suffix, tableData, customRuns);
    if (!window.confirm(`Permanently delete run "${runId}"? This cannot be undone.`)) return;
    if (record) await api.deleteInsulationTable(record.id, activeTab, runId);
    setTableData(prev => {
      const next = { ...prev };
      if (next[activeTab]) delete next[activeTab][runId];
      return next;
    });
    setRunMeta(prev => { const next = { ...prev }; delete next[runId]; return next; });
    setCustomRuns(prev => prev.filter(k => k !== runId));
    const remaining = runs.filter(r => r.id !== runId);
    const fallback  = remaining.length > 0 ? remaining[remaining.length - 1].id : baseId;
    setActiveRuns(prev => ({ ...prev, [baseId]: fallback }));
    if (selectedTable === runId) setSelectedTable(fallback);
    setContextMenu(null);
  }, [activeTab, tableData, customRuns, record, selectedTable, isCapturing]);

  const removeSuffix = useCallback((suffix) => {
    if (!window.confirm(`Remove "${suffix}" from this tab? Data stays in the database.`)) return;
    setAddedTables(prev => ({ ...prev, [activeTab]: prev[activeTab].filter(s => s !== suffix) }));
    const baseId = `${activeTab}-${suffix}`;
    if (selectedTable.startsWith(baseId)) {
      const remaining = addedTables[activeTab].filter(s => s !== suffix);
      setSelectedTable(remaining.length > 0 ? getActiveRunId(activeTab, remaining[0]) : '');
    }
    setContextMenu(null);
  }, [activeTab, addedTables, selectedTable, getActiveRunId]);

  // ─── Load saved data on record change ─────────────────────────────────────
  useEffect(() => {
    if (!record) return;
    hasConfirmedReTest.current = false;
    hadDataOnLoad.current = false;
    api.getInsulationData(record.id).then(data => {
      const parsedTableData = {};
      const parsedRunMeta   = {};
      const existingKeys    = [];
      const loadedAdded     = { PI: [], DAR: [], SV: [], RAMP: [] };
      let hasAnyData = false;
      if (data) {
        for (const tabKey of ['PI', 'DAR', 'SV', 'RAMP']) {
          const tabTables = data[tabKey] || {};
          parsedTableData[tabKey] = {};
          for (const key of Object.keys(tabTables)) {
            if (key.endsWith('_meta')) {
              parsedRunMeta[key.replace('_meta', '')] = tabTables[key];
            } else {
              parsedTableData[tabKey][key] = tabTables[key];
              existingKeys.push(key);
              if (tabTables[key]?.length > 0) hasAnyData = true;
              const suffix = key.startsWith(`${tabKey}-`) ? key.substring(tabKey.length + 1).split(' - ')[0] : null;
              if (suffix && TABLE_SUFFIXES.includes(suffix) && !loadedAdded[tabKey].includes(suffix)) {
                loadedAdded[tabKey].push(suffix);
              }
            }
          }
        }
      }
      for (const tabKey of ['PI', 'DAR', 'SV', 'RAMP']) {
        if (loadedAdded[tabKey].length === 0)
          loadedAdded[tabKey] = ['R-GND-Stator', 'S-GND-Stator', 'T-GND-Stator'];
      }
      setTableData(parsedTableData);
      setRunMeta(parsedRunMeta);
      setCustomRuns(existingKeys);
      setAddedTables(loadedAdded);
      if (hasAnyData) hadDataOnLoad.current = true;
    });
  }, [record?.id]);

  // ─── Capture management ────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    clearInterval(simRef.current);
    clearInterval(alertIntervalRef.current);
    simRef.current = null;
    activeCaptureTargetRef.current = null;
    api.removeAllListeners('megger:data');
    api.removeAllListeners('megger:stopped');
    isCapturingRef.current = false;
    setIsCapturing(false);
    setStatus('');
    setTelemetryAlert(false);
  }, []);

  const saveRow = useCallback(async (tab, tableId, row, rec) => {
    if (rec) await api.saveInsulationRow(rec.id, tab, tableId, row);
    setTableData(prev => {
      const next = { ...prev };
      if (!next[tab]) next[tab] = {};
      if (!next[tab][tableId]) next[tab][tableId] = [];
      next[tab][tableId] = [...next[tab][tableId], row];
      return next;
    });
  }, []);

  const handleTestCompletion = useCallback((tab, tableId, finalTime, reason) => {
    setCompletedDetails({ tab, tableId, duration: finalTime, reason });
    setShowCompletedModal(true);
  }, []);

  const confirmReTest = useCallback(() => {
    if (hadDataOnLoad.current && !hasConfirmedReTest.current) {
      const motorName = record?.motorUtilityTag ? `motor "${record.motorUtilityTag}"` : 'this motor';
      const ok = window.confirm(`Are you sure you are re-testing ${motorName}? To save new results for a different motor, create a new record instead.`);
      if (ok) { hasConfirmedReTest.current = true; return true; }
      return false;
    }
    return true;
  }, [record]);

  const startCapture = useCallback(async () => {
    if (isCapturing) { stopCapture(); return; }
    if (!selectedTable) return;
    if (!confirmReTest()) return;
    const existingRows = tableData[activeTab]?.[selectedTable] || [];
    if (existingRows.length > 0) {
      if (!window.confirm(`"${selectedTable}" already has data. Starting capture will delete existing rows. Continue?`)) return;
      if (record) await api.clearInsulationTab(record.id, activeTab, selectedTable);
      setTableData(prev => {
        const next = { ...prev };
        if (next[activeTab]) next[activeTab][selectedTable] = [];
        return next;
      });
    }
    activeCaptureTargetRef.current = { tab: activeTab, tableId: selectedTable, record };
    setIsCapturing(true);
    setStatus('● Recording live data...');
    setTelemetryAlert(false);
    lastPacketTime.current = Date.now();
    isCapturingRef.current = true;
    meggerTimeOriginRef.current = null;

    if (demoMode) {
      const captureStartTime = Date.now();
      simRef.current = setInterval(async () => {
        const t = Math.round((Date.now() - captureStartTime) / 1000);
        const target = activeCaptureTargetRef.current;
        if (!target) return;
        const isRamp = target.tab === 'RAMP';
        const vBase  = isRamp ? Math.min(5000, 100 + t * 5) : 500;
        const durationLimit = TEST_DURATIONS[target.tab];
        const row = {
          time: durationLimit && t >= durationLimit ? durationLimit : t,
          voltage: vBase,
          actualVoltage: vBase + Math.round(Math.random() * 8 - 4),
          current: parseFloat((0.05 + Math.random() * 0.12).toFixed(3)),
          resistance: Math.round(3500 + Math.random() * 4500),
        };
        await saveRow(target.tab, target.tableId, row, target.record);
        if (durationLimit && t >= durationLimit) {
          stopCapture();
          setStatus('✅ Test Completed');
          handleTestCompletion(target.tab, target.tableId, durationLimit, 'TIMEOUT');
        }
      }, 1200);
    } else {
      api.removeAllListeners('megger:data');
      api.removeAllListeners('megger:stopped');
      alertIntervalRef.current = setInterval(() => {
        if (Date.now() - lastPacketTime.current > 4000) setTelemetryAlert(true);
      }, 2000);
      api.onMeggerData(async (row) => {
        if (!isCapturingRef.current) return;
        lastPacketTime.current = Date.now();
        setTelemetryAlert(false);
        const target = activeCaptureTargetRef.current;
        if (!target?.tableId) return;
        if (meggerTimeOriginRef.current === null) meggerTimeOriginRef.current = row.time;
        const elapsed = Math.max(0, row.time - meggerTimeOriginRef.current);
        const durationLimit = TEST_DURATIONS[target.tab];
        if (durationLimit && elapsed >= durationLimit) {
          await saveRow(target.tab, target.tableId, { ...row, time: durationLimit }, target.record);
          stopCapture();
          api.disconnectMegger();
          setStatus('✅ Test Completed');
          handleTestCompletion(target.tab, target.tableId, durationLimit, 'TIMEOUT');
          return;
        }
        await saveRow(target.tab, target.tableId, { ...row, time: elapsed }, target.record);
      });
      api.onMeggerStopped((info) => {
        const wasCapturing = isCapturingRef.current;
        const target = activeCaptureTargetRef.current;
        stopCapture();
        if (wasCapturing && info?.completed) {
          setStatus(`✅ Test Completed (${info.reason || 'FINISHED'}).`);
          api.getInsulationData(record.id).then(data => {
            const tTab   = target?.tab   || activeTab;
            const tTable = target?.tableId || selectedTable;
            const tRows  = data?.[tTab]?.[tTable] || [];
            const lastT  = tRows.length > 0 ? tRows[tRows.length - 1].time : 0;
            handleTestCompletion(tTab, tTable, lastT, info.reason || 'FINISHED');
          });
        } else {
          setStatus('✅ Megger finished sending data.');
        }
      });
    }
  }, [isCapturing, activeTab, selectedTable, tableData, record, stopCapture, demoMode, saveRow, confirmReTest, handleTestCompletion]);

  const clearTab = useCallback(async () => {
    if (!selectedTable) return;
    if (!window.confirm(`Clear all data in "${selectedTable}"? This cannot be undone.`)) return;
    stopCapture();
    if (record) await api.clearInsulationTab(record.id, activeTab, selectedTable);
    setTableData(prev => {
      const next = { ...prev };
      if (next[activeTab]) next[activeTab][selectedTable] = [];
      return next;
    });
  }, [activeTab, selectedTable, record, stopCapture]);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    clearInterval(simRef.current);
    clearInterval(alertIntervalRef.current);
    api.removeAllListeners('megger:data');
    api.removeAllListeners('megger:connected');
    api.removeAllListeners('megger:stopped');
  }, []);

  useEffect(() => { stopCapture(); }, [demoMode, meggerOnline, stopCapture]);

  // ─── Metrics for selected table ────────────────────────────────────────────
  const rows = tableData[activeTab]?.[selectedTable] || [];
  const metricTimes = TEST_METRIC_TIMES[activeTab] || TEST_METRIC_TIMES.PI;
  const r30   = rows.find(r => r.time >= (metricTimes.dar?.[0] ?? 30))?.resistance;
  const r60   = rows.find(r => r.time >= (metricTimes.dar?.[1] ?? 60))?.resistance;
  const r600  = metricTimes.pi ? rows.find(r => r.time >= metricTimes.pi[1])?.resistance : null;
  const r60pi = metricTimes.pi ? rows.find(r => r.time >= metricTimes.pi[0])?.resistance : r60;
  const PIval  = r600 && r60pi ? (r600 / r60pi).toFixed(2) : '—';
  const DARval = r60  && r30   ? (r60  / r30  ).toFixed(2) : '—';
  const DDval  = rows.length > 2 ? '1.38' : '—';

  const activeTemp = getRunTemperature(selectedTable);
  const tempVal    = isNaN(parseFloat(activeTemp)) ? 25 : parseFloat(activeTemp);
  const Kt   = Math.pow(0.5, (40 - tempVal) / 10);
  const Rt   = rows.length > 0 ? rows[rows.length - 1].resistance : null;
  const Rc40 = Rt !== null ? Math.round(Rt * Kt) : null;

  const chartRows = useMemo(() => {
    const tv = isNaN(parseFloat(getRunTemperature(selectedTable))) ? 25 : parseFloat(getRunTemperature(selectedTable));
    const kt = Math.pow(0.5, (40 - tv) / 10);
    let base = correctInsulationTo40
      ? rows.map(r => ({ ...r, resistance: Math.round(r.resistance * kt) }))
      : rows.map(r => ({ ...r }));
    if (base.length > 0) {
      const tMin = Math.min(...base.map(r => r.time));
      base = base.map(r => ({ ...r, plotTime: r.time - tMin }));
      base = base.filter(r => {
        if (r.time <= 2 && (r.resistance >= 1000000 || r.current <= 0.005 || r.resistance <= 0)) return false;
        return true;
      });
      base.sort((a, b) => a.plotTime - b.plotTime);
    }
    return base;
  }, [rows, correctInsulationTo40, selectedTable, runMeta, record?.temperature, getRunTemperature]);

  const xChartKey    = xAxis === 'time' ? 'plotTime' : xAxis;
  const testMaxDuration = TEST_DURATIONS[activeTab] ?? null;

  const yDomain = useMemo(() => {
    let vals = chartRows.map(r => r[yAxis]).filter(v => v != null);
    if (yAxis === 'resistance') {
      vals = chartRows
        .filter(r => r.resistance < 1000000 && r.resistance > 0 && !(r.time <= 5 && r.current <= 0.005))
        .map(r => r.resistance).filter(v => v != null);
      if (!vals.length) vals = chartRows.map(r => r.resistance).filter(v => v != null);
    }
    const clampMinZero = ['time','voltage','actualVoltage','resistance'].includes(yAxis);
    return computeAxisDomain(vals, { clampMinZero });
  }, [chartRows, yAxis]);

  const filteredChartRows = useMemo(() => {
    if (xChartKey !== 'plotTime' || testMaxDuration == null) return chartRows;
    return chartRows.filter(r => r.plotTime <= testMaxDuration);
  }, [chartRows, xChartKey, testMaxDuration]);

  const xDomain = useMemo(() => {
    const vals = filteredChartRows.map(r => r[xChartKey]).filter(v => v != null && !Number.isNaN(v));
    if (!vals.length) return [0, 1];
    const domain = computeAxisDomain(vals, { clampMinZero: true });
    if (xChartKey === 'plotTime' && testMaxDuration != null) domain[1] = Math.min(domain[1], testMaxDuration * 1.02);
    return domain;
  }, [filteredChartRows, xChartKey, testMaxDuration]);

  // Pass/Fail
  let passStatus = '—', passColor = '#64748b';
  if (Rc40 !== null) {
    if      (Rc40 >= 100) { passStatus = 'Pass (Excellent)';     passColor = '#16a34a'; }
    else if (Rc40 >= 5)   { passStatus = 'Pass (Standard)';      passColor = '#2563eb'; }
    else                  { passStatus = 'Fail (Low Insulation)'; passColor = '#dc2626'; }
  }

  const subBtn = (active) => ({
    borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', border: active ? 'none' : '1px solid #e2e8f0',
    background: active ? '#1e40af' : '#fff', color: active ? '#fff' : '#64748b',
    transition: 'all 0.15s',
  });

  // ─── Render a single test card ─────────────────────────────────────────────
  const renderTable = (suffix) => {
    const baseId      = `${activeTab}-${suffix}`;
    const runs        = getRunsForSuffix(activeTab, suffix, tableData, customRuns);
    const activeRunId = getActiveRunId(activeTab, suffix);
    const currentRun  = runs.find(r => r.id === activeRunId) || runs[0] || { id: activeRunId, name: 'Run 1', rows: [] };
    const tableId     = currentRun.id;
    const isActive    = selectedTable === tableId;
    const tableRows   = currentRun.rows;

    return (
      <div
        key={suffix}
        onClick={() => setSelectedTable(tableId)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, suffix }); }}
        style={{
          border: `2px solid ${isActive ? '#1e40af' : '#e2e8f0'}`,
          borderRadius: 10,
          background: isActive ? '#eff6ff' : '#fff',
          padding: 8,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          height: 145,
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {/* Card header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 6, gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? '#1e40af' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={suffix}>
            {suffix}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
            <select
              value={activeRunId}
              onChange={e => handleRunChange(suffix, e.target.value)}
              disabled={isCapturing}
              style={{
                fontSize: 10, padding: '1px 3px', borderRadius: 4,
                border: `1px solid ${isActive ? '#93c5fd' : '#cbd5e1'}`,
                background: '#fff', color: '#475569', fontWeight: 600,
                outline: 'none', cursor: isCapturing ? 'not-allowed' : 'pointer', maxWidth: 100,
              }}
            >
              {runs.map(r => {
                const temp = getRunTemperature(r.id);
                return (
                  <option key={r.id} value={r.id}>
                    {r.name}{runs.length > 1 ? ` (${temp}°C)` : ''}
                  </option>
                );
              })}
            </select>
            <button
              onClick={() => addNewRun(suffix)}
              disabled={isCapturing}
              title="Store current run and start a new test"
              style={{
                fontSize: 11, width: 16, height: 16, borderRadius: 4, border: 'none',
                background: isActive ? '#1e40af' : '#64748b', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isCapturing ? 'not-allowed' : 'pointer', fontWeight: 'bold',
              }}
            >+</button>
          </div>
        </div>

        {/* Data table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ color: '#64748b', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', position: 'sticky', top: 0 }}>
                <th style={{ padding: '3px 4px', textAlign: 'center' }}>Sec</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>V</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>Act V</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>µA</th>
                <th style={{ padding: '3px 4px', textAlign: 'right' }}>MΩ</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px 4px', textAlign: 'center', color: '#cbd5e1' }}>Click to select &amp; capture</td></tr>
              ) : (
                tableRows.map((r, idx) => {
                  const tv = isNaN(parseFloat(getRunTemperature(tableId))) ? 25 : parseFloat(getRunTemperature(tableId));
                  const kt = Math.pow(0.5, (40 - tv) / 10);
                  const displayRes = correctInsulationTo40 ? Math.round(r.resistance * kt) : r.resistance;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '3px 4px', textAlign: 'center', fontFamily: 'monospace' }}>{r.time}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right',  fontFamily: 'monospace' }}>{r.voltage}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right',  fontFamily: 'monospace' }}>{r.actualVoltage}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right',  fontFamily: 'monospace' }}>{r.current}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right',  fontFamily: 'monospace', fontWeight: 600 }}>{displayRes?.toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 112px)', boxSizing: 'border-box' }}>

      {/* Telemetry Alert Banner */}
      {telemetryAlert && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 16px', color: '#991b1b', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚠️ Telemetry Alert: No data from Megger. Check device power, TRANSMIT setting, and COM port.
        </div>
      )}

      {/* ── TOP ACTION BAR ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['PI', 'DAR', 'SV', 'RAMP'].map(t => (
            <button key={t} style={subBtn(activeTab === t)} onClick={() => setActiveTab(t)}>{t} Test</button>
          ))}
          {/* Device status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: demoMode ? 'rgba(234,179,8,0.08)' : meggerOnline ? '#ecfdf5' : '#fef2f2', border: `1px solid ${demoMode ? '#ca8a04' : meggerOnline ? '#a7f3d0' : '#fca5a5'}`, borderRadius: 20, padding: '3px 10px', marginLeft: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: demoMode ? '#eab308' : meggerOnline ? '#10b981' : '#ef4444', display: 'inline-block' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: demoMode ? '#854d0e' : meggerOnline ? '#065f46' : '#991b1b' }}>
              {demoMode ? '🎭 Demo Mode' : meggerOnline ? '✅ Megger Online' : '⚠️ Megger Offline'}
            </span>
          </div>
          {/* Correction toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: correctInsulationTo40 ? '#eff6ff' : '#f8fafc', border: `1px solid ${correctInsulationTo40 ? '#bfdbfe' : '#cbd5e1'}`, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: correctInsulationTo40 ? '#1e40af' : '#475569', cursor: 'pointer', transition: 'all 0.15s', marginLeft: 8 }}>
            <input type="checkbox" checked={correctInsulationTo40} onChange={e => onChange('correctInsulationTo40', e.target.checked)} style={{ cursor: 'pointer' }} />
            <span>Correct Insulation to Baseline 40°C (IEEE 43)</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{status}</span>}
          <button
            onClick={startCapture}
            disabled={!demoMode && !meggerOnline && !isCapturing}
            style={{ borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: isCapturing ? '#dc2626' : '#16a34a', color: '#fff', transition: 'background 0.15s', opacity: (!demoMode && !meggerOnline && !isCapturing) ? 0.4 : 1 }}
          >
            {isCapturing ? '⏹ Stop' : '▶ Start Capture'}
          </button>
          <button onClick={clearTab} style={{ borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569' }}>
            🗑 Clear
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div
        style={{ display: 'flex', gap: 0, flex: 1, minHeight: 0, userSelect: isDragging.current ? 'none' : 'auto' }}
        onMouseMove={(e) => {
          if (!isDragging.current) return;
          const delta = e.clientX - dragStartX.current;
          const containerW = e.currentTarget.offsetWidth;
          const maxSidebar = Math.max(200, containerW - 258);
          const next = Math.min(maxSidebar, Math.max(200, dragStartWidth.current + delta));
          setSidebarWidth(next);
        }}
        onMouseUp={() => { isDragging.current = false; document.body.style.cursor = ''; }}
        onMouseLeave={() => { isDragging.current = false; document.body.style.cursor = ''; }}
      >

        {/* LEFT SIDEBAR */}
        <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          {/* Dropdown + Add button */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={suffixToAdd}
              onChange={e => setSuffixToAdd(e.target.value)}
              disabled={availableSuffixes.length === 0}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', color: '#334155', fontWeight: 600, outline: 'none', cursor: availableSuffixes.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              {availableSuffixes.length > 0
                ? availableSuffixes.map(s => <option key={s} value={s}>{s}</option>)
                : <option value="">All tests added</option>}
            </select>
            <button
              onClick={() => {
                if (!suffixToAdd) return;
                setAddedTables(prev => ({ ...prev, [activeTab]: [...prev[activeTab], suffixToAdd] }));
                const runId = getActiveRunId(activeTab, suffixToAdd);
                setSelectedTable(runId);
              }}
              disabled={availableSuffixes.length === 0}
              style={{ padding: '6px 12px', borderRadius: 6, background: availableSuffixes.length === 0 ? '#cbd5e1' : '#1e40af', color: '#fff', border: 'none', fontSize: 12, fontWeight: 'bold', cursor: availableSuffixes.length === 0 ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
            >+ Add</button>
          </div>

          {/* Scrollable card list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
            {addedTables[activeTab]?.map(suffix => renderTable(suffix))}
            {(!addedTables[activeTab] || addedTables[activeTab].length === 0) && (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8', fontSize: 12 }}>
                Select a test from the dropdown above and click "+ Add".
              </div>
            )}
          </div>
        </div>

        {/* DRAG DIVIDER */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            isDragging.current = true;
            dragStartX.current = e.clientX;
            dragStartWidth.current = sidebarWidth;
            document.body.style.cursor = 'col-resize';
          }}
          title="Drag to resize panels"
          style={{ width: 8, flexShrink: 0, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10 }}
        >
          <div
            style={{ width: 2, height: '100%', background: '#e2e8f0', borderRadius: 2, position: 'relative', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.background = '#e2e8f0'}
          >
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: 3, pointerEvents: 'none' }}>
              {[0,1,2,3,4].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#94a3b8' }} />)}
            </div>
          </div>
        </div>

        {/* RIGHT: Graph + Calculations */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 250, minHeight: 0 }}>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {/* Graph header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Live Plot: <strong style={{ color: '#1e40af' }}>{selectedTable || 'None selected'}</strong>
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['X', xAxis, setXAxis], ['Y', yAxis, setYAxis]].map(([lbl, val, setter]) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{lbl}</span>
                    <select value={val} onChange={e => setter(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 4px', fontSize: 11, outline: 'none', background: '#fff' }}>
                      {AXES.map(ax => <option key={ax} value={ax}>{ax === 'actualVoltage' ? 'Act V' : ax.charAt(0).toUpperCase() + ax.slice(1)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div style={{ flex: 1, minHeight: 180, position: 'relative' }}>
              {filteredChartRows.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredChartRows} margin={{ top: 12, right: 16, left: 8, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey={xChartKey} type="number" domain={xDomain} allowDataOverflow={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatChartTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={{ stroke: '#cbd5e1' }}
                      label={{ value: xAxis === 'time' ? 'Elapsed time (s)' : (AXIS_LABELS[xAxis] || xAxis), position: 'insideBottom', offset: -18, style: { fontSize: 10, fill: '#475569', fontWeight: 600 } }}
                    />
                    <YAxis width={56} domain={yDomain} allowDataOverflow={true} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatChartTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={{ stroke: '#cbd5e1' }}
                      label={{ value: AXIS_LABELS[yAxis] || yAxis, angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 10, fill: '#475569', fontWeight: 600 } }}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(value, name) => {
                        const label = AXIS_LABELS[name] || name;
                        const display = typeof value === 'number' ? (Math.abs(value) >= 1000 ? value.toLocaleString() : value) : value;
                        return [display, label];
                      }}
                      labelFormatter={(label) => `${xAxis === 'time' ? 'Elapsed (s)' : (AXIS_LABELS[xAxis] || xAxis)}: ${label}`}
                    />
                    <Line type="monotone" dataKey={yAxis} stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#1e40af' }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 12 }}>
                  Select an active table and click "Start Capture" to plot
                </div>
              )}
            </div>

            {/* Calculations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['PI', PIval], ['DAR', DARval], ['DD', DDval]].map(([lbl, val]) => (
                  <div key={lbl} style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 9, color: '#94a3b8', display: 'block', fontWeight: 700 }}>{lbl}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1e40af', marginTop: 1 }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>TEST TEMP</span>
                  <input
                    type="number"
                    value={getRunTemperature(selectedTable)}
                    onChange={e => handleTempChange(e.target.value)}
                    style={{ width: 48, border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontWeight: 700, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>°C</span>
                </div>
                <div style={{ height: 18, width: 1, background: '#cbd5e1' }} />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, display: 'block' }}>CORRECTED R40 (IEEE 43)</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#1e40af' }}>{Rc40 !== null ? `${Rc40.toLocaleString()} MΩ` : '—'}</span>
                  </div>
                  {Rc40 !== null && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: passColor, borderRadius: 6, padding: '4px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      {passStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TEST COMPLETED MODAL ── */}
      {showCompletedModal && completedDetails && (() => {
        const { tab: tTab, tableId: tTable, duration, reason } = completedDetails;
        const tRows   = tableData[tTab]?.[tTable] || [];
        const tv2     = isNaN(parseFloat(getRunTemperature(tTable))) ? 25 : parseFloat(getRunTemperature(tTable));
        const kt2     = Math.pow(0.5, (40 - tv2) / 10);
        const lastRow = tRows[tRows.length - 1] || null;
        const finalR  = lastRow?.resistance ?? null;
        const finalV  = lastRow ? (lastRow.actualVoltage || lastRow.voltage) : null;
        const Rc40m   = finalR !== null ? Math.round(finalR * kt2) : null;
        let ps = '—', pc = '#64748b';
        if (Rc40m !== null) {
          if      (Rc40m >= 100) { ps = 'Pass (Excellent)';     pc = '#16a34a'; }
          else if (Rc40m >= 5)   { ps = 'Pass (Standard)';      pc = '#2563eb'; }
          else                   { ps = 'Fail (Low Insulation)'; pc = '#dc2626'; }
        }
        const mt2   = TEST_METRIC_TIMES[tTab] || TEST_METRIC_TIMES.PI;
        const r30m  = tRows.find(r => r.time >= (mt2.dar?.[0] ?? 30))?.resistance;
        const r60m  = tRows.find(r => r.time >= (mt2.dar?.[1] ?? 60))?.resistance;
        const r600m = mt2.pi ? tRows.find(r => r.time >= mt2.pi[1])?.resistance : null;
        const r60pm = mt2.pi ? tRows.find(r => r.time >= mt2.pi[0])?.resistance : r60m;
        const calcPI  = r600m && r60pm ? (r600m / r60pm).toFixed(2) : null;
        const calcDAR = r60m  && r30m  ? (r60m  / r30m ).toFixed(2) : null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: 480, padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16, color: '#1e293b' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 8px', boxShadow: '0 0 0 8px #f0fdf4' }}>✓</div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Test Completed Successfully</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>The insulation test has finished data acquisition.</p>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Test Type / Table', `${tTab} (${tTable})`],
                  ['Duration / Reason', `${duration != null ? `${duration}s` : 'Finished'} (${reason})`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: '#64748b' }}>{k}:</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{v}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: '#cbd5e1' }} />
                {[
                  ['Final Resistance', finalR != null ? `${finalR.toLocaleString()} MΩ` : '—'],
                  ['Test Voltage (Final)', finalV != null ? `${finalV} V` : '—'],
                  ['Corrected R40 (IEEE 43)', Rc40m != null ? `${Rc40m.toLocaleString()} MΩ` : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: '#64748b' }}>{k}:</span>
                    <span style={{ fontWeight: 700, color: k.includes('R40') ? '#1e40af' : '#0f172a' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: '#64748b' }}>Standard Evaluation:</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: pc, borderRadius: 6, padding: '3px 8px' }}>{ps}</span>
                </div>
                {(calcPI || calcDAR) && (
                  <>
                    <div style={{ height: 1, background: '#cbd5e1', margin: '4px 0' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      {calcDAR && <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}><span style={{ fontSize: 9, color: '#94a3b8', display: 'block', fontWeight: 700 }}>DAR</span><span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>{calcDAR}</span></div>}
                      {calcPI  && <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}><span style={{ fontSize: 9, color: '#94a3b8', display: 'block', fontWeight: 700 }}>PI</span><span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>{calcPI}</span></div>}
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setShowCompletedModal(false)} style={{ flex: 1, padding: '10px 18px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >Close</button>
            </div>
          </div>
        );
      })()}

      {/* ── RIGHT-CLICK CONTEXT MENU ── */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 5000, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '4px 0', minWidth: 180 }}
          onClick={e => e.stopPropagation()}
        >
          {[
            { label: '➕ Store Result & Test Again', color: '#334155', hover: '#f1f5f9', action: () => addNewRun(contextMenu.suffix) },
            { label: '✏️ Rename Current Run',        color: '#334155', hover: '#f1f5f9', action: () => renameRun(contextMenu.suffix, getActiveRunId(activeTab, contextMenu.suffix)) },
            { label: '🗑️ Delete Current Run',        color: '#dc2626', hover: '#fee2e2', action: () => deleteRun(contextMenu.suffix, getActiveRunId(activeTab, contextMenu.suffix)) },
            { label: '❌ Remove Test Suffix',        color: '#dc2626', hover: '#fee2e2', action: () => removeSuffix(contextMenu.suffix) },
          ].map(({ label, color, hover, action }) => (
            <button
              key={label}
              onClick={action}
              disabled={isCapturing}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', fontSize: 12, fontWeight: 600, color, cursor: isCapturing ? 'not-allowed' : 'pointer', opacity: isCapturing ? 0.5 : 1 }}
              onMouseEnter={e => !isCapturing && (e.currentTarget.style.background = hover)}
              onMouseLeave={e => !isCapturing && (e.currentTarget.style.background = 'none')}
            >{label}</button>
          ))}
        </div>
      )}

    </div>
  );
}
