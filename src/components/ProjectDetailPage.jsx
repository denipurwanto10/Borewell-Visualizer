import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Filter, ChevronDown, MoreHorizontal, Edit, Trash2, Copy, RotateCcw, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react';
import { Button, Field, PageHead, useConfirm, ActionMenu } from '../components/Primitives';
import { useProject } from '../context/ProjectContext';
import { wellAPI } from '../api/client';
import { getWellData } from '../storage/projectStorage';

const STATUS_STYLES = {
  planned: { bg: 'var(--blue)', text: '#fff' },
  drilling: { bg: 'var(--teal)', text: '#fff' },
  completed: { bg: 'var(--green)', text: '#fff' },
  on_hold: { bg: 'var(--ochre)', text: '#fff' },
  abandoned: { bg: 'var(--mute)', text: '#fff' },
};

const WELL_TYPE_LABELS = {
  production: 'Produksi',
  monitoring: 'Monitoring',
  exploration: 'Eksplorasi',
  test: 'Uji',
  other: 'Lainnya',
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.planned;
  return (
    <span className="status-badge" style={{ background: style.bg, color: style.text }}>
      {status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function WellRow({ well, onEdit, onDelete, onDuplicate, onOpen, confirm }) {
  const style = STATUS_STYLES[well.status] || STATUS_STYLES.planned;

  return (
    <tr onClick={() => onOpen(well.id)}>
      <td className="col-main">
        <div className="well-name-wrap">
          <strong>{well.wellName}</strong>
          <span className="mono well-code">{well.wellCode}</span>
        </div>
        <div className="well-meta">
          <span>{WELL_TYPE_LABELS[well.wellType] || well.wellType}</span>
        </div>
      </td>
      <td data-label="Status"><StatusBadge status={well.status} /></td>
      <td className="mono" data-label="Rencana (m)">{well.plannedDepth || '-'}</td>
      <td className="mono" data-label="Aktual (m)">{well.actualDepth || '-'}</td>
      <td className="mono coords" data-label="Koordinat">{well.latitude && well.longitude ? `${Number(well.latitude).toFixed(4)}, ${Number(well.longitude).toFixed(4)}` : '-'}</td>
      <td className="mono" data-label="Tgl. bor">{well.drillingDate ? new Date(well.drillingDate).toLocaleDateString('id-ID') : '-'}</td>
      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
        <ActionMenu icon={MoreHorizontal}>
            <button onClick={() => onOpen(well.id)}><ExternalLink size={16} /><span>Buka sumur</span></button>
            <button onClick={() => onEdit(well)}><Edit size={16} /><span>Edit</span></button>
            <button onClick={() => onDuplicate(well.id)}><Copy size={16} /><span>Duplikat</span></button>
            <hr />
            <button onClick={() => onDelete(well.id)} className="danger"><Trash2 size={16} /><span>Hapus</span></button>
          </ActionMenu>
      </td>
    </tr>
  );
}

function WellForm({ well, onSubmit, onCancel, loading, wellTypes, onChange }) {
  return (
    <form onSubmit={onSubmit} className="form-dialog">
      <div className="form-grid">
        <Field label="Kode sumur" placeholder="WELL-001" {...{ value: well.wellCode, onChange: e => onChange({ wellCode: e.target.value }) }} className="col-2" />
        <Field label="Nama sumur" placeholder="Sumur Produksi 1" {...{ value: well.wellName, onChange: e => onChange({ wellName: e.target.value }) }} className="col-2" />
        <Field label="Tipe sumur" as="select" {...{ value: well.wellType, onChange: e => onChange({ wellType: e.target.value }) }} className="col-2">
          {wellTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Field>
        <Field label="Lokasi" placeholder="Detail lokasi sumur" {...{ value: well.location, onChange: e => onChange({ location: e.target.value }) }} className="col-2" />
        <Field label="Latitude" type="number" step="0.0001" placeholder="-7.7821" {...{ value: well.latitude, onChange: e => onChange({ latitude: e.target.value }) }} />
        <Field label="Longitude" type="number" step="0.0001" placeholder="110.3671" {...{ value: well.longitude, onChange: e => onChange({ longitude: e.target.value }) }} />
        <Field label="Kedalaman rencana" unit="m" type="number" step="0.1" min="0" placeholder="100" {...{ value: well.plannedDepth, onChange: e => onChange({ plannedDepth: e.target.value }) }} />
        <Field label="Kedalaman aktual" unit="m" type="number" step="0.1" min="0" placeholder="98.5" {...{ value: well.actualDepth, onChange: e => onChange({ actualDepth: e.target.value }) }} />
        <Field label="Tanggal mulai bor" type="date" {...{ value: well.drillingDate, onChange: e => onChange({ drillingDate: e.target.value }) }} />
        <Field label="Tanggal selesai bor" type="date" {...{ value: well.completionDate, onChange: e => onChange({ completionDate: e.target.value }) }} />
        <Field label="Status" as="select" {...{ value: well.status, onChange: e => onChange({ status: e.target.value }) }} className="col-2">
          {['planned', 'drilling', 'completed', 'on_hold', 'abandoned'].map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </Field>
        <Field label="Deskripsi" as="textarea" rows={3} placeholder="Catatan tambahan..." {...{ value: well.description, onChange: e => onChange({ description: e.target.value }) }} className="col-2" />
      </div>
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Batal</Button>
        <Button type="submit" variant="primary" loading={loading} icon={well.id ? undefined : Plus}>{well.id ? 'Simpan' : 'Buat'}</Button>
      </div>
    </form>
  );
}

export default function ProjectDetailPage({ projectId }) {
  const { projects, activeProjectId, activeWellId, selectProject, selectWell, createWell, updateWell, deleteWell, duplicateWell, getWellsForProject, isAuthenticated, notify, WELL_TYPES, WELL_STATUSES } = useProject();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('wellCode');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingWell, setEditingWell] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [wells, setWells] = useState([]);
  const [confirm, confirmDialog] = useConfirm();

  const project = projects.find(p => p.id === projectId);

  const loadWells = useCallback(async () => {
    if (!projectId) return;
    if (isAuthenticated) {
      try {
        const res = await wellAPI.list(projectId, { page_size: 100 });
        const list = (res?.data || []).map((w) => ({
          id: w.id,
          projectId: w.project_id,
          wellCode: w.well_code,
          wellName: w.well_name,
          wellType: w.well_type,
          location: w.location,
          latitude: w.latitude,
          longitude: w.longitude,
          plannedDepth: w.planned_depth,
          actualDepth: w.actual_depth,
          drillingDate: w.drilling_date,
          completionDate: w.completion_date,
          status: w.status,
          description: w.description,
          updatedAt: w.updated_at,
        }));
        setWells(list);
      } catch {
        setWells([]);
      }
    } else {
      setWells(getWellsForProject(projectId));
    }
  }, [projectId, isAuthenticated, getWellsForProject]);

  useEffect(() => {
    loadWells();
  }, [loadWells]);

  const filteredWells = useMemo(() => {
    let result = [...wells];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(w => w.wellName.toLowerCase().includes(q) || w.wellCode.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter(w => w.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter(w => w.wellType === typeFilter);
    result.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [wells, search, statusFilter, typeFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filteredWells.length / pageSize) || 1;
  const paginatedWells = filteredWells.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
    setPage(1);
  };

  const openCreateForm = () => {
    setEditingWell(null);
    setFormData({ wellCode: '', wellName: '', wellType: 'production', location: '', latitude: '', longitude: '', plannedDepth: '', actualDepth: '', drillingDate: '', completionDate: '', status: 'planned', description: '' });
    setFormErrors({});
    setShowForm(true);
  };

  const openEditForm = (well) => {
    setEditingWell(well);
    setFormData({ ...well });
    setFormErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingWell(null);
    setFormData({});
    setFormErrors({});
  };

  const handleFormChange = (updates) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setFormErrors(prev => ({ ...prev, ...Object.keys(updates).reduce((acc, k) => ({ ...acc, [k]: '' }), {}) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (editingWell) {
      const res = await updateWell(editingWell.id, formData);
      if (res.success) { closeForm(); loadWells(); }
      else setFormErrors(res.errors);
    } else {
      const res = await createWell({ ...formData, projectId });
      if (res.success) { closeForm(); loadWells(); }
      else setFormErrors(res.errors);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const r = await deleteWell(id, confirm);
    if (r?.success) loadWells();
  };

  const handleDuplicate = async (id) => {
    await duplicateWell(id);
    loadWells();
  };

  const handleOpen = (wellId) => {
    selectWell(wellId);
    window.location.hash = '#/visualisasi';
  };

  if (!project) {
    return (
      <div className="project-detail-page">
        <PageHead kicker="Proyek" title="Proyek tidak ditemukan" description="Proyek yang dicari tidak ada atau telah dihapus.">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => { window.location.hash = '#projects'; }}>Kembali</Button>
        </PageHead>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="project-detail-page">
      <PageHead kicker={`Proyek: ${project.projectCode}`} title={project.projectName} description={project.description || project.location}>
        <div className="head-actions">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => { window.location.hash = '#projects'; }}>Kembali</Button>
          <Button variant="primary" icon={Plus} onClick={openCreateForm}>Tambah Sumur</Button>
        </div>
      </PageHead>

      <div className="project-overview">
        <div className="overview-grid">
          <div className="overview-card">
            <h4>Klien & Kontraktor</h4>
            <p><strong>{project.clientName}</strong></p>
            <p className="mute">{project.contractorName}</p>
          </div>
          <div className="overview-card">
            <h4>Lokasi</h4>
            <p>{project.village}, {project.district}, {project.province}</p>
            <p className="mono coords">{project.latitude && project.longitude ? `${Number(project.latitude).toFixed(6)}, ${Number(project.longitude).toFixed(6)}` : '-'}</p>
          </div>
          <div className="overview-card">
            <h4>Timeline</h4>
            <p>Mulai: {project.startDate ? new Date(project.startDate).toLocaleDateString('id-ID') : '-'}</p>
            <p>Selesai: {project.endDate ? new Date(project.endDate).toLocaleDateString('id-ID') : '-'}</p>
          </div>
          <div className="overview-card">
            <h4>Status</h4>
            <StatusBadge status={project.status} />
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Field placeholder="Cari nama atau kode sumur..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="search-field"><Search className="search-icon" size={18} /></Field>
        </div>
        <div className="toolbar-filters">
          <Field as="select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="filter-select">
            <option value="all">Semua status</option>
            {WELL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Field>
          <Field as="select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="filter-select">
            <option value="all">Semua tipe</option>
            {WELL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Field>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table is-cards">
          <thead>
            <tr>
              <th onClick={() => handleSort('wellCode')}>Sumur <ChevronDown size={14} /></th>
              <th onClick={() => handleSort('status')}>Status</th>
              <th onClick={() => handleSort('plannedDepth')}>Rencana (m)</th>
              <th onClick={() => handleSort('actualDepth')}>Aktual (m)</th>
              <th className="th-coords">Koordinat</th>
              <th onClick={() => handleSort('drillingDate')}>Tgl. Bor</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedWells.map(well => (
              <WellRow
                key={well.id}
                well={well}
                onEdit={openEditForm}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onOpen={handleOpen}
                confirm={confirm}
              />
            ))}
            {paginatedWells.length === 0 && (
              <tr><td colSpan={7} className="empty-row">Tidak ada sumur yang cocok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>&laquo;</Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Button key={p} variant={page === p ? 'primary' : 'ghost'} size="sm" onClick={() => setPage(p)}>{p}</Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>&raquo;</Button>
        </div>
      )}

      {showForm && (
        <div className="dialog-layer is-open">
          <div className="dialog-scrim" onClick={closeForm} />
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <h3 id="form-title">{editingWell ? 'Edit Sumur' : 'Tambah Sumur Baru'}</h3>
            <WellForm well={formData} onSubmit={handleSubmit} onCancel={closeForm} loading={saving} wellTypes={WELL_TYPES} onChange={handleFormChange} />
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}