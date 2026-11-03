import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Filter, ChevronDown, MoreHorizontal, Edit, Trash2, Copy, Archive, RotateCcw, FolderOpen, ExternalLink, Loader2 } from 'lucide-react';
import { Button, Field, PageHead, RowMenu, useConfirm } from '../components/Primitives';
import { useProject } from '../context/ProjectContext';

const STATUS_STYLES = {
  planning: { bg: 'var(--blue)', text: '#fff' },
  in_progress: { bg: 'var(--teal)', text: '#fff' },
  completed: { bg: 'var(--green)', text: '#fff' },
  on_hold: { bg: 'var(--ochre)', text: '#fff' },
  archived: { bg: 'var(--mute)', text: '#fff' },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.planning;
  return (
    <span className="status-badge" style={{ background: style.bg, color: style.text }}>
      {status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

function ProjectRow({ project, onEdit, onDelete, onDuplicate, onArchive, onRestore, onView, confirm }) {
  const style = STATUS_STYLES[project.status] || STATUS_STYLES.planning;
  const isArchived = project.status === 'archived';

  return (
    <tr className={isArchived ? 'is-archived' : ''}>
      <td className="col-main">
        <div className="project-name-wrap">
          <strong>{project.projectName}</strong>
          <span className="mono project-code">{project.projectCode}</span>
        </div>
        <div className="project-meta">
          <span>{project.clientName}</span>
          <span>·</span>
          <span>{project.location || '-'}</span>
        </div>
      </td>
      <td><StatusBadge status={project.status} /></td>
      <td className="mono">{project.wellCount || 0}</td>
      <td className="mono">{project.startDate ? new Date(project.startDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
      <td className="mono">{project.updatedAt ? new Date(project.updatedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
      <td>
        <RowMenu>
            <button onClick={() => onView(project.id)}><ExternalLink size={16} /><span>Lihat detail</span></button>
            <button onClick={() => onEdit(project)}><Edit size={16} /><span>Edit</span></button>
            <button onClick={() => onDuplicate(project.id)}><Copy size={16} /><span>Duplikat</span></button>
            {isArchived ? (
              <button onClick={() => onRestore(project.id)}><RotateCcw size={16} /><span>Pulihkan</span></button>
            ) : (
              <button onClick={() => onArchive(project.id)}><Archive size={16} /><span>Arsipkan</span></button>
            )}
            <hr />
            <button onClick={() => onDelete(project.id)} className="danger"><Trash2 size={16} /><span>Hapus</span></button>
          </RowMenu>
      </td>
    </tr>
  );
}

function ProjectForm({ project, onSubmit, onChange, onCancel, loading }) {
  return (
    <form onSubmit={onSubmit} className="form-dialog">
      <div className="form-grid">
        <Field label="Kode proyek" placeholder="PRJ-001" {...{ value: project.projectCode, onChange: e => onChange({ projectCode: e.target.value }) }} className="col-2" />
        <Field label="Nama proyek" placeholder="Pembangunan Sumur Bor" {...{ value: project.projectName, onChange: e => onChange({ projectName: e.target.value }) }} className="col-2" />
        <Field label="Nama klien" placeholder="PT. Klien Tbk" {...{ value: project.clientName, onChange: e => onChange({ clientName: e.target.value }) }} className="col-2" />
        <Field label="Kontraktor" placeholder="PT. Kontraktor" {...{ value: project.contractorName, onChange: e => onChange({ contractorName: e.target.value }) }} className="col-2" />
        <Field label="Lokasi" placeholder="Jl. Contoh No. 123" {...{ value: project.location, onChange: e => onChange({ location: e.target.value }) }} className="col-2" />
        <Field label="Provinsi" as="select" {...{ value: project.province, onChange: e => onChange({ province: e.target.value }) }} className="col-2">
          <option value="">Pilih provinsi</option>
          {['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan', 'Bangka Belitung', 'Bengkulu', 'Lampung', 'Banten', 'DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Gorontalo', 'Sulawesi Barat', 'Maluku', 'Maluku Utara', 'Papua', 'Papua Barat', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan', 'Papua Barat Daya'].map(p => <option key={p} value={p}>{p}</option>)}
        </Field>
        <Field label="Kabupaten / kota" placeholder="Bandung" {...{ value: project.district, onChange: e => onChange({ district: e.target.value }) }} />
        <Field label="Desa / kelurahan" placeholder="Pasirkaliki" {...{ value: project.village, onChange: e => onChange({ village: e.target.value }) }} className="col-2" />
        <Field label="Latitude" type="number" step="0.0001" placeholder="-7.7821" {...{ value: project.latitude, onChange: e => onChange({ latitude: e.target.value }) }} />
        <Field label="Longitude" type="number" step="0.0001" placeholder="110.3671" {...{ value: project.longitude, onChange: e => onChange({ longitude: e.target.value }) }} />
        <Field label="Tanggal mulai" type="date" {...{ value: project.startDate, onChange: e => onChange({ startDate: e.target.value }) }} />
        <Field label="Tanggal selesai" type="date" {...{ value: project.endDate, onChange: e => onChange({ endDate: e.target.value }) }} />
        <Field label="Status" as="select" {...{ value: project.status, onChange: e => onChange({ status: e.target.value }) }} className="col-2">
          {['planning', 'in_progress', 'completed', 'on_hold', 'archived'].map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </Field>
        <Field label="Deskripsi" as="textarea" rows={3} placeholder="Catatan tambahan..." {...{ value: project.description, onChange: e => onChange({ description: e.target.value }) }} className="col-2" />
      </div>
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Batal</Button>
        <Button type="submit" variant="primary" loading={loading} icon={project.id ? undefined : Plus}>{project.id ? 'Simpan' : 'Buat'}</Button>
      </div>
    </form>
  );
}

export default function ProjectsPage() {
  const { projects, createProject, updateProject, deleteProject, archiveProject, restoreProject, duplicateProject, selectProject, notify, PROJECT_STATUSES } = useProject();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const PAGE_SIZE_OPTIONS = [10, 25, 50];

  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => p.projectName.toLowerCase().includes(q) || p.projectCode.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }
    result.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [projects, search, statusFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filteredProjects.length / pageSize) || 1;
  const paginatedProjects = filteredProjects.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
    setPage(1);
  };

  const openCreateForm = () => {
    setEditingProject(null);
    setFormData({ projectCode: '', projectName: '', clientName: '', contractorName: '', location: '', province: '', district: '', village: '', latitude: '', longitude: '', startDate: '', endDate: '', status: 'planning', description: '' });
    setFormErrors({});
    setShowForm(true);
  };

  const openEditForm = (project) => {
    setEditingProject(project);
    setFormData({ ...project });
    setFormErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingProject(null);
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
    if (editingProject) {
      const res = updateProject(editingProject.id, formData);
      if (res.success) closeForm();
      else setFormErrors(res.errors);
    } else {
      const res = createProject(formData);
      if (res.success) closeForm();
      else setFormErrors(res.errors);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await deleteProject(id, confirm);
  };

  const handleArchive = (id) => {
    archiveProject(id);
  };

  const handleRestore = (id) => {
    restoreProject(id);
  };

  const handleDuplicate = (id) => {
    duplicateProject(id);
  };

  const handleView = (id) => {
    selectProject(id);
    window.location.hash = `#project/${id}`;
  };

  if (projects.length === 0 && !showForm) {
    return (
      <div className="projects-page">
        <PageHead kicker="01 · Proyek" title="Kelola Proyek" description="Daftar proyek sumur bor. Buat proyek baru untuk memulai.">
          <Button variant="primary" icon={Plus} onClick={openCreateForm}>Buat Proyek</Button>
        </PageHead>
        <div className="empty-state">
          <FolderOpen size={64} />
          <h3>Belum ada proyek</h3>
          <p>Buat proyek pertama Anda untuk mulai mengelola sumur bor.</p>
          <Button variant="primary" icon={Plus} onClick={openCreateForm} className="mt-4">Buat Proyek Pertama</Button>
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="projects-page">
      <PageHead kicker="01 · Proyek" title="Kelola Proyek" description={`Total ${projects.length} proyek`}>
        <Button variant="primary" icon={Plus} onClick={openCreateForm}>Buat Proyek</Button>
      </PageHead>

      <div className="toolbar">
        <div className="toolbar-search">
          <Field
            placeholder="Cari nama, kode, klien..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="search-field"
          >
            <Search className="search-icon" size={18} />
          </Field>
        </div>
        <div className="toolbar-filters">
          <Field as="select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="filter-select">
            <option value="all">Semua status</option>
            {PROJECT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Field>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('projectName')}>Proyek <ChevronDown size={14} /></th>
              <th onClick={() => handleSort('status')}>Status</th>
              <th onClick={() => handleSort('wellCount')}>Jumlah Sumur</th>
              <th onClick={() => handleSort('startDate')}>Mulai</th>
              <th onClick={() => handleSort('updatedAt')}>Diperbarui</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProjects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                onEdit={openEditForm}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onView={handleView}
                confirm={confirm}
              />
            ))}
            {paginatedProjects.length === 0 && (
              <tr><td colSpan={6} className="empty-row">Tidak ada proyek yang cocok</td></tr>
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
            <h3 id="form-title">{editingProject ? 'Edit Proyek' : 'Buat Proyek Baru'}</h3>
            <ProjectForm project={formData} onSubmit={handleSubmit} onChange={handleFormChange} onCancel={closeForm} loading={saving} />
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}