import { useState } from 'react';
import { ArrowDownToLine, Droplets, Layers, Mountain, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Diagram } from './Diagram';
import { Button, Field, PageHead, Row, Step, useCountUp, useExit } from './Primitives';
import { formatNumber, pipeBottom, totalDepth, totalPipeLength } from '../model';

function Stat({ label, value, unit, decimals = true }) {
  const shown = useCountUp(value);
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        <b>{decimals ? formatNumber(shown) : Math.round(shown)}</b>
        {unit && <i>{unit}</i>}
      </span>
    </div>
  );
}

function StatusLine({ active, label, value, onClear }) {
  return (
    <div className={`status ${active ? 'is-active' : ''}`}>
      <span className="status-dot" />
      <span className="status-text"><b>{label}</b>{active ? value : 'Belum diatur'}</span>
      {active && (
        <button type="button" className="status-clear" onClick={onClear} aria-label={`Hapus ${label}`}><X size={14} /></button>
      )}
    </div>
  );
}

export default function VisualizationPage({ model, setModel, canvasRef, notify }) {
  const [depth, setDepth] = useState('');
  const [diameter, setDiameter] = useState('6');
  const [saringanDepth, setSaringanDepth] = useState('');
  const [saringanSize, setSaringanSize] = useState('3');
  const [openHoleDepth, setOpenHoleDepth] = useState('');
  const [groundLevel, setGroundLevel] = useState('');
  const [matLevel, setMatLevel] = useState('');
  const [saringanError, setSaringanError] = useState('');
  const [openStep, setOpenStep] = useState('pipe');
  const [view, setView] = useState('atur');

  const bottom = pipeBottom(model);
  const toggle = (id) => setOpenStep((current) => (current === id ? null : id));

  const addPipe = (event) => {
    event.preventDefault();
    const value = Number(depth);
    const inch = Number(diameter);
    if (!Number.isFinite(value) || value <= 0) return notify('Masukkan kedalaman pipa yang valid', 'warning');
    if (!Number.isFinite(inch) || inch <= 0 || inch > 24) return notify('Diameter pipa tidak valid', 'warning');
    const start = bottom;
    setModel((current) => ({
      ...current,
      openHole: null,
      pipes: [...current.pipes, {
        id: `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        start,
        end: start + value,
        depth: value,
        diameter: inch,
      }],
    }));
    setDepth('');
    notify(`Pipa ${formatNumber(inch)} inch ditambahkan`, 'success');
  };

  const removePipe = (id) => {
    setModel((current) => {
      const remaining = current.pipes.filter((pipe) => pipe.id !== id);
      let cursor = 0;
      const pipes = remaining.map((pipe) => {
        const start = cursor;
        cursor += pipe.depth;
        return { ...pipe, start, end: start + pipe.depth };
      });
      const newBottom = pipes.length ? pipes[pipes.length - 1].end : 0;
      return {
        ...current,
        pipes,
        screens: current.screens.filter((screen) => screen.depth + screen.size <= newBottom),
        openHole: current.openHole && current.openHole.start <= newBottom ? current.openHole : null,
      };
    });
    notify('Pipa dihapus', 'success');
  };

  const removeScreen = (id) => {
    setModel((current) => ({ ...current, screens: current.screens.filter((screen) => screen.id !== id) }));
    notify('Saringan dihapus', 'success');
  };

  const [leavingPipes, deletePipe] = useExit(removePipe);
  const [leavingScreens, deleteSaringan] = useExit(removeScreen);

  const setGround = (event) => {
    event.preventDefault();
    const value = Number(groundLevel);
    if (groundLevel === '' || !Number.isFinite(value)) return notify('Masukkan nilai titik acuan yang valid', 'warning');
    setModel((current) => ({ ...current, ground: value }));
    setGroundLevel('');
    notify('Titik acuan permukaan tanah diatur', 'success');
  };

  const setMat = (event) => {
    event.preventDefault();
    if (model.ground === null) return notify('Atur titik acuan permukaan tanah terlebih dahulu', 'warning');
    const value = Number(matLevel);
    if (matLevel === '' || !Number.isFinite(value)) return notify('Masukkan nilai MAT yang valid', 'warning');
    setModel((current) => ({ ...current, mat: value }));
    setMatLevel('');
    notify('Muka air tanah (MAT) diatur', 'success');
  };

  const addSaringan = (event) => {
    event.preventDefault();
    const start = Number(saringanDepth);
    const size = Number(saringanSize);
    if (saringanDepth === '' || !Number.isFinite(start) || !Number.isFinite(size) || size <= 0) {
      setSaringanError('Masukkan data saringan yang valid');
      return notify('Masukkan data saringan yang valid', 'warning');
    }
    if (start < 0 || start + size > bottom) {
      setSaringanError(`Kedalaman saringan melebihi panjang pipa. Batas pipa: ${formatNumber(bottom)} m`);
      return notify('Kedalaman saringan melebihi batas pipa', 'warning');
    }
    const newEnd = start + size;
    for (const screen of model.screens) {
      const screenEnd = screen.depth + screen.size;
      if (newEnd > screen.depth && start < screenEnd) {
        setSaringanError(`Saringan tumpang tindih dengan saringan di ${formatNumber(screen.depth)}–${formatNumber(screenEnd)} m`);
        return notify('Saringan tumpang tindih dengan saringan lain', 'warning');
      }
    }
    setSaringanError('');
    setModel((current) => ({
      ...current,
      screens: [...current.screens, {
        id: `screen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        depth: start,
        size,
      }],
    }));
    setSaringanDepth('');
    notify('Saringan ditambahkan', 'success');
  };

  const setOpenHole = (event) => {
    event.preventDefault();
    const size = Number(openHoleDepth);
    if (!Number.isFinite(size) || size <= 0) return notify('Masukkan panjang open hole yang valid', 'warning');
    setModel((current) => ({ ...current, openHole: { start: bottom, end: bottom + size, size } }));
    setOpenHoleDepth('');
    notify('Open hole diatur', 'success');
  };

  const clearGround = () => {
    setModel((current) => ({ ...current, ground: null, mat: null }));
    notify('Titik acuan dihapus', 'success');
  };
  const clearMat = () => setModel((current) => ({ ...current, mat: null }));
  const clearOpenHole = () => setModel((current) => ({ ...current, openHole: null }));

  return (
    <div className="viz" data-view={view}>
      <PageHead
        kicker="Pekerjaan sumur"
        title="Visualisasi Pipa"
        description="Susun pipa, saringan, dan open hole, lalu lihat skemanya terbentuk secara proporsional."
      />

      <div className="seg seg-2 viz-toggle" style={{ '--i': view === 'atur' ? 0 : 1 }} role="tablist">
        <i className="seg-ind" aria-hidden="true" />
        <button type="button" role="tab" aria-selected={view === 'atur'} className={view === 'atur' ? 'is-active' : ''} onClick={() => setView('atur')}>
          <SlidersHorizontal size={15} /><span>Pengaturan</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'diagram'} className={view === 'diagram' ? 'is-active' : ''} onClick={() => setView('diagram')}>
          <Layers size={15} /><span>Diagram</span>
          {model.pipes.length > 0 && <em className="seg-badge">{model.pipes.length}</em>}
        </button>
      </div>

      <div className="viz-grid">
        <div className="viz-controls">
          <Step
            index="01" title="Pipa" open={openStep === 'pipe'} onToggle={() => toggle('pipe')} done={model.pipes.length > 0}
            summary={model.pipes.length ? `${model.pipes.length} segmen · ${formatNumber(bottom)} m` : 'Belum ada'}
          >
            <form onSubmit={addPipe} className="stack">
              <div className="grid-2">
                <Field label="Panjang segmen" unit="m" type="number" inputMode="decimal" step="0.1" placeholder="45" value={depth} onChange={(e) => setDepth(e.target.value)} />
                <Field label="Diameter" unit="inch" type="number" inputMode="decimal" step="0.5" min="0.5" value={diameter} onChange={(e) => setDiameter(e.target.value)} />
              </div>
              <Button type="submit" icon={Plus} className="w-full">Tambah pipa</Button>
            </form>

            {model.pipes.length > 0 && (
              <div className="list">
                {model.pipes.map((pipe, index) => (
                  <Row key={pipe.id} leaving={leavingPipes.has(pipe.id)}>
                    <div className="item">
                      <span className="item-swatch swatch-pipe" />
                      <div className="item-text">
                        <b>Pipa {index + 1}</b>
                        <span className="mono">{formatNumber(pipe.start)}–{formatNumber(pipe.end)} m · {formatNumber(pipe.diameter)}″</span>
                      </div>
                      <button type="button" className="icon-btn" onClick={() => deletePipe(pipe.id)} aria-label={`Hapus pipa ${index + 1}`}><Trash2 size={16} /></button>
                    </div>
                  </Row>
                ))}
              </div>
            )}
          </Step>

          <Step
            index="02" title="Permukaan tanah" open={openStep === 'ground'} onToggle={() => toggle('ground')} done={model.ground !== null}
            summary={model.ground !== null ? `${formatNumber(model.ground)} m` : 'Belum diatur'}
          >
            <form onSubmit={setGround} className="stack">
              <Field label="Titik acuan" unit="m" type="number" inputMode="decimal" step="0.1" placeholder="2.5" hint="Ketinggian titik acuan dari titik nol (permukaan tanah aktual)." value={groundLevel} onChange={(e) => setGroundLevel(e.target.value)} />
              <Button type="submit" variant="soft" icon={Mountain} className="w-full">Atur titik acuan</Button>
            </form>
            <StatusLine active={model.ground !== null} label="Tanah" value={`${formatNumber(model.ground)} m`} onClear={clearGround} />
          </Step>

          <Step
            index="03" title="Muka air tanah" open={openStep === 'mat'} onToggle={() => toggle('mat')} done={model.mat !== null}
            summary={model.mat !== null ? `${formatNumber(model.mat)} m` : 'Belum diatur'}
          >
            <form onSubmit={setMat} className="stack">
              <Field label="Level MAT" unit="m" type="number" inputMode="decimal" step="0.1" placeholder="5" hint="Relatif terhadap titik acuan permukaan tanah." value={matLevel} onChange={(e) => setMatLevel(e.target.value)} />
              <Button type="submit" variant="soft" icon={Droplets} className="w-full">Atur muka air tanah</Button>
            </form>
            <StatusLine active={model.mat !== null} label="MAT" value={`${formatNumber(model.mat)} m dari muka tanah`} onClear={clearMat} />
          </Step>

          <Step
            index="04" title="Saringan" open={openStep === 'screen'} onToggle={() => toggle('screen')} done={model.screens.length > 0}
            summary={model.screens.length ? `${model.screens.length} saringan` : 'Belum ada'}
          >
            <form onSubmit={addSaringan} className="stack">
              <div className="grid-2">
                <Field label="Mulai dari" unit="m" type="number" inputMode="decimal" step="0.1" placeholder="15" value={saringanDepth} onChange={(e) => { setSaringanDepth(e.target.value); setSaringanError(''); }} />
                <Field label="Panjang" unit="m" type="number" inputMode="decimal" step="0.1" value={saringanSize} onChange={(e) => { setSaringanSize(e.target.value); setSaringanError(''); }} />
              </div>
              {saringanError && <p className="form-error" role="alert">{saringanError}</p>}
              <Button type="submit" variant="soft" icon={Plus} className="w-full">Tambah saringan</Button>
            </form>

            {model.screens.length > 0 && (
              <div className="list">
                {model.screens.map((screen, index) => (
                  <Row key={screen.id} leaving={leavingScreens.has(screen.id)}>
                    <div className="item">
                      <span className="item-swatch swatch-screen" />
                      <div className="item-text">
                        <b>Saringan {index + 1}</b>
                        <span className="mono">{formatNumber(screen.depth)}–{formatNumber(screen.depth + screen.size)} m</span>
                      </div>
                      <button type="button" className="icon-btn" onClick={() => deleteSaringan(screen.id)} aria-label={`Hapus saringan ${index + 1}`}><Trash2 size={16} /></button>
                    </div>
                  </Row>
                ))}
              </div>
            )}
          </Step>

          <Step
            index="05" title="Open hole" open={openStep === 'hole'} onToggle={() => toggle('hole')} done={!!model.openHole}
            summary={model.openHole ? `${formatNumber(model.openHole.size)} m` : 'Opsional'}
          >
            <form onSubmit={setOpenHole} className="stack">
              <Field label="Panjang open hole" unit="m" type="number" inputMode="decimal" step="0.1" placeholder="5" hint="Bagian terbuka di bawah pipa terakhir. Contoh: 5 m berarti 5 m tanpa casing di bawah pipa." value={openHoleDepth} onChange={(e) => setOpenHoleDepth(e.target.value)} />
              <Button type="submit" variant="soft" icon={ArrowDownToLine} className="w-full">Atur open hole</Button>
            </form>
            <StatusLine active={!!model.openHole} label="Open hole" value={model.openHole ? `${formatNumber(model.openHole.start)}–${formatNumber(model.openHole.end)} m` : ''} onClear={clearOpenHole} />
          </Step>
        </div>

        <aside className="viz-stage">
          <div className="stats">
            <Stat label="Total pipa" value={totalPipeLength(model)} unit="m" />
            <Stat label="Kedalaman sumur" value={totalDepth(model)} unit="m" />
            <Stat label="Saringan" value={model.screens.length} decimals={false} />
          </div>
          <Diagram ref={canvasRef} model={model} />
        </aside>
      </div>
    </div>
  );
}
