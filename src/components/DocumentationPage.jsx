// Phase 6 — Documentation Page
// Photo gallery and document management for well-level documentation

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Camera, Plus, X, Trash2, Edit, Eye, Download, Search,
  Filter, ChevronDown, MoreHorizontal, Image, FileText,
  AlertTriangle, Info, RotateCcw, Grid, List, Table,
  CheckCircle,
} from 'lucide-react';
import { Button, Field, PageHead, useConfirm } from '../components/Primitives';
import { useProject } from '../context/ProjectContext';
import {
  getWellDocumentation,
  addWellPhoto,
  addWellDocument,
  retrieveFile,
  storeLargeFile,
  getStorageInfo,
  migrateWellDocumentation,
  PHOTO_CATEGORIES,
  DOCUMENT_CATEGORIES,
  formatFileSize,
  isPreviewable,
} from '../storage/documentationStorage';
import { readImageFile } from '../hooks';
import {
  getFileTypeIcon,
  getPhotoCategoryLabel,
  getDocumentCategoryLabel,
} from '../documentation/model';

function FileTypeIcon({ fileType, size = 32, strokeWidth = 1.5 }) {
  const iconType = getFileTypeIcon(fileType);
  switch (iconType) {
    case 'image': return <Image size={size} strokeWidth={strokeWidth} />;
    case 'file-text': return <FileText size={size} strokeWidth={strokeWidth} />;
    case 'table': return <Table size={size} strokeWidth={strokeWidth} />;
    default: return <FileText size={size} strokeWidth={strokeWidth} />;
  }
}

const SORT_OPTIONS = [
  { value: 'documentedAt_desc', label: 'Terbaru dulu' },
  { value: 'documentedAt_asc', label: 'Terlama dulu' },
  { value: 'name_asc', label: 'Nama (A-Z)' },
  { value: 'name_desc', label: 'Nama (Z-A)' },
  { value: 'fileSize_desc', label: 'Ukuran terbesar' },
  { value: 'category_asc', label: 'Kategori' },
];

function PhotoTile({ photo, onView, onEdit, onDelete, onDownload, previewUrl, loading }) {
  const isImage = photo.fileType?.startsWith('image/');
  const canPreview = isImage;

  return (
    <figure className={`doc-tile ${loading ? 'is-loading' : ''}`}>
      {canPreview && previewUrl ? (
        <img src={previewUrl} alt={photo.name} loading="lazy" onError={(e) => e.target.style.display = 'none'} />
      ) : (
        <div className="tile-placeholder">
          <FileTypeIcon fileType={photo.fileType} size={32} strokeWidth={1.5} />
        </div>
      )}
      <figcaption className="tile-caption">
        <div className="tile-info">
          <strong>{photo.name}</strong>
          <span className="tile-meta">
            <span className="tile-category">{getPhotoCategoryLabel(photo.category)}</span>
            <span className="tile-size">{formatFileSize(photo.fileSize)}</span>
            <span className="tile-date">{photo.documentedAt ? new Date(photo.documentedAt).toLocaleDateString('id-ID') : '-'}</span>
          </span>
        </div>
        <div className="tile-actions">
          {canPreview && <button type="button" className="icon-btn" onClick={onView} aria-label="Lihat besar"><Eye size={16} /></button>}
          <button type="button" className="icon-btn" onClick={onEdit} aria-label="Edit"><Edit size={16} /></button>
          <button type="button" className="icon-btn" onClick={onDownload} aria-label="Unduh"><Download size={16} /></button>
          <button type="button" className="icon-btn danger" onClick={onDelete} aria-label="Hapus"><Trash2 size={16} /></button>
        </div>
      </figcaption>
    </figure>
  );
}

function DocumentTile({ document, onView, onEdit, onDelete, onDownload, previewUrl, loading }) {
  const canPreview = isPreviewable(document.fileType);

  return (
    <figure className={`doc-tile doc-tile-document ${loading ? 'is-loading' : ''}`}>
      {canPreview && previewUrl && document.fileType === 'application/pdf' ? (
        <iframe src={previewUrl} title={document.title} sandbox="allow-scripts allow-same-origin" />
      ) : canPreview && previewUrl && document.fileType.startsWith('image/') ? (
        <img src={previewUrl} alt={document.title} loading="lazy" />
      ) : (
        <div className="tile-placeholder">
          <FileTypeIcon fileType={document.fileType} size={32} strokeWidth={1.5} />
        </div>
      )}
      <figcaption className="tile-caption">
        <div className="tile-info">
          <strong>{document.title}</strong>
          <span className="tile-meta">
            <span className="tile-category">{getDocumentCategoryLabel(document.category)}</span>
            <span className="tile-size">{formatFileSize(document.fileSize)}</span>
            <span className="tile-date">{document.documentDate ? new Date(document.documentDate).toLocaleDateString('id-ID') : '-'}</span>
          </span>
        </div>
        <div className="tile-actions">
          {canPreview && <button type="button" className="icon-btn" onClick={onView} aria-label="Pratinjau"><Eye size={16} /></button>}
          <button type="button" className="icon-btn" onClick={onEdit} aria-label="Edit"><Edit size={16} /></button>
          <button type="button" className="icon-btn" onClick={onDownload} aria-label="Unduh"><Download size={16} /></button>
          <button type="button" className="icon-btn danger" onClick={onDelete} aria-label="Hapus"><Trash2 size={16} /></button>
        </div>
      </figcaption>
    </figure>
  );
}

function PhotoViewer({ photo, onClose, onDownload, previewUrl }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="viewer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="viewer-title">
      <div className="viewer-content" onClick={(e) => e.stopPropagation()}>
        <header className="viewer-header">
          <h3 id="viewer-title">{photo.name}</h3>
          <div className="viewer-actions">
            <button type="button" className="icon-btn" onClick={onDownload} aria-label="Unduh"><Download size={20} /></button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
          </div>
        </header>
        <div className="viewer-body">
          {previewUrl ? (
            <img src={previewUrl} alt={photo.name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
          ) : (
            <div className="viewer-placeholder">
              <FileTypeIcon fileType={photo.fileType} size={64} strokeWidth={1.5} />
              <p>Pratinjau tidak tersedia untuk format ini</p>
            </div>
          )}
        </div>
        <footer className="viewer-footer">
          <div className="viewer-meta">
            <span>Kategori: {getPhotoCategoryLabel(photo.category)}</span>
            <span>Ukuran: {formatFileSize(photo.fileSize)}</span>
            <span>Tanggal: {photo.documentedAt ? new Date(photo.documentedAt).toLocaleDateString('id-ID') : '-'}</span>
            {photo.description && <span>Deskripsi: {photo.description}</span>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function DocumentViewer({ document, onClose, onDownload, previewUrl }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="viewer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="doc-viewer-title">
      <div className="viewer-content viewer-content-doc" onClick={(e) => e.stopPropagation()}>
        <header className="viewer-header">
          <h3 id="doc-viewer-title">{document.title}</h3>
          <div className="viewer-actions">
            <button type="button" className="icon-btn" onClick={onDownload} aria-label="Unduh"><Download size={20} /></button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
          </div>
        </header>
        <div className="viewer-body">
          {previewUrl && isPreviewable(document.fileType) ? (
            document.fileType === 'application/pdf' ? (
              <iframe src={previewUrl} title={document.title} style={{ width: '100%', height: '70vh', border: 'none' }} sandbox="allow-scripts allow-same-origin" />
            ) : document.fileType.startsWith('image/') ? (
              <img src={previewUrl} alt={document.title} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
            ) : (
              <div className="viewer-placeholder">
                <FileTypeIcon fileType={document.fileType} size={64} strokeWidth={1.5} />
                <p>Pratinjau tidak tersedia untuk format ini</p>
              </div>
            )
          ) : (
            <div className="viewer-placeholder">
              <FileTypeIcon fileType={document.fileType} size={64} strokeWidth={1.5} />
              <p>Pratinjau tidak tersedia untuk format ini</p>
              <small>Unduh file untuk melihat isinya</small>
            </div>
          )}
        </div>
        <footer className="viewer-footer">
          <div className="viewer-meta">
            <span>Kategori: {getDocumentCategoryLabel(document.category)}</span>
            <span>Ukuran: {formatFileSize(document.fileSize)}</span>
            <span>Tanggal dokumen: {document.documentDate ? new Date(document.documentDate).toLocaleDateString('id-ID') : '-'}</span>
            {document.description && <span>Deskripsi: {document.description}</span>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function UploadDialog({ open, onClose, onSubmit, type, categories, title }) {
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState([]);
  const [formData, setFormData] = useState({
    category: categories[0]?.value || 'other',
    description: '',
    documentedAt: new Date().toISOString().split('T')[0],
  });
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleFiles = (newFiles) => {
    const validFiles = Array.from(newFiles).filter(f => {
      if (type === 'photo' && !f.type.startsWith('image/')) {
        return false;
      }
      if (type === 'document' && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].includes(f.type)) {
        return false;
      }
      return true;
    });
    setFiles(validFiles);
    if (validFiles.length !== newFiles.length) {
      setErrors({ files: 'Beberapa file dilewati karena format tidak didukung' });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDrag(true);
  };

  const handleDragLeave = () => setDrag(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) {
      setErrors({ files: 'Pilih minimal satu file' });
      return;
    }
    setUploading(true);
    setErrors({});
    try {
      await onSubmit(files, formData);
      onClose();
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-layer is-open">
      <div className="dialog-scrim" onClick={onClose} />
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <h3 id="upload-title">{title}</h3>
        <form onSubmit={handleSubmit} className="form-dialog">
          <div className={`upload-dropzone ${drag ? 'is-drag' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
            <input type="file" multiple accept={type === 'photo' ? 'image/*' : '.pdf,image/*,.txt'} hidden id="upload-input" onChange={(e) => handleFiles(e.target.files)} />
            <label htmlFor="upload-input" className="dropzone-label">
              {files.length === 0 ? (
                <>
                  <Camera size={48} strokeWidth={1.5} />
                  <p>Seret file ke sini atau klik untuk memilih</p>
                  <small>Format: {type === 'photo' ? 'JPG, PNG, WebP (maks 10MB)' : 'PDF, JPG, PNG, WebP, TXT (maks 20MB)'}</small>
                </>
              ) : (
                <>
                  <CheckCircle size={48} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                  <p>{files.length} file dipilih</p>
                  <ul style={{ textAlign: 'left', maxHeight: '150px', overflow: 'auto' }}>
                    {files.map(f => <li key={f.name}><strong>{f.name}</strong> ({formatFileSize(f.size)})</li>)}
                  </ul>
                </>
              )}
            </label>
          </div>

          <div className="form-grid">
            <Field as="select" label="Kategori" {...{ value: formData.category, onChange: e => setFormData(prev => ({ ...prev, category: e.target.value })) }}>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Field>
            <Field label="Tanggal dokumentasi" type="date" {...{ value: formData.documentedAt, onChange: e => setFormData(prev => ({ ...prev, documentedAt: e.target.value })) }} />
          </div>
          <Field label="Deskripsi" as="textarea" rows={3} placeholder="Catatan tambahan..." {...{ value: formData.description, onChange: e => setFormData(prev => ({ ...prev, description: e.target.value })) }} className="col-2" />

          {errors.files && <div className="form-error">{errors.files}</div>}
          {errors.submit && <div className="form-error">{errors.submit}</div>}

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={uploading}>Batal</Button>
            <Button type="submit" variant="primary" loading={uploading} disabled={!files.length || uploading}>{uploading ? 'Mengunggah...' : `Unggah ${files.length} file`}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDialog({ open, onClose, onSubmit, item, type, categories }) {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        title: item.title || '',
        category: item.category || categories[0]?.value || 'other',
        description: item.description || '',
        documentedAt: (item.documentedAt || item.documentDate || '').split('T')[0],
      });
    }
  }, [item, categories]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (type === 'photo' && !formData.name.trim()) {
      setErrors({ name: 'Nama foto wajib diisi' });
      return;
    }
    if (type === 'document' && !formData.title.trim()) {
      setErrors({ title: 'Judul dokumen wajib diisi' });
      return;
    }
    onSubmit(formData);
  };

  if (!open || !item) return null;

  return (
    <div className="dialog-layer is-open">
      <div className="dialog-scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <h3 id="edit-title">Edit {type === 'photo' ? 'Foto' : 'Dokumen'}</h3>
        <form onSubmit={handleSubmit} className="form-dialog">
          <Field label={type === 'photo' ? 'Nama foto' : 'Judul dokumen'} placeholder={type === 'photo' ? 'Foto Dokumentasi' : 'Dokumen Baru'} {...{ value: formData.name || formData.title, onChange: e => setFormData(prev => ({ ...prev, [type === 'photo' ? 'name' : 'title']: e.target.value })) }} />
          <Field as="select" label="Kategori" {...{ value: formData.category, onChange: e => setFormData(prev => ({ ...prev, category: e.target.value })) }}>
            {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Field>
          <Field label="Tanggal dokumentasi" type="date" {...{ value: formData.documentedAt, onChange: e => setFormData(prev => ({ ...prev, documentedAt: e.target.value })) }} />
          <Field label="Deskripsi" as="textarea" rows={3} placeholder="Catatan tambahan..." {...{ value: formData.description, onChange: e => setFormData(prev => ({ ...prev, description: e.target.value })) }} className="col-2" />

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
            <Button type="submit" variant="primary">Simpan</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DocumentationPage({ notify }) {
  const { activeWellId, activeWell, activeProjectId, isAuthenticated, getPhotos, uploadPhoto, getDocuments, uploadDocument, deletePhoto, deleteDocument, updatePhoto, updateDocument } = useProject();
  const [confirm, confirmDialog] = useConfirm();

  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('photos'); // 'photos' | 'documents'
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('documentedAt_desc');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [storageInfo, setStorageInfo] = useState(null);

  // Dialog states
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [editingDocument, setEditingDocument] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const [loadingPreviews, setLoadingPreviews] = useState(new Set());

  // Load documentation
  const loadDocumentation = useCallback(async () => {
    if (!activeWellId) return;
    if (isAuthenticated) {
      // API mode: fetch from backend
      const [photoList, docList] = await Promise.all([
        getPhotos('well', activeWellId),
        getDocuments('well', activeWellId),
      ]);
      setPhotos(photoList);
      setDocuments(docList);

      // Generate preview URLs for previewable items (API download URLs are directly usable)
      const previewPromises = [];
      [...photoList, ...docList].forEach(item => {
        if (item.fileRef && isPreviewable(item.fileType)) {
          previewPromises.push(
            (async () => {
              setLoadingPreviews(prev => new Set(prev).add(item.id));
              // API download URLs are directly accessible (authenticated via cookie)
              setPreviewUrls(prev => ({ ...prev, [item.id]: item.fileRef }));
              setLoadingPreviews(prev => { const n = new Set(prev); n.delete(item.id); return n; });
            })()
          );
        }
      });
      await Promise.all(previewPromises);
    } else {
      // LocalStorage mode
      const docs = getWellDocumentation(activeWellId);
      setPhotos(docs.photos || []);
      setDocuments(docs.documents || []);

      const previewPromises = [];
      [...docs.photos, ...docs.documents].forEach(item => {
        if (item.fileRef && isPreviewable(item.fileType)) {
          previewPromises.push(
            (async () => {
              setLoadingPreviews(prev => new Set(prev).add(item.id));
              const url = await retrieveFile(item.fileRef);
              setPreviewUrls(prev => ({ ...prev, [item.id]: url }));
              setLoadingPreviews(prev => { const n = new Set(prev); n.delete(item.id); return n; });
            })()
          );
        }
      });
      await Promise.all(previewPromises);
    }

    // Check storage (localStorage mode only)
    if (!isAuthenticated) {
      const info = await getStorageInfo();
      setStorageInfo(info);
    } else {
      setStorageInfo(null);
    }
  }, [activeWellId, isAuthenticated, getPhotos, getDocuments]);

  useEffect(() => {
    loadDocumentation();
    // Run migration if needed
    if (activeWellId && activeWell) {
      migrateWellDocumentation(activeWellId, activeWell);
    }
  }, [activeWellId, activeWell, loadDocumentation]);

  // Filter and sort
  const filteredPhotos = useMemo(() => {
    let result = [...photos];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      result = result.filter(p => p.category === categoryFilter);
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'documentedAt_desc': return new Date(b.documentedAt) - new Date(a.documentedAt);
        case 'documentedAt_asc': return new Date(a.documentedAt) - new Date(b.documentedAt);
        case 'name_asc': return a.name.localeCompare(b.name);
        case 'name_desc': return b.name.localeCompare(a.name);
        case 'fileSize_desc': return b.fileSize - a.fileSize;
        case 'category_asc': return a.category.localeCompare(b.category);
        default: return 0;
      }
    });
    return result;
  }, [photos, search, categoryFilter, sortBy]);

  const filteredDocuments = useMemo(() => {
    let result = [...documents];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d => d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      result = result.filter(d => d.category === categoryFilter);
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'documentedAt_desc': return new Date(b.documentDate) - new Date(a.documentDate);
        case 'documentedAt_asc': return new Date(a.documentDate) - new Date(b.documentDate);
        case 'name_asc': return a.title.localeCompare(b.title);
        case 'name_desc': return b.title.localeCompare(a.title);
        case 'fileSize_desc': return b.fileSize - a.fileSize;
        case 'category_asc': return a.category.localeCompare(b.category);
        default: return 0;
      }
    });
    return result;
  }, [documents, search, categoryFilter, sortBy]);

  // Photo handlers
  const handlePhotoUpload = async (files, formData) => {
    if (isAuthenticated) {
      // API mode: upload via backend
      for (const file of files) {
        try {
          await uploadPhoto('well', activeWellId, file, {
            name: file.name.replace(/\.[^/.]+$/, ''),
            category: formData.category,
            description: formData.description,
            documentedAt: formData.documentedAt,
          });
        } catch (error) {
          notify(error.message, 'error');
        }
      }
      notify(`${files.length} foto berhasil diunggah`, 'success');
    } else {
      // LocalStorage mode
      for (const file of files) {
        try {
          const dataUrl = await readImageFile(file);
          addWellPhoto(activeWellId, activeProjectId, {
            name: file.name.replace(/\.[^/.]+$/, ''),
            category: formData.category,
            description: formData.description,
            documentedAt: formData.documentedAt,
            fileRef: dataUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });
        } catch (error) {
          notify(error.message, 'error');
        }
      }
      notify(`${files.length} foto berhasil diunggah`, 'success');
    }
    loadDocumentation();
  };

  const handleDocumentUpload = async (files, formData) => {
    if (isAuthenticated) {
      // API mode: upload via backend
      for (const file of files) {
        try {
          await uploadDocument('well', activeWellId, file, {
            title: file.name.replace(/\.[^/.]+$/, ''),
            category: formData.category,
            description: formData.description,
            documentDate: formData.documentedAt,
          });
        } catch (error) {
          notify(error.message, 'error');
        }
      }
      notify(`${files.length} dokumen berhasil diunggah`, 'success');
    } else {
      // LocalStorage mode
      for (const file of files) {
        try {
          let fileRef;
          if (file.size > 2 * 1024 * 1024) {
            const result = await storeLargeFile(file, 'document');
            fileRef = result.fileRef;
          } else {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            fileRef = `data:${file.type};base64,${base64}`;
          }
          addWellDocument(activeWellId, activeProjectId, {
            title: file.name.replace(/\.[^/.]+$/, ''),
            category: formData.category,
            description: formData.description,
            documentDate: formData.documentedAt,
            fileRef,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });
        } catch (error) {
          notify(error.message, 'error');
        }
      }
      notify(`${files.length} dokumen berhasil diunggah`, 'success');
    }
    loadDocumentation();
  };

  const handlePhotoEdit = async (data) => {
    if (!editingPhoto) return;
    const result = await updatePhoto(editingPhoto.id, {
      name: data.name,
      category: data.category,
      description: data.description,
      documentedAt: data.documentedAt,
    });
    if (result.success) {
      notify('Foto diperbarui', 'success');
    } else {
      notify(result.error || 'Gagal memperbarui foto', 'error');
    }
    setEditingPhoto(null);
    loadDocumentation();
  };

  const handleDocumentEdit = async (data) => {
    if (!editingDocument) return;
    const result = await updateDocument(editingDocument.id, {
      title: data.title,
      category: data.category,
      description: data.description,
      documentDate: data.documentedAt,
    });
    if (result.success) {
      notify('Dokumen diperbarui', 'success');
    } else {
      notify(result.error || 'Gagal memperbarui dokumen', 'error');
    }
    setEditingDocument(null);
    loadDocumentation();
  };

  const handlePhotoDelete = async (id) => {
    const ok = await confirm({
      title: 'Hapus foto?',
      message: 'Foto ini akan dihapus permanen dari dokumentasi sumur.',
      confirmLabel: 'Hapus',
    });
    if (ok) {
      const result = await deletePhoto(id);
      if (result.success) {
        notify('Foto dihapus', 'success');
      } else {
        notify(result.error || 'Gagal menghapus foto', 'error');
      }
      loadDocumentation();
    }
  };

  const handleDocumentDelete = async (id) => {
    const ok = await confirm({
      title: 'Hapus dokumen?',
      message: 'Dokumen ini akan dihapus permanen dari dokumentasi sumur.',
      confirmLabel: 'Hapus',
    });
    if (ok) {
      const result = await deleteDocument(id);
      if (result.success) {
        notify('Dokumen dihapus', 'success');
      } else {
        notify(result.error || 'Gagal menghapus dokumen', 'error');
      }
      loadDocumentation();
    }
  };

  const handlePhotoDownload = (photo) => {
    if (!photo.fileRef) return;
    const link = document.createElement('a');
    if (photo.fileRef.startsWith('indexeddb:')) {
      // LocalStorage mode: retrieve from IndexedDB
      retrieveFile(photo.fileRef).then(url => {
        if (url) {
          link.href = url;
          link.download = photo.fileName || photo.name;
          link.click();
        }
      });
    } else {
      // API mode: direct download URL, or data URL
      link.href = photo.fileRef;
      link.download = photo.fileName || photo.name;
      link.click();
    }
  };

  const handleDocumentDownload = (document) => {
    if (!document.fileRef) return;
    const link = document.createElement('a');
    if (document.fileRef.startsWith('indexeddb:')) {
      retrieveFile(document.fileRef).then(url => {
        if (url) {
          link.href = url;
          link.download = document.fileName || document.title;
          link.click();
        }
      });
    } else {
      link.href = document.fileRef;
      link.download = document.fileName || document.title;
      link.click();
    }
  };

  const handlePhotoView = (photo) => {
    setViewingPhoto(photo);
  };

  const handleDocumentView = (document) => {
    setViewingDocument(document);
  };

  const handlePhotoEditOpen = (photo) => {
    setEditingPhoto(photo);
  };

  const handleDocumentEditOpen = (document) => {
    setEditingDocument(document);
  };

  if (!activeWellId) {
    return (
      <div className="documentation-page">
        <PageHead kicker="Pekerjaan sumur" title="Galeri & Dokumen" description="Kelola foto dan dokumen untuk sumur aktif.">
          <div className="tally"><b className="mono">0</b><span> item</span></div>
        </PageHead>
        <div className="empty-state">
          <Image size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
          <h3>Belum ada sumur aktif</h3>
          <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih sumur dari halaman Proyek untuk mengelola dokumentasi.</p>
        </div>
      </div>
    );
  }

  const well = activeWell?.well;
  const totalItems = photos.length + documents.length;

  return (
    <div className="documentation-page">
      <PageHead kicker={`Sumur: ${well?.wellCode}`} title="Galeri & Dokumen" description="Foto kegiatan dan dokumen pendukung konstruksi sumur.">
        <div className="head-actions">
          <div className="tally"><b className="mono">{totalItems}</b><span> item</span></div>
          <Button variant="primary" icon={Camera} onClick={() => setShowPhotoUpload(true)}>Tambah Foto</Button>
          <Button variant="soft" icon={FileText} onClick={() => setShowDocumentUpload(true)}>Tambah Dokumen</Button>
        </div>
      </PageHead>

      {storageInfo?.warning && (
        <div className="storage-warning" style={{ padding: '12px 16px', background: 'var(--ochre-soft)', border: '1px solid var(--ochre)', borderRadius: '12px', color: 'var(--ochre)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={20} />
          <span>Penyimpanan lokal hampir penuh ({storageInfo.localStorage.percent}%). Pertimbangkan menghapus foto lama atau mengurangi ukuran file.</span>
        </div>
      )}

      <div className="docs-toolbar">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={activeTab === 'photos'} onClick={() => setActiveTab('photos')} className={activeTab === 'photos' ? 'is-active' : ''}>
            <Image size={16} /><span>Foto ({photos.length})</span>
          </button>
          <button role="tab" aria-selected={activeTab === 'documents'} onClick={() => setActiveTab('documents')} className={activeTab === 'documents' ? 'is-active' : ''}>
            <FileText size={16} /><span>Dokumen ({documents.length})</span>
          </button>
        </div>

        <div className="toolbar-controls">
          <div className="search-wrap">
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Cari nama, deskripsi..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Field as="select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="filter-select">
            <option value="all">Semua kategori</option>
            {(activeTab === 'photos' ? PHOTO_CATEGORIES : DOCUMENT_CATEGORIES).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Field>
          <Field as="select" value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Field>
          <div className="view-toggle" role="group" aria-label="Mode tampilan">
            <button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')} aria-label="Grid" aria-pressed={viewMode === 'grid'}><Grid size={16} /></button>
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} aria-label="Daftar" aria-pressed={viewMode === 'list'}><List size={16} /></button>
          </div>
        </div>
      </div>

      {activeTab === 'photos' ? (
        <div className={`docs-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
          {filteredPhotos.length === 0 ? (
            <div className="empty-state inline">
              <Image size={48} style={{ color: 'var(--mute-2)' }} />
              <h4>Belum ada foto</h4>
              <p style={{ color: 'var(--mute)' }}>Unggah foto dokumentasi kegiatan sumur bor.</p>
              <Button variant="primary" icon={Camera} onClick={() => setShowPhotoUpload(true)} className="mt-4">Unggah Foto Pertama</Button>
            </div>
          ) : (
            filteredPhotos.map(photo => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                previewUrl={previewUrls[photo.id]}
                loading={loadingPreviews.has(photo.id)}
                onView={() => handlePhotoView(photo)}
                onEdit={() => handlePhotoEditOpen(photo)}
                onDelete={() => handlePhotoDelete(photo.id)}
                onDownload={() => handlePhotoDownload(photo)}
              />
            ))
          )}
        </div>
      ) : (
        <div className={`docs-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
          {filteredDocuments.length === 0 ? (
            <div className="empty-state inline">
              <FileText size={48} style={{ color: 'var(--mute-2)' }} />
              <h4>Belum ada dokumen</h4>
              <p style={{ color: 'var(--mute)' }}>Unggah dokumen pendukung seperti izin, kontrak, hasil uji, dll.</p>
              <Button variant="primary" icon={FileText} onClick={() => setShowDocumentUpload(true)} className="mt-4">Unggah Dokumen Pertama</Button>
            </div>
          ) : (
            filteredDocuments.map(doc => (
              <DocumentTile
                key={doc.id}
                document={doc}
                previewUrl={previewUrls[doc.id]}
                loading={loadingPreviews.has(doc.id)}
                onView={() => handleDocumentView(doc)}
                onEdit={() => handleDocumentEditOpen(doc)}
                onDelete={() => handleDocumentDelete(doc.id)}
                onDownload={() => handleDocumentDownload(doc)}
              />
            ))
          )}
        </div>
      )}

      {/* Dialogs */}
      <UploadDialog
        open={showPhotoUpload}
        onClose={() => setShowPhotoUpload(false)}
        onSubmit={handlePhotoUpload}
        type="photo"
        categories={PHOTO_CATEGORIES}
        title="Unggah Foto Dokumentasi"
      />
      <UploadDialog
        open={showDocumentUpload}
        onClose={() => setShowDocumentUpload(false)}
        onSubmit={handleDocumentUpload}
        type="document"
        categories={DOCUMENT_CATEGORIES}
        title="Unggah Dokumen"
      />
      <EditDialog
        open={!!editingPhoto}
        onClose={() => setEditingPhoto(null)}
        onSubmit={handlePhotoEdit}
        item={editingPhoto}
        type="photo"
        categories={PHOTO_CATEGORIES}
      />
      <EditDialog
        open={!!editingDocument}
        onClose={() => setEditingDocument(null)}
        onSubmit={handleDocumentEdit}
        item={editingDocument}
        type="document"
        categories={DOCUMENT_CATEGORIES}
      />
      {viewingPhoto && (
        <PhotoViewer
          photo={viewingPhoto}
          onClose={() => setViewingPhoto(null)}
          onDownload={() => handlePhotoDownload(viewingPhoto)}
          previewUrl={previewUrls[viewingPhoto.id]}
        />
      )}
      {viewingDocument && (
        <DocumentViewer
          document={viewingDocument}
          onClose={() => setViewingDocument(null)}
          onDownload={() => handleDocumentDownload(viewingDocument)}
          previewUrl={previewUrls[viewingDocument.id]}
        />
      )}
      {confirmDialog}
    </div>
  );
}