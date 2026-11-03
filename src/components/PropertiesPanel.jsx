import { useState } from 'react';
import { Trash2, Copy, Eye, EyeOff, Save, AlertTriangle, Info } from 'lucide-react';
import { Button, Field } from './Primitives';
import { COMPONENT_LABELS, COMPONENT_DEFAULTS, INTERVAL_TYPES, MARKER_TYPES } from '../designer/model';

export default function PropertiesPanel({ component, onUpdate, onDuplicate, onDelete, onVisibilityToggle }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(component ? { ...component } : null);
  const [unsaved, setUnsaved] = useState(false);

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
    const n = num(value);
    setLocal({ ...local, [key]: n !== null && n !== undefined ? n : value });
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
        <Field label="ID" value={component.id} disabled className="col-2" />
        <Field label="Tipe" value={label} disabled className="col-2" />

        {isInterval ? (
          <>
            <Field label="Kedalaman mulai" unit="m" type="number" inputMode="decimal" step="0.1"
              value={local.startDepth !== undefined ? local.startDepth : component.startDepth}
              onChange={(e) => handleChange('startDepth', e.target.value)} />
            <Field label="Kedalaman akhir" unit="m" type="number" inputMode="decimal" step="0.1"
              value={local.endDepth !== undefined ? local.endDepth : component.endDepth}
              onChange={(e) => handleChange('endDepth', e.target.value)} />
            <Field label="Panjang" unit="m" type="number" inputMode="decimal" step="0.1"
              value={local.length !== undefined ? local.length : component.length}
              onChange={(e) => handleChange('length', e.target.value)}
              hint="Dihitung dari kedalaman akhir − mulai" />
          </>
        ) : (
          <Field label="Kedalaman" unit="m" type="number" inputMode="decimal" step="0.1"
            value={local.startDepth !== undefined ? local.startDepth : component.startDepth}
            onChange={(e) => handleChange('startDepth', e.target.value)}
            hint="Kedalaman penanda komponen" />
        )}

        <Field label="Diameter luar" unit="mm" type="number" inputMode="decimal" step="1"
          value={local.outerDiameter !== undefined ? local.outerDiameter : component.outerDiameter}
          onChange={(e) => handleChange('outerDiameter', e.target.value)} />
        {component.innerDiameter !== null && component.innerDiameter !== undefined ? (
          <Field label="Diameter dalam" unit="mm" type="number" inputMode="decimal" step="1"
            value={local.innerDiameter !== undefined ? local.innerDiameter : component.innerDiameter}
            onChange={(e) => handleChange('innerDiameter', e.target.value)}
            hint="Kosongkan jika tidak berlaku" />
        ) : null}
        <Field label="Materi" value={local.material !== undefined ? local.material : component.material}
          onChange={(e) => handleChange('material', e.target.value)} />
        <Field label="Warna" value={local.color !== undefined ? local.color : component.color}
          onChange={(e) => handleChange('color', e.target.value)} />
        <Field label="Deskripsi" as="textarea" rows={2}
          value={local.description !== undefined ? local.description : component.description}
          onChange={(e) => handleChange('description', e.target.value)} />
        <Field label="Z-order" type="number" inputMode="decimal" step="1"
          value={local.zOrder !== undefined ? local.zOrder : component.zOrder}
          onChange={(e) => handleChange('zOrder', e.target.value)}
          hint="Prioritas rendering (rendah = dibelakang)" />
      </div>

      <div className="property-actions">
        <label className="field">
          <span className="field-label">Tampilkan</span>
          <span className="field-control">
            <input
              type="checkbox"
              className="field-input"
              checked={local.visible !== undefined ? local.visible : component.visible}
              onChange={(e) => { setLocal(prev => ({ ...prev, visible: e.target.checked })); setUnsaved(true); }}
            />
          </span>
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
