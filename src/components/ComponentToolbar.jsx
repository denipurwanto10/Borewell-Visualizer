import { useState } from 'react';
import { Cpu, Droplets, HardHat, Shield, Activity, Layers, Package, Zap, Settings } from 'lucide-react';
import { Button } from './Primitives';
import {
  COMPONENT_CATEGORIES, COMPONENT_LABELS, COMPONENT_DEFAULTS,
  INTERVAL_TYPES, MARKER_TYPES,
} from '../designer/model';

const ICONS = {
  surface_casing: HardHat, production_casing: Cpu, blank_casing: Package,
  screen_pipe: Activity, open_hole: Layers, gravel_pack: Droplets,
  cement_grouting: Shield, well_cap: Shield,
  submersible_pump: Zap, pump_position: Settings, water_level_marker: Droplets,
};

const CAT_COLORS = {
  casing: '#0d5f5a',
  filter: '#a8530a',
  protection: '#1e4fb8',
  equipment: '#2f7a4f',
};

export default function ComponentToolbar({ onAddComponent }) {
  const [category, setCategory] = useState('casing');

  const addByType = (type) => {
    const defaults = COMPONENT_DEFAULTS[type] || {};
    onAddComponent({
      type,
      name: defaults.name,
      outerDiameter: defaults.outerDiameter,
      innerDiameter: defaults.innerDiameter,
      material: defaults.material,
      color: defaults.color,
    });
  };

  return (
    <section className="component-toolbar">
      <div className="toolbar-head">
        <span className="toolbar-tag">Komponen Konstruksi</span>
        <div className="category-tabs">
          {Object.entries(COMPONENT_CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              type="button"
              className={`cat-tab ${category === key ? 'is-active' : ''}`}
              onClick={() => setCategory(key)}
              style={{ borderColor: CAT_COLORS[key], color: category === key ? CAT_COLORS[key] : 'var(--mute)' }}
            >
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="component-grid">
        {COMPONENT_CATEGORIES[category].types.map((type) => {
          const Icon = ICONS[type];
          const defaults = COMPONENT_DEFAULTS[type] || {};
          const isInterval = INTERVAL_TYPES.has(type);
          return (
            <button
              key={type}
              type="button"
              className="comp-btn"
              onClick={() => addByType(type)}
              title={COMPONENT_LABELS[type] || type}
            >
              <div className="comp-icon">
                <Icon size={16} strokeWidth={2} />
              </div>
              <span className="comp-name">{COMPONENT_LABELS[type] || type}</span>
              {isInterval && (
                <span className="comp-hint">interval kedalaman</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="toolbar-note">
        Pilih kategori, lalu ketuk jenis komponen untuk menambahkannya ke desain. Komponen interval
        menempati rentang kedalaman; komponen penanda adalah titik pada kedalaman tertentu.
      </div>
    </section>
  );
}
