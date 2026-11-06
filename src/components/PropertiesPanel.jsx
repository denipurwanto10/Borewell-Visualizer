import { useEffect, useState } from 'react';
import { Trash2, Copy, Eye, EyeOff, Save, AlertTriangle, Info } from 'lucide-react';
import { Button, Field } from './Primitives';
import { COMPONENT_LABELS, COMPONENT_DEFAULTS, INTERVAL_TYPES, MARKER_TYPES } from '../designer/model';

const NUMERIC_KEYS = new Set(['startDepth', 'endDepth', 'length', 'outerDiameter', 'innerDiameter', 'zOrder']);

export default function PropertiesPanel({ component, onUpdate, onDuplicate, onDelete, onVisibilityToggle }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(component ? { ...component } : null);
  const [unsaved, setUnsaved] = useState(false);

  // Selalu selaraskan salinan lokal dengan komponen yang dipilih (sebelumnya null saat pertama kali memilih).
  useEffect(() => {
    setLocal(component ? { ...component } : null);
    setUnsaved(false);
  }, [component]);

  if (!component) {
    return (
      <section className="properties-panel empty">
        <div className="empty-state">
          <Info size={32} style={{ color: 'var(--mute-2)', marginBottom: '12px' }} />
          <h3>Belum ada komponen yang dipilih</h3>
          <p>Ketuk komponen pada kanvas untuk melihat dan mengedit propertinya.</p>
        </div>
      </section>
    );
  }

  const val = (k) => (local && local[k] !== undefined && local[k] !== null ? local[k] : (component[k] ?? ''));
  const hasInner = component.innerDiameter !== null && component.innerDiameter !== undefined;
  const label = COMPONENT_LABELS[component.type] || component.type;
  const isInterval = INTERVAL_TYPES.has(component.type);

  const handleSave = () => {
    if (!local) return;
    const next = { ...local };
    if (isInterval) {
      next.length = Math.max(0, (next.endDepth || 0) - (next.startDepth || 0));
    }
    onUpdate(next);
    setEditing(false);
    setUnsaved(false);
  };

  const handleChange = (key, value) => {
    if (!local) return;
    const next = { ...local };
    if (NUMERIC_KEYS.has(key)) {
      const n = num(value);
      next[key] = n !== null ? n : value;
    } else {
      next[key] = value;
    }
    if (isInterval && (key === 'startDepth' || key === 'endDepth')) {
      next.length = Math.max(0, (Number(next.endDepth) || 0) - (Number(next.startDepth) || 0));
    }
    setLocal(next);
    setUnsaved(true);
  };

  const num = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <section className="properties-panel">
      <div className="panel-head">
        <span className="panel-tag">P</span>
        <h2>Properti Komponen</h2>
        <span className="type-badge" style={{ background: component.color + '22', color: component.color }}>
          {label}
        </span>
      </div>

      <div className="properties-grid">
        <Field label="ID" value={component.id} disabled readOnly className="col-2" />
        <Field label="Tipe" value={label} disabled readOnly className="col-2" />

        {isInterval ? (
          <>
            <Field label="Kedalaman mulai" unit="m" type="number" inputMode="decimal" step="0.1"
              value={val('startDepth')} onChange={(e) => handleChange('startDepth', e.target.value)} />
            <Field label="Kedalaman akhir" unit="m" type="number" inputMode="decimal" step="0.1"
              value={val('endDepth')} onChange={(e) => handleChange('endDepth', e.target.value)} />
            <Field label="Panjang (otomatis)" unit="m" type="number" readOnly tabIndex={-1} className="is-computed col-2"
              value={Math.max(0, (Number(val('endDepth')) || 0) - (Number(val('startDepth')) || 0))
                .toFixed(2).replace(/\.?0+$/, '')} />
          </>
        ) : (
          <Field label="Kedalaman" unit="m" type="number" inputMode="decimal" step="0.1" className="col-2"
            value={val('startDepth')} onChange={(e) => handleChange('startDepth', e.target.value)} />
        )}

        <Field label="Diameter luar" unit="mm" type="number" inputMode="decimal" step="1"
          value={val('outerDiameter')} onChange={(e) => handleChange('outerDiameter', e.target.value)} />
        {hasInner ? (
          <Field label="Diameter dalam" unit="mm" type="number" inputMode="decimal" step="1"
            value={val('innerDiameter')} onChange={(e) => handleChange('innerDiameter', e.target.value)} />
        ) : <div className="field-spacer" aria-hidden="true" />}

        <Field label="Materi" value={val('material')} onChange={(e) => handleChange('material', e.target.value)} />
        <label className="field">
          <span className="field-label">Warna</span>
          <span className="field-control color-control">
            <input type="color" className="color-swatch" aria-label="Pilih warna"
              value={/^#[0-9a-f]{6}$/i.test(val('color') || '') ? val('color') : '#64748b'}
              onChange={(e) => handleChange('color', e.target.value)} />
            <input className="field-input color-hex" value={val('color') || ''} maxLength={7} spellCheck={false}
              onChange={(e) => handleChange('color', e.target.value)} />
          </span>
        </label>

        <Field label="Deskripsi" as="textarea" rows={3} className="col-2"
          value={val('description') || ''} onChange={(e) => handleChange('description', e.target.value)} />
        <Field label="Z-order" className="col-2" type="number" inputMode="decimal" step="1"
          value={val('zOrder')} onChange={(e) => handleChange('zOrder', e.target.value)}
          hint="Prioritas rendering (rendah = di belakang)" />
      </div>

      <div className="property-actions">
        <label className="prop-toggle">
          <span>Tampilkan di kanvas</span>
          <input
            type="checkbox"
            checked={(local || {}).visible !== undefined ? (local || {}).visible : component.visible}
            onChange={(e) => { setLocal(prev => ({ ...prev, visible: e.target.checked })); setUnsaved(true); }}
          />
        </label>
        {unsaved && (
          <Button variant="soft" icon={Save} onClick={handleSave} className="w-full">
            Simpan perubahan
          </Button>
        )}
        <div className="action-row">
          <Button variant="ghost" icon={Copy} onClick={onDuplicate} className="flex-1">
            Duplikat
          </Button>
          <button type="button" className="btn btn-ghost flex-1" onClick={() => onVisibilityToggle(component.id)}>
            <Eye size={18} strokeWidth={2} />
            <span>{component.visible ? 'Sembunyikan' : 'Tampilkan'}</span>
          </button>
        </div>
        <Button variant="danger" icon={Trash2} onClick={onDelete} className="w-full">
          Hapus komponen
        </Button>

        <div className="validation-hint">
          <AlertTriangle size={14} /> <span>Unit: kedalaman dalam meter (m), diameter dalam milimeter (mm).</span>
        </div>
      </div>
    </section>
  );
}
