// Phase 5 — Groundwater Monitoring page.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Copy, Save, Check, X, Search, Download, Upload, FileText, Droplets, AlertTriangle, Info, Settings } from 'lucide-react';
import { PageHead, Field, Button } from './Primitives';
import { useProject } from '../context/ProjectContext';
import {
  emptyMonitoring, createMeasurement, normalizeMonitoring, getMethod, getReferencePoint, sortByTime,
  MEASUREMENT_METHODS, REFERENCE_POINTS,
} from '../monitoring/model';
import { validateMeasurements, groupByLevel, countsByLevel, monitoringSummary } from '../monitoring/validation';
import { computeStatistics, formatStatValue, formatChange, formatDateTime } from '../monitoring/statistics';
import { exportToCsv, downloadCsv, parseCsv, previewImport } from '../monitoring/export';
import { MonitoringHydrographCanvas } from './MonitoringHydrographCanvas';

export default function MonitoringPage() {
  const {
    activeWellId, activeWell, activeProject,
    saveActiveWellData, loadActiveWellData, notify,
  } = useProject();

  const [monitoring, setMonitoring] = useState(emptyMonitoring());
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState(null);
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [sortDesc, setSortDesc] = useState(true);

  // Load monitoring when active well changes
  useEffect(() => {
    let cancelled = false;
    if (!activeWellId) {
      setMonitoring(emptyMonitoring());
      setDirty(false);
      setSelectedId(null);
      setEditingId(null);
      setForm(null);
      return;
    }
    (async () => {
      const data = await loadActiveWellData();
      if (cancelled) return;
      const saved = data?.model?.groundwaterMonitoring ?? data?.groundwaterMonitoring ?? null;
      setMonitoring(normalizeMonitoring(saved));
      setDirty(false);
      setSelectedId(null);
      setEditingId(null);
      setForm(null);
    })();
    return () => { cancelled = true; };
  }, [activeWellId, loadActiveWellData]);

  // Handle body scroll lock for tablet form drawer
  useEffect(() => {
    if (formDrawerOpen) {
      document.body.classList.add('props-drawer-open');
    } else {
      document.body.classList.remove('props-drawer-open');
    }
    return () => document.body.classList.remove('props-drawer-open');
  }, [formDrawerOpen]);

  // Handle Escape key to close form drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && formDrawerOpen) {
        setFormDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formDrawerOpen]);

  // Derived: well depth for validation/scale
  const wellDepth = useMemo(() => {
    if (!activeWell?.model) return 0;
    const m = activeWell.model;
    const pipes = Array.isArray(m.pipes) ? m.pipes : [];
    const screens = Array.isArray(m.screens) ? m.screens : [];
    let max = 0;
    for (const p of pipes) max = Math.max(max, Number(p.end) || 0);
    for (const s of screens) max = Math.max(max, Number(s.depth) + Number(s.size));
    if (m.openHole && Number.isFinite(m.openHole.end)) max = Math.max(max, Number(m.openHole.end));
    // Also check designer components
    if (m.designer?.components) {
      for (const c of m.designer.components) {
        const d = c.endDepth || c.startDepth || 0;
        if (d > max) max = d;
      }
    }
    return max;
  }, [activeWell]);

  const groundElevation = useMemo(() => {
    if (!activeWell?.model) return null;
    const ground = activeWell.model.ground;
    return Number.isFinite(ground) ? ground : null;
  }, [activeWell]);

  // Filtered & sorted measurements
  const measurements = useMemo(() => {
    let result = (monitoring.measurements || []).filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${m.notes || ''} ${m.method || ''} ${m.referencePoint || ''} ${formatDateTime(m.measuredAt)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterStatus !== 'all' && m.status !== filterStatus) return false;
      return true;
    });
    result = sortByTime(result);
    if (sortDesc) result.reverse();
    return result;
  }, [monitoring.measurements, search, filterStatus, sortDesc]);

  // Re-run validation whenever monitoring/well depth changes
  useEffect(() => {
    setIssues(validateMeasurements(monitoring.measurements || [], wellDepth));
  }, [monitoring.measurements, wellDepth]);

  // Save to storage (autosave + manual)
  const saveMonitoring = useCallback((message = 'Monitoring air tanah berhasil disimpan.') => {
    if (!activeWellId) return false;
    const ok = saveActiveWellData({
      well: activeWell ? { ...activeWell.well } : {},
      model: { ...(activeWell?.model || {}), groundwaterMonitoring: monitoring },
      activity: activeWell ? { ...activeWell.activity } : {},
    });
    if (ok) {
      setDirty(false);
      notify(message, 'success');
    }
    return ok;
  }, [activeWellId, activeWell, saveActiveWellData, monitoring, notify]);

  // Autosave on monitoring changes
  useEffect(() => {
    if (!activeWellId) return;
    if (!dirty) return;
    const t = setTimeout(() => saveMonitoring('Monitoring tersimpan otomatis.'), 1500);
    return () => clearTimeout(t);
  }, [dirty, activeWellId, saveMonitoring]);

  // ---- Actions ----

  const addMeasurement = useCallback((props) => {
    const measurement = createMeasurement(props);
    const next = { ...monitoring, measurements: [...(monitoring.measurements || []), measurement] };
    setMonitoring(next);
    setSelectedId(measurement.id);
    setEditingId(null);
    setForm(null);
    setDirty(true);
    notify(`Pengukuran ${formatDateTime(measurement.measuredAt)} ditambahkan`, 'success');
  }, [monitoring, notify]);

  const updateMeasurement = useCallback((updated) => {
    const next = {
      ...monitoring,
      measurements: (monitoring.measurements || []).map((m) => (m.id === updated.id ? { ...m, ...updated, updatedAt: new Date().toISOString() } : m)),
    };
    setMonitoring(next);
    setEditingId(null);
    setForm(null);
    setDirty(true);
  }, [monitoring]);

  const deleteMeasurement = useCallback((id) => {
    const next = { ...monitoring, measurements: (monitoring.measurements || []).filter((m) => m.id !== id) };
    setMonitoring(next);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    setForm(null);
    setDirty(true);
    notify('Pengukuran dihapus', 'success');
  }, [monitoring, selectedId, editingId, notify]);

  const duplicateMeasurement = useCallback((id) => {
    const src = (monitoring.measurements || []).find((m) => m.id === id);
    if (!src) return;
    const copy = { ...src, id: `mon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, notes: (src.notes || '') + ' (Salinan)' };
    const next = { ...monitoring, measurements: [...(monitoring.measurements || []), copy] };
    setMonitoring(next);
    setSelectedId(copy.id);
    setDirty(true);
    notify('Pengukuran diduplikasi', 'success');
  }, [monitoring, notify]);

  const resetMonitoring = async () => {
    const ok = window.confirm('Hapus seluruh data monitoring air tanah untuk sumur ini?');
    if (!ok) return;
    setMonitoring(emptyMonitoring());
    setSelectedId(null);
    setEditingId(null);
    setForm(null);
    setDirty(true);
    notify('Monitoring direset', 'success');
  };

  const exportCsv = useCallback(() => {
    if (monitoring.measurements.length === 0) {
      notify('Tidak ada data untuk diekspor', 'warning');
      return;
    }
    downloadCsv(monitoring.measurements, `monitoring_${activeWell?.well?.wellCode || 'well'}_${new Date().toISOString().slice(0,10)}.csv`);
    notify('CSV diekspor', 'success');
  }, [monitoring.measurements, activeWell, notify]);

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const preview = previewImport(evt.target.result);
      setImportPreview(preview);
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!importFile || !importPreview) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const { measurements: newMeasurements, errors } = parseCsv(evt.target.result);
      if (newMeasurements.length === 0) {
        notify('Tidak ada data valid untuk diimpor', 'error');
        return;
      }
      // Append, skipping duplicates by ID
      const existingIds = new Set(monitoring.measurements.map(m => m.id));
      const toAdd = newMeasurements.filter(m => !existingIds.has(m.id));
      const next = { ...monitoring, measurements: [...monitoring.measurements, ...toAdd] };
      setMonitoring(next);
      setDirty(true);
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview(null);
      notify(`${toAdd.length} pengukuran diimpor${errors.length > 0 ? `, ${errors.length} baris bermasalah dilewati` : ''}`, 'success');
    };
    reader.readAsText(importFile);
  };

  const materialOptions = useMemo(() => MEASUREMENT_METHODS, []);
  const refPointOptions = useMemo(() => REFERENCE_POINTS, []);
  const summary = monitoringSummary(monitoring.measurements || [], wellDepth);
  const stats = computeStatistics(monitoring.measurements || [], wellDepth, groundElevation);
  const hasErrors = issues.some((i) => i.level === 'error');

  const layerBeingEdited = editingId === 'new' ? null : (monitoring.measurements || []).find((m) => m.id === editingId) || null;

  // Initialize form state when editing starts
  useEffect(() => {
    if (editingId === 'new') {
      const now = new Date();
      const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setForm({
        measuredAt: localISO,
        waterLevelDepth: '',
        referencePoint: 'top_of_casing',
        referenceElevation: '',
        method: 'electric_water_level_meter',
        status: 'valid',
        notes: '',
      });
    } else if (editingId && layerBeingEdited) {
      const m = layerBeingEdited;
      const localISO = new Date(m.measuredAt).toISOString().slice(0, 16);
      setForm({
        measuredAt: localISO,
        waterLevelDepth: String(m.waterLevelDepth || ''),
        referencePoint: m.referencePoint || 'top_of_casing',
        referenceElevation: m.referenceElevation !== null && m.referenceElevation !== undefined ? String(m.referenceElevation) : '',
        method: m.method || 'electric_water_level_meter',
        status: m.status || 'valid',
        notes: m.notes || '',
      });
    } else {
      setForm(null);
    }
  }, [editingId, layerBeingEdited]);

  const setFormField = (key, value) => setForm((prev) => prev ? { ...prev, [key]: value } : null);
  const boundInput = (key) => ({ value: form?.[key] ?? '', onChange: (e) => setFormField(key, e.target.value) });

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!form) return;
    const depth = Number(form.waterLevelDepth);
    if (!Number.isFinite(depth) || depth < 0) return notify('Kedalaman air tidak valid (harus angka ≥ 0)', 'error');
    const measuredAt = form.measuredAt ? new Date(form.measuredAt).toISOString() : new Date().toISOString();
    const payload = {
      measuredAt,
      waterLevelDepth: depth,
      referencePoint: form.referencePoint,
      referenceElevation: form.referenceElevation !== '' ? Number(form.referenceElevation) : null,
      method: form.method,
      status: form.status,
      notes: form.notes || '',
    };
    if (editingId === 'new') {
      addMeasurement(payload);
    } else {
      updateMeasurement({ id: layerBeingEdited.id, ...payload });
    }
    notify(editingId === 'new' ? 'Pengukuran ditambahkan' : 'Pengukuran diperbarui', 'success');
  };

  if (!activeWellId) {
    return (
      <div className="monitoring-page">
        <PageHead kicker="05 · Monitoring Air Tanah" title="Monitoring Muka Air Tanah"
          description="Pilih atau buat sumur dari halaman Proyek untuk mulai mencatat pengukuran muka air tanah." />
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Droplets size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px', display: 'block' }} />
          <h3>Belum ada sumur aktif</h3>
          <p style={{ color: 'var(--mute)', marginBottom: '24px' }}>Pilih atau buat sumur dari halaman Proyek untuk memulai monitoring air tanah.</p>
        </div>
      </div>
    );
  }

  const latestMeasurement = (monitoring.measurements || []).filter(m => m.status === 'valid').sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))[0] || null;

  return (
    <div className="monitoring-page">
      <PageHead kicker="05 · Monitoring Air Tanah" title="Monitoring Muka Air Tanah"
        description="Catat pengukuran muka air tanah berdasarkan waktu. Setiap sumur memiliki riwayat monitoring tersendiri.">
        <div className="page-head-aside">
          <button className="btn btn-outline" onClick={() => setShowImportModal(true)}>
            <Upload size={14} /> Impor CSV
          </button>
          <button className="btn btn-outline" onClick={exportCsv} disabled={monitoring.measurements.length === 0}>
            <Download size={14} /> Ekspor CSV
          </button>
          <button className="btn btn-outline" onClick={resetMonitoring} disabled={monitoring.measurements.length === 0}>
            <Trash2 size={14} /> Reset
          </button>
          <button className="btn btn-primary" onClick={() => saveMonitoring()} disabled={!dirty}>
            <Save size={14} strokeWidth={2} /> Simpan
          </button>
        </div>
      </PageHead>

      <div className="monitoring-grid">
        {/* Left: Measurement list */}
        <aside className="monitoring-col monitoring-col-left">
          <div className="toolbar">
            <div className="search-wrap">
              <Search size={14} />
              <input className="field-input" placeholder="Cari pengukuran…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="field-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">Semua Status</option>
              <option value="valid">Valid</option>
              <option value="invalid">Tidak Valid</option>
            </select>
            <button type="button" className="btn btn-soft" onClick={() => setSortDesc(!sortDesc)} title="Urutkan">
              {sortDesc ? '↓ Terbaru' : '↑ Terlama'}
            </button>
          </div>

          {measurements.length === 0 ? (
            <div className="panel" style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--mute)' }}>
              <p style={{ marginBottom: 8 }}>Belum ada pengukuran muka air</p>
              <p style={{ fontSize: 12.5, marginBottom: 16 }}>Tambahkan pengukuran pertama untuk memulai monitoring.</p>
              <button className="btn btn-primary w-full" onClick={() => setEditingId('new')}>
                <Plus size={14} /> Tambah Pengukuran
              </button>
            </div>
          ) : (
            <div className="list">
              {measurements.map((m) => {
                const method = getMethod(m.method);
                const refPoint = getReferencePoint(m.referencePoint);
                const prev = (() => {
                  const sorted = sortByTime(monitoring.measurements || []);
                  const idx = sorted.findIndex(x => x.id === m.id);
                  return idx > 0 ? sorted[idx - 1] : null;
                })();
                const change = prev && prev.referencePoint === m.referencePoint ? m.waterLevelDepth - prev.waterLevelDepth : null;
                const isErr = issues.some((i) => i.measurementId === m.id && i.level === 'error');
                const isWarn = issues.some((i) => i.measurementId === m.id && i.level === 'warning');
                return (
                  <button type="button" key={m.id} className={`row item ${selectedId === m.id ? 'is-selected' : ''} ${isErr ? 'has-error' : ''} ${isWarn ? 'has-warning' : ''} ${m.status === 'invalid' ? 'is-invalid' : ''}`} onClick={() => setSelectedId(m.id)}>
                    <span className="item-swatch" style={{ backgroundColor: m.status === 'invalid' ? '#b03a2e' : '#0d5f5a' }} />
                    <div className="item-text">
                      <b>{formatDateTime(m.measuredAt)}</b>
                      <span className="mono">{m.waterLevelDepth.toFixed(2)} m · {refPoint.label}</span>
                      <span style={{ fontSize: 11, color: change === null ? 'var(--mute)' : change > 0 ? 'var(--red)' : change < 0 ? 'var(--green)' : 'var(--mute)' }}>
                        {change !== null ? (change > 0 ? `▼ ${change.toFixed(2)} m` : change < 0 ? `▲ ${Math.abs(change).toFixed(2)} m` : '—') : '—'}
                      </span>
                    </div>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setEditingId(m.id); }} title="Edit"><Edit2 size={14} /></button>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); duplicateMeasurement(m.id); }} title="Duplikasi"><Copy size={14} /></button>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); deleteMeasurement(m.id); }} title="Hapus"><Trash2 size={14} /></button>
                  </button>
                );
              })}
            </div>
          )}

          <div className="savebar" role="status" aria-live="polite">
            {dirty && (
              <>
                <span className="savebar-status mono"><Save size={14} strokeWidth={2} /> Perubahan belum disimpan</span>
                <button className="btn btn-primary" onClick={() => saveMonitoring()} disabled={!dirty}>Simpan</button>
              </>
            )}
            {!dirty && (
              <>
                <span className="savebar-status mono saved"><Check size={14} strokeWidth={2} /> Tersimpan</span>
              </>
            )}
          </div>
        </aside>

        {/* Center: Measurement properties editor */}
        {form && (
          <section className="monitoring-col monitoring-col-center">
            <div className="panel">
              <div className="panel-head">
                <span className="panel-tag">{editingId === 'new' ? '+' : '✎'}</span>
                <h2>{editingId === 'new' ? 'Pengukuran Baru' : 'Edit Pengukuran'}</h2>
                <button type="button" className="icon-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
              </div>
              <form onSubmit={handleFormSubmit} className="stack">
                <div className="form-grid">
                  <Field label="Tanggal & Waktu" type="datetime-local" {...boundInput('measuredAt')} />
                  <Field label="Kedalaman Air (m)" type="number" step="0.01" min="0" {...boundInput('waterLevelDepth')} unit="m" />
                </div>
                <div className="form-grid">
                  <Field label="Titik Referensi" as="select" {...boundInput('referencePoint')}>
                    {Object.entries(refPointOptions).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
                  </Field>
                  <Field label="Elevasi Referensi (m, opsional)" type="number" step="0.01" {...boundInput('referenceElevation')} unit="mdpl" />
                </div>
                <Field label="Metode Pengukuran" as="select" {...boundInput('method')}>
                  {Object.entries(materialOptions).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
                </Field>
                <Field label="Status" as="select" {...boundInput('status')}>
                  <option value="valid">Valid</option>
                  <option value="invalid">Tidak Valid</option>
                </Field>
                <Field label="Catatan" as="textarea" rows={3} {...boundInput('notes')} />
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>Batal</button>
                  <button type="submit" className="btn btn-primary">Simpan Pengukuran</button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* Right: Hydrograph + Statistics + Validation */}
        <aside className="monitoring-col monitoring-col-right">
          {/* Hydrograph */}
          <div className="canvas-col">
            <div className="canvas-header">
              <h2>Hidrograf Muka Air</h2>
              <span className="canvas-info">
                {monitoring.measurements.length} pengukuran · {latestMeasurement ? `Terbaru: ${latestMeasurement.waterLevelDepth.toFixed(2)} m` : 'Belum ada data'}
              </span>
            </div>
            <div className="canvas-stage" style={{ minHeight: '360px' }}>
              <div className="hydrograph-wrap">
                <MonitoringHydrographCanvas
                  measurements={monitoring.measurements || []}
                  wellDepth={wellDepth}
                  referencePoint={latestMeasurement ? getReferencePoint(latestMeasurement.referencePoint).label : null}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
                {selectedId && measurements.find(m => m.id === selectedId) && (
                  <MonitoringHydrographTooltip measurement={measurements.find(m => m.id === selectedId)} />
                )}
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="panel monitoring-stats">
            <div className="panel-head"><span className="panel-tag">S</span><h2>Statistik</h2></div>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-label">Total Pengukuran</span>
                <span className="stat-value"><b>{stats.totalMeasurements}</b> <i>({stats.validMeasurements} valid)</i></span>
              </div>
              <div className="stat">
                <span className="stat-label">Kedalaman Terbaru</span>
                <span className="stat-value"><b>{formatStatValue(stats.latestDepth)}</b></span>
              </div>
              <div className="stat">
                <span className="stat-label">Minimum</span>
                <span className="stat-value"><b>{formatStatValue(stats.minDepth)}</b></span>
              </div>
              <div className="stat">
                <span className="stat-label">Maksimum</span>
                <span className="stat-value"><b>{formatStatValue(stats.maxDepth)}</b></span>
              </div>
              <div className="stat">
                <span className="stat-label">Rata-rata</span>
                <span className="stat-value"><b>{formatStatValue(stats.avgDepth)}</b></span>
              </div>
              <div className="stat">
                <span className="stat-label">Perubahan Terakhir</span>
                <span className="stat-value"><b>{formatChange(stats.latestChange, stats.changeDirection)}</b>{stats.referenceMismatch && <span style={{color: 'var(--ochre)', fontSize: 11, marginLeft: 4}}><AlertTriangle size={10} /> Ref beda</span>}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Pengukuran Pertama</span>
                <span className="stat-value"><b>{formatDateTime(stats.firstDate)}</b></span>
              </div>
              <div className="stat">
                <span className="stat-label">Pengukuran Terbaru</span>
                <span className="stat-value"><b>{formatDateTime(stats.latestDate)}</b></span>
              </div>
              {stats.elevation !== null && (
                <div className="stat">
                  <span className="stat-label">Elevasi Muka Air (est.)</span>
                  <span className="stat-value"><b>{stats.elevation.toFixed(2)} mdpl</b></span>
                </div>
              )}
            </div>
            <div className="stat-note" style={{ marginTop: 12, fontSize: 12, color: 'var(--mute)' }}>
              <Info size={12} style={{verticalAlign: 'middle', marginRight: 4}} />
              Kedalaman mengacu pada titik referensi: <b>{latestMeasurement ? getReferencePoint(latestMeasurement.referencePoint).label : '—'}</b>.
              {stats.referenceMismatch && ' Perbandingan dengan pengukuran sebelumnya tidak langsung karena titik referensi berbeda.'}
              {wellDepth > 0 && ` Kedalaman sumur: ${wellDepth.toFixed(1)} m.`}
            </div>
          </div>

          {/* Validation */}
          <div className="panel monitoring-validation">
            <div className="panel-head">
              <span className="panel-tag">V</span>
              <h2>Validasi</h2>
            </div>
            <div className="validation-summary">
              <span className={`badge ${hasErrors ? 'bg-red' : 'bg-green'}`}>{countsByLevel(issues).error} Error</span>
              <span className={`badge ${countsByLevel(issues).warning > 0 ? 'bg-amber' : 'bg-green'}`}>{countsByLevel(issues).warning} Peringatan</span>
              <span className="badge bg-info">{countsByLevel(issues).info} Info</span>
            </div>
            {issues.length === 0 ? (
              <p style={{ color: 'var(--mute)', fontSize: 12.5, textAlign: 'center', padding: '16px 0' }}>Tidak ada masalah terdeteksi.</p>
            ) : (
              <div className="validation-list">
                {groupByLevel(issues).error.map((i) => (
                  <div key={i.code + (i.measurementId || '') + (i.depth || '')} className="validation-item error" role="alert">
                    <strong>Error:</strong> {i.message}
                  </div>
                ))}
                {groupByLevel(issues).warning.map((i) => (
                  <div key={i.code + (i.measurementId || '') + (i.depth || '')} className="validation-item warning" role="alert">
                    <strong>Peringatan:</strong> {i.message}
                  </div>
                ))}
                {groupByLevel(issues).info.map((i) => (
                  <div key={i.code + (i.measurementId || '') + (i.depth || '')} className="validation-item info">
                    <strong>Info:</strong> {i.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

      </div>

      {/* Tablet: Floating form button (768-1024px) */}
      {form && (
        <button
          className="floating-props-btn"
          onClick={() => setFormDrawerOpen(true)}
          aria-label="Buka formulir pengukuran"
          title="Buka formulir pengukuran"
        >
          <Settings size={22} />
        </button>
      )}

      {/* Tablet: Form drawer (768-1024px) */}
      <div className={`props-drawer-scrim ${formDrawerOpen ? 'is-open' : ''}`} onClick={() => setFormDrawerOpen(false)} aria-hidden="true" />
      <aside className={`props-drawer ${formDrawerOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Formulir pengukuran monitoring">
        <div className="props-drawer-header">
          <h2>{editingId === 'new' ? 'Pengukuran Baru' : 'Edit Pengukuran'}</h2>
          <button
            type="button"
            className="props-drawer-close"
            onClick={() => { setEditingId(null); setFormDrawerOpen(false); }}
            aria-label="Tutup formulir"
          >
            <X size={20} />
          </button>
        </div>
        <div className="props-drawer-body">
          <form onSubmit={handleFormSubmit} className="stack">
            <div className="form-grid">
              <Field label="Tanggal & Waktu" type="datetime-local" {...boundInput('measuredAt')} />
              <Field label="Kedalaman Air (m)" type="number" step="0.01" min="0" {...boundInput('waterLevelDepth')} unit="m" />
            </div>
            <div className="form-grid">
              <Field label="Titik Referensi" as="select" {...boundInput('referencePoint')}>
                {Object.entries(refPointOptions).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
              </Field>
              <Field label="Elevasi Referensi (m, opsional)" type="number" step="0.01" {...boundInput('referenceElevation')} unit="mdpl" />
            </div>
            <Field label="Metode Pengukuran" as="select" {...boundInput('method')}>
              {Object.entries(materialOptions).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
            </Field>
            <Field label="Status" as="select" {...boundInput('status')}>
              <option value="valid">Valid</option>
              <option value="invalid">Tidak Valid</option>
            </Field>
            <Field label="Catatan" as="textarea" rows={3} {...boundInput('notes')} />
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setFormDrawerOpen(false); }}>Batal</button>
              <button type="submit" className="btn btn-primary">Simpan Pengukuran</button>
            </div>
          </form>
        </div>
        <div className="props-drawer-footer">
          <Button variant="ghost" onClick={() => { setEditingId(null); setFormDrawerOpen(false); }} className="w-full">
            Tutup
          </Button>
        </div>
      </aside>

      {/* Import Modal */}
      {showImportModal && (
        <div className="dialog-layer is-open" onClick={() => { setShowImportModal(false); setImportFile(null); setImportPreview(null); }}>
          <div className="dialog-scrim" />
          <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-mark"><Upload size={24} /></div>
            <h3>Impor Data Monitoring dari CSV</h3>
            <p>Pilih file CSV dengan header yang sesuai. Data akan ditambahkan ke monitoring yang ada (append).</p>
            <input type="file" accept=".csv,text/csv" onChange={handleImportFile} className="field-input" style={{ marginBottom: 12 }} />
            {importPreview && (
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="validation-summary">
                  <span className="badge bg-green">{importPreview.validCount} Baris Valid</span>
                  <span className="badge bg-red">{importPreview.errorCount} Error</span>
                </div>
                {importPreview.errors.length > 0 && (
                  <div className="validation-list" style={{ maxHeight: 200, overflow: 'auto' }}>
                    {importPreview.errors.map((err, idx) => (
                      <div key={idx} className="validation-item error" style={{ fontSize: 12 }}>
                        {err}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--mute)' }}>
                  Contoh data: {importPreview.sample.map(s => `${s.measuredAt}: ${s.waterLevelDepth}m`).join('; ')}
                </div>
              </div>
            )}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => { setShowImportModal(false); setImportFile(null); setImportPreview(null); }}>Batal</button>
              <button className="btn btn-primary" onClick={confirmImport} disabled={!importPreview || importPreview.validCount === 0}>
                <Download size={14} /> Impor {importPreview && `(${importPreview.validCount} baris)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function boundInput(key, value, onChange) {
  return { value, onChange };
}

function MonitoringHydrographTooltip({ measurement }) {
  if (!measurement) return null;

  const methodLabels = {
    electric_water_level_meter: 'Electric Water Level Meter',
    manual_water_level_meter: 'Manual Water Level Meter',
    pressure_transducer: 'Pressure Transducer',
    automatic_data_logger: 'Automatic Data Logger',
    other: 'Other',
  };

  const refLabels = {
    top_of_casing: 'Top of Casing',
    ground_level: 'Ground Level',
    custom: 'Custom Reference Point',
  };

  return (
    <div className="hydrograph-tooltip">
      <strong>{new Date(measurement.measuredAt).toLocaleString('id-ID')}</strong>
      <div className="mono">Kedalaman: {measurement.waterLevelDepth.toFixed(2)} m</div>
      <div>Titik Referensi: {refLabels[measurement.referencePoint] || measurement.referencePoint}</div>
      <div>Metode: {methodLabels[measurement.method] || measurement.method}</div>
      {measurement.notes && <div className="notes">Catatan: {measurement.notes}</div>}
    </div>
  );
}