import { useState, useEffect, useRef } from 'react';
import { ImagePlus, RotateCcw, Save, X, Check } from 'lucide-react';
import { Button, Field, PageHead } from './Primitives';
import { PROVINCES } from '../model';
import { readImageFile } from '../hooks';

const PHOTOS = [
  ['wellPhoto', 'Foto sumur bor', 'Tampak keseluruhan sumur'],
  ['borehole1', 'Ujung pipa awal', 'Titik awal pipa'],
  ['borehole2', 'Muka air tanah', 'Kondisi air tanah'],
  ['borehole3', 'Batas pipa', 'Ujung bawah pipa'],
  ['borehole4', 'Screen perforasi', 'Lokasi screen'],
  ['borehole5', 'Dasar sumur bor', 'Dasar lubang bor'],
];

function PhotoSlot({ id, title, hint, src, onFile, onRemove }) {
  const [drag, setDrag] = useState(false);
  const pick = (files) => { const file = files?.[0]; if (file) onFile(file); };
  return (
    <div className={`slot ${src ? 'has-image' : ''} ${drag ? 'is-drag' : ''}`}>
      <label
        className="slot-drop"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      >
        <input id={`data-${id}`} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        {src && <img src={src} alt={title} />}
        <span className="slot-empty">
          <span className="slot-plus"><ImagePlus size={20} strokeWidth={1.7} /></span>
          <b>{title}</b>
          <small>{hint}</small>
        </span>
        <span className="slot-cap">{title}</span>
      </label>
      {src && <button type="button" className="slot-remove" onClick={onRemove} aria-label={`Hapus ${title}`}><X size={15} /></button>}
    </div>
  );
}

export default function DataPage({ well, setWell, notify, onSave, onReset }) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const initialWellRef = useRef(well);

  // Track dirty state - compare with initial well data
  useEffect(() => {
    const initial = initialWellRef.current;
    const hasChanges = JSON.stringify(well) !== JSON.stringify(initial);
    setDirty(hasChanges);
  }, [well]);

  const update = (key) => (event) => {
    setWell((current) => ({ ...current, [key]: event.target.value }));
    setDirty(true);
  };
  const bind = (key) => ({ value: well[key] || '', onChange: update(key) });

  const onBoreholePhoto = async (file, key) => {
    try {
      const dataUrl = await readImageFile(file);
      setWell((current) => ({ ...current, boreholeImages: { ...current.boreholeImages, [key]: dataUrl } }));
      setDirty(true);
      notify('Foto borehole berhasil disimpan.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const removePhoto = (key) => setWell((current) => {
    const next = { ...current.boreholeImages };
    delete next[key];
    return { ...current, boreholeImages: next };
  });

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      onSave?.();
      initialWellRef.current = well;
      setDirty(false);
      setSaveStatus('success');
      notify('Data sumur bor berhasil disimpan.', 'success');
    } catch (error) {
      setSaveStatus('error');
      notify('Gagal menyimpan data.', 'error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const photoCount = PHOTOS.filter(([key]) => well.boreholeImages?.[key]).length;

  return (
    <div className="data">
      <PageHead
        kicker="02 · Data sumur"
        title="Data sumur bor"
        description="Informasi perusahaan, lokasi, dan teknis sumur untuk dicantumkan pada laporan."
      />

      <div className="data-grid">
        <section className="panel span-7">
          <div className="panel-head"><span className="panel-tag">A</span><h2>Perusahaan &amp; lokasi</h2></div>
          <div className="form-grid">
            <Field label="Nama perusahaan" placeholder="PT. Geotama Teknik" {...bind('companyName')} className="col-2" />
            <Field label="Nomor urut sumur dangkal" placeholder="SWB-001" {...bind('shallowWellNumber')} />
            <Field label="Tanggal pelaksanaan" type="date" {...bind('boreholeDate')} />
            <Field label="Alamat" as="textarea" rows={3} placeholder="Jl. Gejayan No. 10, Yogyakarta" {...bind('address')} className="col-2" />
            <Field label="Provinsi" as="select" {...bind('province')} className="col-2">
              <option value="">Pilih provinsi</option>
              {PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Field>
            <Field label="Kabupaten / kota" placeholder="Bandung" {...bind('city')} />
            <Field label="Kecamatan" placeholder="Cicendo" {...bind('district')} />
            <Field label="Desa / kelurahan" placeholder="Pasirkaliki" {...bind('village')} className="col-2" />
            <Field label="Latitude" type="number" inputMode="decimal" step="0.0001" placeholder="-7.7821" {...bind('latitude')} />
            <Field label="Longitude" type="number" inputMode="decimal" step="0.0001" placeholder="110.3671" {...bind('longitude')} />
            <Field label="Elevasi" unit="mdpl" type="number" inputMode="decimal" step="0.1" placeholder="0" {...bind('elevation')} className="col-2" />
          </div>
        </section>

        <section className="panel span-5">
          <div className="panel-head"><span className="panel-tag">B</span><h2>Informasi teknis</h2></div>
          <div className="form-grid one">
            <Field label="Nomor urut sumur bor" placeholder="SUM-001" {...bind('wellNumber')} />
            <Field label="Jarak piezometer ke sumur" unit="m" type="number" inputMode="decimal" step="0.1" min="0" placeholder="12" {...bind('piezoDistance')} />
            <Field label="Jenis / kapasitas pompa" placeholder="Submersible 2 HP" {...bind('pumpType')} />
            <Field label="Posisi pompa" unit="m" type="number" inputMode="decimal" step="0.1" min="0" placeholder="Kedalaman pompa" hint="Kedalaman pompa dari permukaan tanah." {...bind('pumpPosition')} />
          </div>
        </section>

        <section className="panel span-12">
          <div className="panel-head">
            <span className="panel-tag">C</span><h2>Dokumentasi borehole</h2>
            <span className="panel-count mono">{photoCount}/{PHOTOS.length}</span>
          </div>
          <p className="panel-note">JPG, PNG, atau GIF dengan ukuran maksimal 5 MB. Seret file ke kotak atau ketuk untuk memilih.</p>
          <div className="slots">
            {PHOTOS.map(([key, title, hint]) => (
              <PhotoSlot
                key={key} id={key} title={title} hint={hint}
                src={well.boreholeImages?.[key]}
                onFile={(file) => onBoreholePhoto(file, key)}
                onRemove={() => removePhoto(key)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Save Bar */}
      <div className="savebar" role="status" aria-live="polite">
        {dirty && (
          <>
            <span className="savebar-status mono" aria-label="Perubahan belum disimpan">
              <Save size={14} strokeWidth={2} /> Perubahan belum disimpan
            </span>
            <Button variant="primary" icon={Save} loading={saving} onClick={handleSave} disabled={!dirty || saving}>
              Simpan
            </Button>
          </>
        )}
        {!dirty && !saving && (
          <>
            <span className="savebar-status mono saved" aria-label="Semua perubahan tersimpan">
              <Check size={14} strokeWidth={2} /> Semua perubahan tersimpan
            </span>
            <Button variant="ghost" icon={Save} onClick={handleSave} disabled={saving}>
              Simpan
            </Button>
          </>
        )}
        {saveStatus === 'success' && (
          <span className="savebar-toast success mono" aria-label="Disimpan">
            <Check size={14} strokeWidth={2} /> Tersimpan
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="savebar-toast error mono" aria-label="Gagal menyimpan">
            <X size={14} strokeWidth={2} /> Gagal menyimpan
          </span>
        )}
      </div>

    </div>
  );
}
