// Phase 6 — Report Builder Page
// Build and preview well completion reports before PDF export

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  FileText, Download, Eye, X, ChevronDown, ChevronUp,
  Check, CheckSquare, Square, Image, FilePlus, RotateCcw,
  Settings, ArrowUp, ArrowDown, Trash2, Edit, Copy,
  AlertTriangle, Info, Save, Loader2,
} from 'lucide-react';
import { Button, Field, PageHead, useConfirm } from '../components/Primitives';
import { useProject } from '../context/ProjectContext';
import { downloadBoreholePdf } from '../pdf';
import { getWellData } from '../storage/projectStorage';
import {
  REPORT_SECTIONS,
  getWellDocumentation,
  formatFileSize,
  retrieveFile,
} from '../storage/documentationStorage';
import { fileAPI } from '../api/client';

const SECTION_DEFAULTS = REPORT_SECTIONS.reduce((acc, s) => ({ ...acc, [s.id]: s.default }), {});

function SectionToggle({ section, enabled, onToggle, photoCount, docCount, disabled }) {
  return (
    <label className={`section-toggle ${enabled ? 'enabled' : ''} ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={() => !disabled && onToggle(section.id)}
        disabled={disabled}
        aria-label={section.label}
      />
      <span className="toggle-check">
        <Check size={14} strokeWidth={3} />
      </span>
      <span className="toggle-label">{section.label}</span>
      <span className="toggle-meta">
        {photoCount > 0 && <span className="meta-item"><Image size={14} />{photoCount} foto</span>}
        {docCount > 0 && <span className="meta-item"><FileText size={14} />{docCount} dok</span>}
      </span>
    </label>
  );
}

function PhotoSelector({ photos, selectedIds, onToggle, onSelectAll, onClear, maxPreview = 20 }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="photo-selector">
      <div className="selector-header">
        <h4>Pilih Foto Dokumentasi</h4>
        <div className="selector-actions">
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={selectedIds.size === photos.length}>Pilih Semua ({photos.length})</Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={selectedIds.size === 0}>Bersihkan</Button>
        </div>
      </div>
      <div className={`selector-grid ${!expanded ? 'collapsed' : ''}`}>
        {photos.slice(0, maxPreview).map(photo => (
          <label key={photo.id} className={`photo-check ${selectedIds.has(photo.id) ? 'selected' : ''}`}>
            <input type="checkbox" checked={selectedIds.has(photo.id)} onChange={() => onToggle(photo.id)} />
            {(previewUrls[photo.id] || photo.fileRef) && photo.fileType?.startsWith('image/') && (
              <img src={previewUrls[photo.id] || photo.fileRef} alt={photo.name} loading="lazy" />
            )}
            <span className="photo-name">{photo.name}</span>
            <span className="photo-category">{photo.category}</span>
          </label>
        ))}
        {photos.length > maxPreview && (
          <button type="button" className="expand-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{expanded ? 'Tutup' : `Tampilkan ${photos.length - maxPreview} foto lagi`}</span>
          </button>
        )}
      </div>
      <p className="selector-hint">Dipilih: <strong>{selectedIds.size}</strong> dari {photos.length} foto</p>
    </div>
  );
}

function ReportMetadataForm({ metadata, onChange }) {
  return (
    <div className="report-metadata">
      <h4>Identitas Laporan</h4>
      <div className="form-grid">
        <Field label="Judul Laporan" placeholder="Laporan Penyelesaian Sumur Bor" {...{ value: metadata.title, onChange: e => onChange({ title: e.target.value }) }} className="col-2" />
        <Field label="Nomor Laporan" placeholder="RPT-2024-001" {...{ value: metadata.reportNumber, onChange: e => onChange({ reportNumber: e.target.value }) }} />
        <Field label="Revisi" placeholder="0" type="number" min="0" {...{ value: metadata.revision, onChange: e => onChange({ revision: e.target.value || '0' }) }} />
        <Field label="Tanggal Laporan" type="date" {...{ value: metadata.reportDate, onChange: e => onChange({ reportDate: e.target.value }) }} />
        <Field label="Disusun oleh" placeholder="Nama Engineer/Geolog" {...{ value: metadata.preparedBy, onChange: e => onChange({ preparedBy: e.target.value }) }} className="col-2" />
        <Field label="Ditinjau oleh" placeholder="Nama Reviewer (opsional)" {...{ value: metadata.reviewedBy, onChange: e => onChange({ reviewedBy: e.target.value }) }} className="col-2" />
        <Field label="Logo Perusahaan" as="file" accept="image/*" onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => onChange({ logoDataUrl: reader.result });
            reader.readAsDataURL(file);
          }
        }} />
        {metadata.logoDataUrl && (
          <div className="logo-preview">
            <img src={metadata.logoDataUrl} alt="Logo" />
            <button type="button" className="icon-btn" onClick={() => onChange({ logoDataUrl: null })} aria-label="Hapus logo"><X size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function NotesSection({ notes, onChange }) {
  return (
    <div className="notes-section">
      <h4>Catatan Teknis & Kesimpulan</h4>
      <Field label="Catatan teknis" as="textarea" rows={4} placeholder="Catatan tambahan mengenai konstruksi, kondisi lapangan, material, dll." {...{ value: notes.technical, onChange: e => onChange({ technical: e.target.value }) }} className="col-2" />
      <Field label="Kesimpulan" as="textarea" rows={4} placeholder="Kesimpulan dan rekomendasi dari engineer..." {...{ value: notes.conclusion, onChange: e => onChange({ conclusion: e.target.value }) }} className="col-2" />
    </div>
  );
}

export default function ReportBuilderPage({ notify }) {
  const { activeWellId, activeWell, activeProjectId, activeProject, loadActiveWellData, isAuthenticated, getPhotos, getDocuments } = useProject();
  const [confirm, confirmDialog] = useConfirm();

  const [sections, setSections] = useState({ ...SECTION_DEFAULTS });
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [metadata, setMetadata] = useState({
    title: 'Laporan Penyelesaian Sumur Bor',
    reportNumber: '',
    revision: '0',
    reportDate: new Date().toISOString().split('T')[0],
    preparedBy: '',
    reviewedBy: '',
    logoDataUrl: null,
  });
  const [notes, setNotes] = useState({
    technical: '',
    conclusion: '',
  });
  const [previewMode, setPreviewMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [wellData, setWellData] = useState(null);
  const [designer, setDesigner] = useState(null);
  const [geology, setGeology] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [previewUrls, setPreviewUrls] = useState({});
  const [errors, setErrors] = useState({});

  // Load data
  useEffect(() => {
    if (!activeWellId) return;
    const data = loadActiveWellData();
    setWellData(data);
    setDesigner(data?.model?.designer || null);
    setGeology(data?.model?.geologicalLog || null);
    setMonitoring(data?.model?.groundwaterMonitoring || null);

    if (isAuthenticated) {
      // API mode: fetch photos and documents from backend
      Promise.all([
        getPhotos('well', activeWellId),
        getDocuments('well', activeWellId),
      ]).then(async ([photoList, docList]) => {
        setPhotos(photoList);
        setDocuments(docList);

        // Create object URLs for previewable photos (API requires Bearer token, img tag can't send it)
        const urls = {};
        for (const p of photoList) {
          if (p.fileRef && p.file_type?.startsWith('image/')) {
            try {
              urls[p.id] = await fileAPI.getBlobUrl(p.fileRef.split('/').pop());
            } catch (e) {
              console.warn('Failed to create preview URL for photo', p.id, e);
            }
          }
        }
        setPreviewUrls(urls);
      }).catch(err => {
        console.error('Failed to load documentation for report:', err);
        setPhotos([]);
        setDocuments([]);
      });
    } else {
      // LocalStorage mode
      const docs = getWellDocumentation(activeWellId);
      setPhotos(docs.photos || []);
      setDocuments(docs.documents || []);
    }

    // Auto-fill metadata
    const well = activeWell?.well;
    const project = activeProject;
    if (well) {
      setMetadata(prev => ({
        ...prev,
        title: `Laporan Penyelesaian Sumur ${well.wellName}`,
        reportNumber: `RPT-${well.wellCode}-${new Date().getFullYear()}`,
        preparedBy: well.companyName || '',
      }));
    }
  }, [activeWellId, activeWell, activeProject, loadActiveWellData, isAuthenticated, getPhotos, getDocuments]);

  // Cleanup object URLs on unmount or photo change
  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Section handlers
  const toggleSection = (id) => {
    setSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePhotoToggle = (id) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPhotos = () => {
    setSelectedPhotos(new Set(photos.map(p => p.id)));
  };

  const clearPhotos = () => {
    setSelectedPhotos(new Set());
  };

  // Validate before generating
  const validateReport = () => {
    const errs = {};
    if (!sections.cover && !sections.project_well_info && !sections.well_construction &&
        !sections.geological_log && !sections.groundwater_monitoring &&
        !sections.field_documentation && !sections.notes_conclusion) {
      errs.sections = 'Pilih minimal satu bagian laporan';
    }
    if (sections.field_documentation && selectedPhotos.size === 0 && photos.length > 0) {
      errs.photos = 'Pilih minimal satu foto untuk bagian dokumentasi lapangan';
    }
    if (!metadata.title.trim()) errs.title = 'Judul laporan wajib diisi';
    if (!metadata.preparedBy.trim()) errs.preparedBy = 'Disusun oleh wajib diisi';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Generate PDF
  const handleGeneratePdf = async () => {
    if (!validateReport()) return;

    setGenerating(true);
    try {
      const wellDataForPdf = wellData || loadActiveWellData();
      const selectedPhotoRecords = photos.filter(p => selectedPhotos.has(p.id));

      await downloadBoreholePdf({
        model: wellDataForPdf?.model || {},
        well: wellDataForPdf?.well || {},
        activity: wellDataForPdf?.activity || {},
        canvas: null,
        project: activeProject,
        designer,
        geology,
        // Pass report configuration via a custom property
        _reportConfig: {
          sections,
          selectedPhotoIds: Array.from(selectedPhotos),
          metadata,
          notes,
        },
      });
      notify('PDF laporan berhasil diunduh', 'success');
    } catch (error) {
      console.error(error);
      notify('Gagal membuat PDF laporan. Coba lagi dengan foto yang lebih kecil.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Preview handler (would open a modal with HTML preview)
  const handlePreview = () => {
    if (!validateReport()) return;
    setPreviewMode(true);
  };

  if (!activeWellId) {
    return (
      <div className="report-builder-page">
        <PageHead kicker="Pekerjaan sumur" title="Laporan PDF" description="Buat laporan penyelesaian sumur bor profesional.">
          <Button variant="primary" icon={Download} disabled>Unduh PDF</Button>
        </PageHead>
        <div className="empty-state">
          <FileText size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
          <h3>Belum ada sumur aktif</h3>
          <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih sumur dari halaman Proyek untuk membuat laporan.</p>
        </div>
      </div>
    );
  }

  const well = activeWell?.well;
  const project = activeProject;

  // Count photos per category for section toggles
  const photoCounts = useMemo(() => {
    const counts = {};
    photos.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [photos]);

  const docCounts = useMemo(() => {
    const counts = {};
    documents.forEach(d => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [documents]);

  return (
    <div className="report-builder-page">
      <PageHead kicker={`Sumur: ${well?.wellCode}`} title="Laporan PDF" description="Konfigurasikan bagian laporan, pilih foto, dan atur identitas sebelum mengekspor PDF.">
        <div className="head-actions">
          <Button variant="ghost" icon={Eye} onClick={handlePreview} disabled={generating}>Pratinjau</Button>
          <Button variant="primary" icon={Download} loading={generating} onClick={handleGeneratePdf} disabled={generating}>
            {generating ? 'Menyiapkan...' : 'Unduh PDF'}
          </Button>
        </div>
      </PageHead>

      <div className="report-builder-grid">
        {/* Left panel - Configuration */}
        <div className="report-config">
          <section className="config-panel">
            <h3>Bagian Laporan</h3>
            <p className="panel-hint">Pilih bagian yang akan disertakan dalam laporan. Bagian tanpa data akan dilewati otomatis.</p>
            <div className="sections-list">
              {REPORT_SECTIONS.map(section => {
                let photoCount = 0;
                let docCount = 0;
                let disabled = false;

                switch (section.id) {
                  case 'well_construction':
                    disabled = !designer?.components?.length && !wellData?.model?.pipes?.length;
                    break;
                  case 'geological_log':
                    disabled = !geology?.layers?.length;
                    break;
                  case 'groundwater_monitoring':
                    disabled = !monitoring?.measurements?.length;
                    break;
                  case 'field_documentation':
                    photoCount = photos.length;
                    docCount = documents.length;
                    disabled = photoCount === 0 && docCount === 0;
                    break;
                }

                return (
                  <SectionToggle
                    key={section.id}
                    section={section}
                    enabled={sections[section.id]}
                    onToggle={toggleSection}
                    photoCount={photoCount}
                    docCount={docCount}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          </section>

          <section className="config-panel">
            <PhotoSelector
              photos={photos}
              selectedIds={selectedPhotos}
              onToggle={handlePhotoToggle}
              onSelectAll={selectAllPhotos}
              onClear={clearPhotos}
            />
          </section>

          <section className="config-panel">
            <ReportMetadataForm metadata={metadata} onChange={setMetadata} />
          </section>

          <section className="config-panel">
            <NotesSection notes={notes} onChange={setNotes} />
          </section>
        </div>

        {/* Right panel - Preview/Summary */}
        <div className="report-preview">
          <div className="preview-card">
            <div className="preview-header">
              <h3>Ringkasan Laporan</h3>
              {previewMode && (
                <Button variant="ghost" size="sm" icon={X} onClick={() => setPreviewMode(false)}>Tutup Pratinjau</Button>
              )}
            </div>

            {previewMode ? (
              <ReportPreview
                well={well}
                project={project}
                sections={sections}
                selectedPhotos={photos.filter(p => selectedPhotos.has(p.id))}
                metadata={metadata}
                notes={notes}
                designer={designer}
                geology={geology}
                monitoring={monitoring}
                wellData={wellData}
              />
            ) : (
              <ReportSummary
                well={well}
                project={project}
                sections={sections}
                photoCount={selectedPhotos.size}
                totalPhotos={photos.length}
                totalDocs={documents.length}
                hasDesigner={!!(designer?.components?.length || wellData?.model?.pipes?.length)}
                hasGeology={!!geology?.layers?.length}
                hasMonitoring={!!monitoring?.measurements?.length}
                metadata={metadata}
              />
            )}
          </div>
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}

function ReportSummary({ well, project, sections, photoCount, totalPhotos, totalDocs, hasDesigner, hasGeology, hasMonitoring, metadata }) {
  const activeSections = Object.entries(sections).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="report-summary">
      <div className="summary-header">
        <h4>{metadata.title || 'Laporan Penyelesaian Sumur Bor'}</h4>
        <p className="summary-meta">
          {metadata.reportNumber && <span>No. {metadata.reportNumber}</span>}
          {metadata.revision && <span>Rev. {metadata.revision}</span>}
        </p>
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <strong>Proyek</strong>
          <span>{project?.projectName || '—'} ({project?.projectCode || '—'})</span>
        </div>
        <div className="summary-item">
          <strong>Sumur</strong>
          <span>{well?.wellName || '—'} ({well?.wellCode || '—'})</span>
        </div>
        <div className="summary-item">
          <strong>Lokasi</strong>
          <span>{well?.location || project?.location || '—'}</span>
        </div>
        <div className="summary-item">
          <strong>Kedalaman</strong>
          <span>{well?.actualDepth || well?.plannedDepth || '—'} m</span>
        </div>
      </div>

      <div className="summary-section">
        <h4>Bagian yang Disertakan ({activeSections.length})</h4>
        <ul className="section-list">
          {REPORT_SECTIONS.filter(s => sections[s.id]).map(s => (
            <li key={s.id}>
              <CheckSquare size={16} className="checked" />
              {s.label}
            </li>
          ))}
          {REPORT_SECTIONS.filter(s => !sections[s.id]).map(s => (
            <li key={s.id} className="disabled">
              <Square size={16} />
              {s.label} <span className="muted">(dilewati)</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="summary-section">
        <h4>Data Tersedia</h4>
        <ul className="data-list">
          <li><span className={hasDesigner ? 'available' : 'unavailable'}>Konstruksi Sumur</span> {hasDesigner ? '✓' : '✗ Tidak ada data'}</li>
          <li><span className={hasGeology ? 'available' : 'unavailable'}>Log Geologi</span> {hasGeology ? '✓' : '✗ Tidak ada data'}</li>
          <li><span className={hasMonitoring ? 'available' : 'unavailable'}>Monitoring Air Tanah</span> {hasMonitoring ? '✓' : '✗ Tidak ada data'}</li>
          <li><span className={photoCount > 0 ? 'available' : 'unavailable'}>Foto Dokumentasi</span> {photoCount} dipilih dari {totalPhotos}</li>
          <li><span className={totalDocs > 0 ? 'available' : 'unavailable'}>Dokumen Pendukung</span> {totalDocs} tersedia</li>
        </ul>
      </div>

      <div className="summary-footer">
        <p className="hint">Klik "Pratinjau" untuk melihat tampilan laporan sebelum mengekspor PDF.</p>
      </div>
    </div>
  );
}

function ReportPreview({ well, project, sections, selectedPhotos, metadata, notes, designer, geology, monitoring, wellData }) {
  // This is a simplified HTML preview - in production you might want a more sophisticated preview
  return (
    <div className="report-preview-content">
      {/* Cover Page */}
      {sections.cover && (
        <div className="preview-page cover-page">
          {metadata.logoDataUrl && <img src={metadata.logoDataUrl} alt="Logo" className="cover-logo" />}
          <h1>{metadata.title}</h1>
          <p className="cover-well">{well?.wellName} ({well?.wellCode})</p>
          <p className="cover-project">{project?.projectName}</p>
          <div className="cover-meta">
            <p>Nomor Laporan: {metadata.reportNumber}</p>
            <p>Revisi: {metadata.revision}</p>
            <p>Tanggal: {metadata.reportDate ? new Date(metadata.reportDate).toLocaleDateString('id-ID') : '-'}</p>
            <p>Disusun oleh: {metadata.preparedBy}</p>
            {metadata.reviewedBy && <p>Ditinjau oleh: {metadata.reviewedBy}</p>}
          </div>
        </div>
      )}

      {/* Project & Well Info */}
      {sections.project_well_info && (
        <div className="preview-page">
          <h2>Informasi Proyek & Sumur</h2>
          <table className="preview-table">
            <tbody>
              <tr><th>Proyek</th><td>{project?.projectName}</td></tr>
              <tr><th>Kode Proyek</th><td>{project?.projectCode}</td></tr>
              <tr><th>Klien</th><td>{project?.clientName}</td></tr>
              <tr><th>Kontraktor</th><td>{project?.contractorName}</td></tr>
              <tr><th>Lokasi Proyek</th><td>{project?.location}</td></tr>
              <tr><th>Sumur</th><td>{well?.wellName}</td></tr>
              <tr><th>Kode Sumur</th><td>{well?.wellCode}</td></tr>
              <tr><th>Tipe Sumur</th><td>{well?.wellType}</td></tr>
              <tr><th>Kedalaman Rencana</th><td>{well?.plannedDepth} m</td></tr>
              <tr><th>Kedalaman Aktual</th><td>{well?.actualDepth} m</td></tr>
              <tr><th>Koordinat</th><td>{well?.latitude}, {well?.longitude}</td></tr>
              <tr><th>Tanggal Bor</th><td>{well?.drillingDate ? new Date(well.drillingDate).toLocaleDateString('id-ID') : '-'}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Well Construction */}
      {sections.well_construction && (
        <div className="preview-page">
          <h2>Konstruksi Sumur</h2>
          <p className="preview-note">Diagram konstruksi sumur akan dirender dalam PDF.</p>
          {designer?.components?.length > 0 && (
            <ul>
              {designer.components.filter(c => c.visible).map(c => (
                <li key={c.id}>{c.name}: {c.startDepth}–{c.endDepth || c.startDepth} m, {c.outerDiameter} mm</li>
              ))}
            </ul>
          )}
          {wellData?.model?.pipes?.length > 0 && (
            <ul>
              {wellData.model.pipes.map((p, i) => (
                <li key={i}>Pipa {i + 1}: {p.start}–{p.end} m, {p.diameter}″</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Geological Log */}
      {sections.geological_log && geology?.layers?.length > 0 && (
        <div className="preview-page">
          <h2>Log Geologi</h2>
          <table className="preview-table">
            <thead><tr><th>Mulai (m)</th><th>Akhir (m)</th><th>Tebal (m)</th><th>Material</th><th>Nama</th><th>Keterangan</th></tr></thead>
            <tbody>
              {geology.layers.map((l, i) => (
                <tr key={i}>
                  <td>{l.startDepth}</td><td>{l.endDepth}</td><td>{l.endDepth - l.startDepth}</td>
                  <td>{l.material}</td><td>{l.name}</td><td>{l.description || l.formation || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Groundwater Monitoring */}
      {sections.groundwater_monitoring && monitoring?.measurements?.length > 0 && (
        <div className="preview-page">
          <h2>Monitoring Air Tanah</h2>
          <p>Total {monitoring.measurements.filter(m => m.status === 'valid').length} pengukuran valid.</p>
          <table className="preview-table">
            <thead><tr><th>Tanggal</th><th>Kedalaman (m)</th><th>Titik Referensi</th><th>Metode</th><th>Catatan</th></tr></thead>
            <tbody>
              {monitoring.measurements.filter(m => m.status === 'valid').slice(0, 20).map((m, i) => (
                <tr key={i}>
                  <td>{new Date(m.measuredAt).toLocaleDateString('id-ID')}</td>
                  <td>{m.waterLevelDepth.toFixed(2)}</td>
                  <td>{m.referencePoint}</td>
                  <td>{m.method}</td>
                  <td>{m.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Field Documentation */}
      {sections.field_documentation && selectedPhotos.length > 0 && (
        <div className="preview-page">
          <h2>Dokumentasi Lapangan</h2>
          <div className="preview-photos">
            {selectedPhotos.map((photo, i) => (
              <div key={photo.id} className="preview-photo">
                {(previewUrls[photo.id] || photo.fileRef) && photo.fileType?.startsWith('image/') && <img src={previewUrls[photo.id] || photo.fileRef} alt={photo.name} />}
                <p><strong>{photo.name}</strong></p>
                <p className="caption">{photo.category} · {photo.documentedAt ? new Date(photo.documentedAt).toLocaleDateString('id-ID') : '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes & Conclusion */}
      {sections.notes_conclusion && (
        <div className="preview-page">
          <h2>Catatan & Kesimpulan</h2>
          {notes.technical && (
            <div><h3>Catatan Teknis</h3><p>{notes.technical}</p></div>
          )}
          {notes.conclusion && (
            <div><h3>Kesimpulan</h3><p>{notes.conclusion}</p></div>
          )}
          <div className="signatures">
            <p>Disusun oleh,<br/><br/><br/><strong>{metadata.preparedBy}</strong></p>
            {metadata.reviewedBy && <p>Ditinjau oleh,<br/><br/><br/><strong>{metadata.reviewedBy}</strong></p>}
          </div>
        </div>
      )}
    </div>
  );
}