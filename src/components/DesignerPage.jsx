import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RotateCcw, Undo, Redo, Save, Trash2, X, Settings } from 'lucide-react';
import { Button, PageHead } from './Primitives';
import { useProject } from '../context/ProjectContext';
import { DesignerCanvas } from './DesignerCanvas';
import ComponentToolbar from './ComponentToolbar';
import PropertiesPanel from './PropertiesPanel';
import CanvasControls from './CanvasControls';
import DesignerValidationPanel from './DesignerValidationPanel';
import {
  emptyDesigner, createComponent, normalizeDesigner,
  totalWellDepth, COMPONENT_DEFAULTS, INTERVAL_TYPES,
} from '../designer/model';
import { validateComponents } from '../designer/validation';
import { createHistory } from '../designer/history';
import { legacyToDesigner, hasDesignerData, hasLegacyData } from '../designer/adapter';

export default function DesignerPage({ notify }) {
  const {
    activeWellId, activeWell, activeProject,
    saveActiveWellData, loadActiveWellData,
  } = useProject();

  // Designer state tied to active well
  const [designer, setDesigner] = useState(emptyDesigner());
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState([]);
  const [propsDrawerOpen, setPropsDrawerOpen] = useState(false);
  const canvasRef = useRef(null);

  // Initialize history when designer loads
  useEffect(() => {
    setHistory(createHistory(designer));
  }, []);

  // Handle body scroll lock for tablet props drawer
  useEffect(() => {
    if (propsDrawerOpen) {
      document.body.classList.add('props-drawer-open');
    } else {
      document.body.classList.remove('props-drawer-open');
    }
    return () => document.body.classList.remove('props-drawer-open');
  }, [propsDrawerOpen]);

  // Handle Escape key to close props drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && propsDrawerOpen) {
        setPropsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [propsDrawerOpen]);

  // Load designer state when active well changes
  useEffect(() => {
    if (!activeWellId) {
      setDesigner(emptyDesigner());
      if (history) history.clear();
      return;
    }
    const data = loadActiveWellData();
    const wellData = data || {};
    
    // Check if Designer data exists
    const designerExists = hasDesignerData(wellData);
    const legacyExists = hasLegacyData(wellData);
    
    let next;
    if (designerExists) {
      // Use existing Designer data
      const saved = wellData.model?.designer || wellData.designer;
      next = normalizeDesigner(saved);
    } else if (legacyExists) {
      // Migrate from legacy model
      const legacyModel = wellData.model || {};
      const migrated = legacyToDesigner(legacyModel);
      next = normalizeDesigner(migrated);
    } else {
      // Start fresh
      next = emptyDesigner();
    }
    
    setDesigner(next);
    if (history) {
      history.clear();
      history.push(next);
    }
    setDirty(false);
    setSelectedId(null);
  }, [activeWellId, loadActiveWellData, history]);

  // Compute derived values
  const components = useMemo(() => designer.components || [], [designer]);
  const config = useMemo(() => ({
    ...designer.config,
    totalWellDepth: totalWellDepth(components),
  }), [designer.config, components]);

  // Run validation whenever components/config change
  useEffect(() => {
    const nextIssues = validateComponents(components, config);
    setIssues(nextIssues);
  }, [components, config]);

  // Save to storage (autosave + manual)
  const saveDesigner = useCallback((message = 'Desain sumur berhasil disimpan.') => {
    if (!activeWellId) return false;
    const ok = saveActiveWellData({
      well: activeWell ? { ...activeWell.well } : {},
      model: { ...(activeWell?.model || {}), designer },
      activity: activeWell ? { ...activeWell.activity } : {},
    });
    if (ok) {
      setDirty(false);
      if (history) history.replaceCurrent(designer);
      notify(message, 'success');
    }
    return ok;
  }, [activeWellId, activeWell, saveActiveWellData, designer, history, notify]);

  // Autosave on designer changes
  useEffect(() => {
    if (!activeWellId) return;
    if (!dirty) return;
    const t = setTimeout(() => saveDesigner('Desain tersimpan otomatis.'), 1500);
    return () => clearTimeout(t);
  }, [dirty, activeWellId, saveDesigner]);

  // --- Actions ---

  const addComponent = useCallback((props) => {
    const comp = createComponent(props.type, props);
    const next = {
      ...designer,
      components: [...components, comp],
      config: { ...config, totalWellDepth: totalWellDepth([...components, comp]) },
    };
    setDesigner(next);
    setSelectedId(comp.id);
    setDirty(true);
    notify(`Komponen ${COMPONENT_DEFAULTS[props.type]?.name || props.type} ditambahkan`, 'success');
  }, [designer, components, config, setDirty, notify]);

  const updateComponent = useCallback((updated) => {
    const next = {
      ...designer,
      components: (designer.components || []).map(c => c.id === updated.id ? { ...c, ...updated } : c),
      config: { ...config, totalWellDepth: totalWellDepth((designer.components || []).map(c => c.id === updated.id ? { ...c, ...updated } : c)) },
    };
    setDesigner(next);
    setDirty(true);
  }, [designer, config]);

  const deleteComponent = useCallback((id) => {
    const next = {
      ...designer,
      components: (designer.components || []).filter(c => c.id !== id),
      config: { ...config, totalWellDepth: totalWellDepth((designer.components || []).filter(c => c.id !== id)) },
    };
    setDesigner(next);
    setSelectedId(null);
    setDirty(true);
    notify('Komponen dihapus', 'success');
  }, [designer, config, setDirty, notify]);

  const duplicateComponent = useCallback((id) => {
    const src = (designer.components || []).find(c => c.id === id);
    if (!src) return;
    const copy = { ...src, id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: (src.name || '') + ' (Salinan)' };
    const next = {
      ...designer,
      components: [...(designer.components || []), copy],
      config: { ...config, totalWellDepth: totalWellDepth([...(designer.components || []), copy]) },
    };
    setDesigner(next);
    setSelectedId(copy.id);
    setDirty(true);
    notify('Komponen diduplikasi', 'success');
  }, [designer, config, setDirty, notify]);

  const toggleVisibility = useCallback((id) => {
    const next = {
      ...designer,
      components: (designer.components || []).map(c => c.id === id ? { ...c, visible: !c.visible } : c),
    };
    setDesigner(next);
    setDirty(true);
  }, [designer, setDirty]);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const undo = useCallback(() => {
    if (!history || !history.canUndo) return;
    const prev = history.undo();
    if (prev) {
      setDesigner(prev);
      setSelectedId(null);
      setDirty(true);
      notify('Dibatalkan (undo)', 'info');
    }
  }, [history, setDirty, notify]);

  const redo = useCallback(() => {
    if (!history || !history.canRedo) return;
    const next = history.redo();
    if (next) {
      setDesigner(next);
      setSelectedId(null);
      setDirty(true);
      notify('Dihasilkan ulang (redo)', 'info');
    }
  }, [history, setDirty, notify]);

  const resetDesigner = async () => {
    const ok = await window.confirm('Reset seluruh desain komponen untuk sumur ini?');
    if (!ok) return;
    const next = emptyDesigner();
    setDesigner(next);
    setSelectedId(null);
    setDirty(true);
    if (history) { history.clear(); history.push(next); }
    notify('Desain direset', 'success');
  };

  const exportPng = useCallback(() => {
    canvasRef.current?.exportPNG();
    notify('PNG diekspor', 'success');
  }, [notify]);

  if (!activeWellId) {
    return (
      <div className="designer-page">
        <PageHead kicker="03 · Desain Sumur" title="Desainer Konstruksi Sumur"
          description="Pilih atau buat sumur dari halaman Proyek untuk mulai merancang konstruksi." />
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <RotateCcw size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
          <h3>Belum ada sumur aktif</h3>
          <p>Pilih atau buat sumur dari halaman Proyek untuk memulai desain konstruksi.</p>
        </div>
      </div>
    );
  }

  const hasErrors = issues.some(i => i.level === 'error');

  return (
    <div className="designer-page">
      <PageHead kicker="03 · Desain Sumur" title="Desainer Konstruksi Sumur"
        description="Rancang komponen sumur bor dengan kedalangan, diameter, dan validasi teknis.">
        <div className="page-head-aside">
          <Button variant="ghost" icon={Undo} onClick={undo} disabled={!history || !history.canUndo}>
            Undo
          </Button>
          <Button variant="ghost" icon={Redo} onClick={redo} disabled={!history || !history.canRedo}>
            Redo
          </Button>
          <Button variant="primary" icon={Save} onClick={() => saveDesigner()} disabled={!dirty}>
            Simpan Desain
          </Button>
        </div>
      </PageHead>

      <div className="designer-grid">
        {/* Left: Toolbar */}
        <aside className="toolbar-col">
          <ComponentToolbar onAddComponent={addComponent} />
        </aside>

        {/* Center: Canvas + Controls */}
        <section className="canvas-col">
          <div className="canvas-header">
            <h2>Kanvas Desain</h2>
            <span className="canvas-info">
              {components.length} komponen · kedalangan total {config.totalWellDepth.toFixed(1)} m
            </span>
          </div>
          <div className="canvas-stage">
            <DesignerCanvas
              ref={canvasRef}
              components={components}
              config={config}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showGrid={true}
            />
            <CanvasControls canvasRef={canvasRef} onExportPNG={exportPng} />
          </div>
          <DesignerValidationPanel issues={issues} />
          {hasErrors && (
            <div className="validation-banner error">
              <X size={14} /> Ada {issues.filter(i => i.level === 'error').length} error yang harus diperbaiki sebelum mengeksport.
            </div>
          )}
        </section>

        {/* Right: Properties */}
        <aside className="properties-col">
          <PropertiesPanel
            component={components.find(c => c.id === selectedId) || null}
            onUpdate={updateComponent}
            onDuplicate={duplicateComponent}
            onDelete={deleteComponent}
            onVisibilityToggle={toggleVisibility}
          />
        </aside>
      </div>

      {/* Tablet: Floating properties button (768-1024px) */}
      {selectedId && (
        <button
          className="floating-props-btn"
          onClick={() => setPropsDrawerOpen(true)}
          aria-label="Buka panel properti"
          title="Buka panel properti"
        >
          <Settings size={22} />
        </button>
      )}

      {/* Tablet: Properties drawer (768-1024px) */}
      <div className={`props-drawer-scrim ${propsDrawerOpen ? 'is-open' : ''}`} onClick={() => setPropsDrawerOpen(false)} aria-hidden="true" />
      <aside className={`props-drawer ${propsDrawerOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Properti komponen">
        <div className="props-drawer-header">
          <h2>Properti Komponen</h2>
          <button
            type="button"
            className="props-drawer-close"
            onClick={() => setPropsDrawerOpen(false)}
            aria-label="Tutup panel properti"
          >
            <X size={20} />
          </button>
        </div>
        <div className="props-drawer-body">
          <PropertiesPanel
            component={components.find(c => c.id === selectedId) || null}
            onUpdate={updateComponent}
            onDuplicate={duplicateComponent}
            onDelete={deleteComponent}
            onVisibilityToggle={toggleVisibility}
          />
        </div>
        <div className="props-drawer-footer">
          <Button variant="ghost" onClick={() => setPropsDrawerOpen(false)} className="w-full">
            Tutup
          </Button>
        </div>
      </aside>

      {/* Bottom: full-width action bar */}
      <div className="designer-actions">
        <Button variant="ghost" icon={Undo} onClick={undo} disabled={!history || !history.canUndo} className="hide-sm">
          Undo
        </Button>
        <Button variant="ghost" icon={Redo} onClick={redo} disabled={!history || !history.canRedo} className="hide-sm">
          Redo
        </Button>
        <Button variant="outline" icon={Trash2} onClick={resetDesigner} className="hide-sm">
          Reset Desain
        </Button>
        <Button variant="primary" icon={Save} onClick={() => saveDesigner()} disabled={!dirty} className="w-auto">
          Simpan Desain
        </Button>
        <Button variant="primary" icon={RotateCcw} onClick={exportPng} className="show-sm w-auto">
          Ekspor PNG
        </Button>
      </div>
    </div>
  );
}
