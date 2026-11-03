// Phase 4 — Geological Log editor page.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Edit2, Trash2, Copy, Save, Check, X, Search, Layers } from 'lucide-react';
import { PageHead } from './Primitives';
import { useProject } from '../context/ProjectContext';
import {
  emptyGeology, createLayer, normalizeGeology, getMaterial, getMaterialsByCategory, GEOLOGY_CATEGORIES,
} from '../geology/model';
import { validateLayers, groupByLevel, countsByLevel, geologySummary } from '../geology/validation';
import GeologyLogCanvas from './GeologyLogCanvas';

export default function GeologyPage() {
  const {
    activeWellId, activeWell,
    saveActiveWellData, loadActiveWellData, notify,
  } = useProject();

  const [geology, setGeology] = useState(emptyGeology());
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [form, setForm] = useState(null);

  // Load geology when active well changes
  useEffect(() => {
    if (!activeWellId) {
      setGeology(emptyGeology());
      setDirty(false);
      setSelectedId(null);
      setEditingId(null);
      setForm(null);
      return;
    }
    const data = loadActiveWellData() || {};
    const saved = data?.model?.geologicalLog ?? data?.geologicalLog ?? null;
    setGeology(normalizeGeology(saved));
    setDirty(false);
    setSelectedId(null);
    setEditingId(null);
    setForm(null);
  }, [activeWellId, loadActiveWellData]);

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
    return max;
  }, [activeWell]);

  // Filtered & sorted layers
  const layers = useMemo(() => {
    const cats = filterCategory === 'all' ? null : filterCategory;
    return (geology.layers || [])
      .filter((l) => {
        if (search) {
          const q = search.toLowerCase();
          const haystack = `${l.name || ''} ${l.material || ''} ${l.description || ''} ${l.formation || ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (cats) {
          const mat = getMaterial(l.material);
          if (mat.category !== cats) return false;
        }
        return true;
      })
      .sort((a, b) => a.startDepth - b.startDepth || a.endDepth - b.endDepth);
  }, [geology.layers, search, filterCategory]);

  // Re-run validation whenever geology/well depth changes
  useEffect(() => {
    setIssues(validateLayers(geology.layers || [], wellDepth));
  }, [geology.layers, wellDepth]);

  // Save to storage (autosave + manual)
  const saveGeology = useCallback((message = 'Log geologi berhasil disimpan.') => {
    if (!activeWellId) return false;
    const ok = saveActiveWellData({
      well: activeWell ? { ...activeWell.well } : {},
      model: { ...(activeWell?.model || {}), geologicalLog: geology },
      activity: activeWell ? { ...activeWell.activity } : {},
    });
    if (ok) {
      setDirty(false);
      notify(message, 'success');
    }
    return ok;
  }, [activeWellId, activeWell, saveActiveWellData, geology, notify]);

  useEffect(() => {
    if (!activeWellId) return;
    if (!dirty) return;
    const t = setTimeout(() => saveGeology('Log geologi tersimpan otomatis.'), 1500);
    return () => clearTimeout(t);
  }, [dirty, activeWellId, saveGeology]);

  // ---- Actions ----

  const addLayer = useCallback((props) => {
    const layer = createLayer(props);
    const next = { ...geology, layers: [...(geology.layers || []), layer] };
    setGeology(next);
    setSelectedId(layer.id);
    setEditingId(null);
    setForm(null);
    setDirty(true);
    notify(`Lapisan ${layer.name} ditambahkan`, 'success');
  }, [geology, notify]);

  const updateLayer = useCallback((updated) => {
    const next = {
      ...geology,
      layers: (geology.layers || []).map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
    };
    setGeology(next);
    setEditingId(null);
    setForm(null);
    setDirty(true);
  }, [geology]);

  const deleteLayer = useCallback((id) => {
    const next = { ...geology, layers: (geology.layers || []).filter((l) => l.id !== id) };
    setGeology(next);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
    setForm(null);
    setDirty(true);
    notify('Lapisan dihapus', 'success');
  }, [geology, selectedId, editingId, notify]);

  const duplicateLayer = useCallback((id) => {
    const src = (geology.layers || []).find((l) => l.id === id);
    if (!src) return;
    const copy = { ...src, id: `geo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: (src.name || '') + ' (Salinan)' };
    const next = { ...geology, layers: [...(geology.layers || []), copy] };
    setGeology(next);
    setSelectedId(copy.id);
    setDirty(true);
    notify('Lapisan diduplikasi', 'success');
  }, [geology, notify]);

  const resetGeology = async () => {
    const ok = await window.confirm('Hapus seluruh lapisan geologi untuk sumur ini?');
    if (!ok) return;
    setGeology(emptyGeology());
    setSelectedId(null);
    setEditingId(null);
    setForm(null);
    setDirty(true);
    notify('Log geologi direset', 'success');
  };

  const materialOptions = useMemo(() => getMaterialsByCategory(), []);
  const summary = geologySummary(geology.layers || [], wellDepth);
  const hasErrors = issues.some((i) => i.level === 'error');

  const layerBeingEdited = editingId === 'new' ? null : (geology.layers || []).find((l) => l.id === editingId) || null;

  // Initialize form state when editing starts
  useEffect(() => {
    if (editingId === 'new') {
      setForm({
        name: '',
        material: 'clay',
        startDepth: '0',
        endDepth: '0',
        description: '',
        formation: '',
        notes: '',
        color: getMaterial('clay').color,
        pattern: getMaterial('clay').pattern,
      });
    } else if (editingId && layerBeingEdited) {
      const l = layerBeingEdited;
      setForm({
        name: l.name || '',
        material: l.material || 'clay',
        startDepth: String(l.startDepth || ''),
        endDepth: String(l.endDepth || ''),
        description: l.description || '',
        formation: l.formation || '',
        notes: l.notes || '',
        color: l.color || getMaterial(l.material).color,
        pattern: l.pattern || getMaterial(l.material).pattern,
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
    const start = Number(form.startDepth);
    const end = Number(form.endDepth);
    if (!Number.isFinite(start) || start < 0) return notify('Kedalaman mulai tidak valid', 'error');
    if (!Number.isFinite(end) || end < 0) return notify('Kedalaman akhir tidak valid', 'error');
    if (end <= start) return notify('Kedalaman akhir harus lebih besar dari kedalaman mulai', 'error');
    const payload = {
      name: form.name || '',
      material: form.material || 'clay',
      startDepth: start,
      endDepth: end,
      description: form.description || '',
      formation: form.formation || '',
      notes: form.notes || '',
      color: form.color || getMaterial(form.material).color,
      pattern: form.pattern || getMaterial(form.material).pattern,
    };
    if (editingId === 'new') {
      addLayer(payload);
    } else {
      updateLayer({ id: layerBeingEdited.id, ...payload });
    }
    notify(editingId === 'new' ? 'Lapisan ditambahkan' : 'Lapisan diperbarui', 'success');
  };

  if (!activeWellId) {
    return (
      <div className="geology-page">
        <PageHead kicker="04 · Log Geologi" title="Log Geologi Sumur Bor"
          description="Pilih atau buat sumur dari halaman Proyek untuk mulai mencatat kondisi geologi bawah permukaan." />
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Layers size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px', display: 'block' }} />
          <h3>Belum ada sumur aktif</h3>
          <p style={{ color: 'var(--mute)', marginBottom: '24px' }}>Pilih atau buat sumur dari halaman Proyek untuk memulai pencatatan geologi.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="geology-page">
      <PageHead kicker="04 · Log Geologi" title="Log Geologi Sumur Bor"
        description="Catat lapisan geologi bawah permukaan berdasarkan interval kedalaman. Setiap sumur memiliki log geologi tersendiri.">
        <div className="page-head-aside">
          <button className="btn btn-outline" onClick={resetGeology} disabled={geology.layers.length === 0}>
            <X size={14} /> Reset Log
          </button>
          <button className="btn btn-primary" onClick={() => saveGeology()} disabled={!dirty}>
            <Save size={14} strokeWidth={2} /> Simpan Log
          </button>
        </div>
      </PageHead>

      <div className="geology-grid">
        {/* Left: Layer list */}
        <aside className="geology-col geology-col-left">
          <div className="toolbar">
            <div className="search-wrap">
              <Search size={14} />
              <input className="field-input" placeholder="Cari lapisan…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="field-input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">Semua kategori</option>
              <option value="soil">Tanah</option>
              <option value="rock">Batu</option>
              <option value="other">Lainnya</option>
            </select>
          </div>

          {layers.length === 0 ? (
            <div className="panel" style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--mute)' }}>
              <p style={{ marginBottom: 8 }}>Belum ada lapisan geologi</p>
              <p style={{ fontSize: 12.5, marginBottom: 16 }}>Tambahkan lapisan pertama untuk memulai log geologi sumur ini.</p>
              <button className="btn btn-primary w-full" onClick={() => setEditingId('new')}>
                <Plus size={14} /> Tambah Lapisan
              </button>
            </div>
          ) : (
            <div className="list">
              {layers.map((l) => {
                const mat = getMaterial(l.material);
                const isErr = issues.some((i) => i.layerId === l.id && i.level === 'error');
                const isWarn = issues.some((i) => i.layerId === l.id && i.level === 'warning');
                return (
                  <button type="button" key={l.id} className={`row item ${selectedId === l.id ? 'is-selected' : ''} ${isErr ? 'has-error' : ''} ${isWarn ? 'has-warning' : ''}`} onClick={() => setSelectedId(l.id)}>
                    <span className="item-swatch" style={{ backgroundColor: l.color }} />
                    <div className="item-text">
                      <b>{l.name}</b>
                      <span className="mono">{Number(l.startDepth).toFixed(1)}–{Number(l.endDepth).toFixed(1)} m · {mat.label}</span>
                    </div>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setEditingId(l.id); }} title="Edit"><Edit2 size={14} /></button>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); duplicateLayer(l.id); }} title="Duplikasi"><Copy size={14} /></button>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }} title="Hapus"><Trash2 size={14} /></button>
                  </button>
                );
              })}
            </div>
          )}

          <div className="savebar" role="status" aria-live="polite">
            {dirty && (
              <>
                <span className="savebar-status mono"><Save size={14} strokeWidth={2} /> Perubahan belum disimpan</span>
                <button className="btn btn-primary" onClick={() => saveGeology()} disabled={!dirty}>Simpan</button>
              </>
            )}
            {!dirty && (
              <>
                <span className="savebar-status mono saved"><Check size={14} strokeWidth={2} /> Tersimpan</span>
              </>
            )}
          </div>
        </aside>

        {/* Center: Layer properties editor */}
        {form && (
          <section className="geology-col geology-col-center">
            <div className="panel">
              <div className="panel-head">
                <span className="panel-tag">{editingId === 'new' ? '+' : '✎'}</span>
                <h2>{editingId === 'new' ? 'Lapisan Baru' : 'Edit Lapisan'}</h2>
                <button type="button" className="icon-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
              </div>
              <form onSubmit={handleFormSubmit} className="stack">
                <div className="form-grid">
                  <Field label="Nama lapisan" {...boundInput('name')} />
                  <Field label="Material" as="select" {...boundInput('material')}>
                    {Object.entries(materialOptions).map(([cat, mats]) => (
                      <optgroup key={cat} label={GEOLOGY_CATEGORIES[cat].label}>
                        {mats.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </optgroup>
                    ))}
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Mulai dari (m)" type="number" step="0.1" min="0" {...boundInput('startDepth')} unit="m" />
                  <Field label="Sampai (m)" type="number" step="0.1" min="0" {...boundInput('endDepth')} unit="m" />
                </div>
                <div className="field">
                  <span className="field-label">Ketebalan (m)</span>
                  <span className="field-control">
                    <span className="field-input" readOnly>{form ? (Number(form.endDepth) - Number(form.startDepth)).toFixed(2) : '—'}</span>
                    <span className="field-unit">m (otomatis)</span>
                  </span>
                </div>
                <Field label="Deskripsi" as="textarea" rows={2} {...boundInput('description')} />
                <Field label="Formasi geologi" {...boundInput('formation')} />
                <Field label="Catatan" as="textarea" rows={2} {...boundInput('notes')} />
                <div className="form-grid">
                  <Field label="Warna" type="color" {...boundInput('color')} />
                  <Field label="Pola" as="select" {...boundInput('pattern')}>
                    <option value="clay">Clay (garis mendatar)</option>
                    <option value="silt">Silt (titik)</option>
                    <option value="fine-sand">Pasir halus (hias diagonal)</option>
                    <option value="gravel">Kerikil (lingkaran)</option>
                    <option value="sandstone">Batu pasir (bata)</option>
                    <option value="limestone">Batu kapur (bata)</option>
                    <option value="shale">Silex (bata)</option>
                    <option value="granite">Granit (bata)</option>
                    <option value="basalt">Basalt (bata)</option>
                    <option value="fill">Material pengisi (garis putus)</option>
                    <option value="unknown">Tidak diketahui</option>
                  </Field>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>Batal</button>
                  <button type="submit" className="btn btn-primary">Simpan Lapisan</button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* Right: Visualization + Validation */}
        <aside className="geology-col geology-col-right">
          <div className="canvas-col">
            <div className="canvas-header">
              <h2>Visualisasi Log</h2>
              <span className="canvas-info">
                {geology.layers.length} lapisan · kedalaman terdalam {summary.deepestDescribed.toFixed(1)} m
              </span>
            </div>
            <div className="canvas-stage">
              <GeologyLogCanvas
                layers={geology.layers || []}
                wellDepth={wellDepth}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </div>

          <div className="panel geology-validation">
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
                  <div key={i.code + i.depth} className="validation-item error" role="alert">
                    <strong>Error:</strong> {i.message}
                  </div>
                ))}
                {groupByLevel(issues).warning.map((i) => (
                  <div key={i.code + i.depth} className="validation-item warning" role="alert">
                    <strong>Peringatan:</strong> {i.message}
                  </div>
                ))}
                {groupByLevel(issues).info.map((i) => (
                  <div key={i.code + i.depth} className="validation-item info">
                    <strong>Info:</strong> {i.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel geology-summary">
            <div className="panel-head"><span className="panel-tag">S</span><h2>Ringkasan</h2></div>
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Jumlah lapisan</span>
                <span className="stat-value"><b>{summary.layerCount}</b></span>
              </div>
              <div className="stat">
                <span className="stat-label">Interval terisi</span>
                <span className="stat-value"><b>{summary.totalFilledInterval.toFixed(2)}</b> <i>m</i></span>
              </div>
              <div className="stat">
                <span className="stat-label">Kedalaman terdalam</span>
                <span className="stat-value"><b>{summary.deepestDescribed.toFixed(1)}</b> <i>m</i></span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function boundInput(key, value, onChange) {
  return { value, onChange };
}

function Field({ label, unit, as: Element = 'input', children, ...props }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <span className="field-control">
        <Element className="field-input" {...props} />
        {unit && <span className="field-unit">{unit}</span>}
      </span>
    </label>
  );
}
