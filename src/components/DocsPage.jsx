import { useState } from 'react';
import { Camera, Plus, RotateCcw, Save, X } from 'lucide-react';
import { Button, PageHead } from './Primitives';
import { ACTIVITY_KEYS } from '../model';
import { readImageFile } from '../hooks';

const CATEGORIES = {
  doc1: { title: 'Papan nama lokasi penyelidikan', description: 'papan nama lokasi' },
  doc2: { title: 'Kenampakan sumur bor produksi', description: 'sumur bor produksi' },
  doc3: { title: 'Persiapan pengukuran borehole camera', description: 'persiapan pengukuran' },
  doc4: { title: 'Kegiatan pengukuran borehole camera', description: 'kegiatan pengukuran' },
  doc5: { title: 'Ukuran pipa PVC (casing sumur)', description: 'pipa PVC casing' },
  doc6: { title: 'Pompa submersible', description: 'pompa submersible' },
};

function Category({ index, id, items, onFiles, onRemove }) {
  const [drag, setDrag] = useState(false);
  const full = items.length >= 3;
  return (
    <section className={`doc ${full ? 'is-full' : ''}`}>
      <header className="doc-head">
        <span className="doc-num mono">{String(index + 1).padStart(2, '0')}</span>
        <h3>{CATEGORIES[id].title}</h3>
        <span className="doc-count mono">{items.length}/3</span>
      </header>
      <div className="doc-bar"><i style={{ transform: `scaleX(${items.length / 3})` }} /></div>

      <div className="doc-tiles">
        {items.map((item, i) => (
          <figure className="tile" key={item.id} style={{ '--d': `${i * 50}ms` }}>
            <img src={item.dataUrl} alt={`${CATEGORIES[id].title} ${i + 1}`} loading="lazy" />
            <button type="button" className="slot-remove" onClick={() => onRemove(id, item.id)} aria-label="Hapus foto"><X size={15} /></button>
          </figure>
        ))}
        {!full && (
          <label
            className={`tile tile-add ${drag ? 'is-drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(Array.from(e.dataTransfer.files), id); }}
          >
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(Array.from(e.target.files || []), id); e.target.value = ''; }} />
            <span className="slot-plus">{items.length ? <Plus size={20} strokeWidth={1.8} /> : <Camera size={20} strokeWidth={1.7} />}</span>
            <small>{items.length ? 'Tambah foto' : `Foto ${CATEGORIES[id].description}`}</small>
          </label>
        )}
      </div>
    </section>
  );
}

export default function DocsPage({ activity, setActivity, notify, onSave, onReset }) {
  const onFiles = async (files, key) => {
    if (!files.length) return;
    const current = activity[key] || [];
    const remaining = 3 - current.length;
    if (remaining <= 0) return notify('Maksimal 3 foto per kategori.', 'warning');
    const accepted = files.slice(0, remaining);
    const skipped = files.slice(remaining);
    const previews = [];
    for (const file of accepted) {
      try {
        previews.push({
          id: `${key}-${Date.now()}-${Math.random()}`,
          name: file.name,
          dataUrl: await readImageFile(file),
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        notify(error.message, 'error');
      }
    }
    if (previews.length) {
      setActivity((value) => ({ ...value, [key]: [...(value[key] || []), ...previews].slice(0, 3) }));
      notify(`${previews.length} foto ditambahkan.`, 'success');
    }
    if (skipped.length) notify(`${skipped.length} file dilewati karena batas 3 foto.`, 'info');
  };

  const remove = (key, id) => {
    setActivity((value) => ({ ...value, [key]: (value[key] || []).filter((item) => item.id !== id) }));
    notify('Foto dihapus dari dokumentasi.', 'success');
  };

  const total = ACTIVITY_KEYS.reduce((sum, key) => sum + (activity[key]?.length || 0), 0);

  return (
    <div className="docs">
      <PageHead
        kicker="03 · Dokumentasi"
        title="Dokumentasi kegiatan"
        description="Foto kegiatan borehole camera di lapangan. Setiap kategori menampung hingga tiga foto."
      >
        <div className="tally"><b className="mono">{total}</b><span>/ 18 foto</span></div>
      </PageHead>

      <div className="docs-grid">
        {ACTIVITY_KEYS.map((key, index) => (
          <Category key={key} id={key} index={index} items={activity[key] || []} onFiles={onFiles} onRemove={remove} />
        ))}
      </div>
    </div>
  );
}