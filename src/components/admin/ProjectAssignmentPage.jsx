import { useEffect, useState, useCallback } from 'react';
import { Plus, UserX, Edit, Trash2, Loader2, Shield, Users, ChevronsUpDown } from 'lucide-react';
import { PageHead, Button, Field, Modal, Toast, Badge, useConfirm } from '../Primitives';
import { apiRequest } from '../../api/client';

const PERMISSION_LABELS = { view: 'Lihat Saja', edit: 'Lihat & Edit' };
const PERMISSION_COLORS = { view: 'secondary', edit: 'primary' };

function PermissionBadge({ permission }) {
  return <Badge variant={PERMISSION_COLORS[permission] || 'secondary'}>{PERMISSION_LABELS[permission] || permission}</Badge>;
}

export default function ProjectAssignmentPage({ projectId, projectName, notify }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [formData, setFormData] = useState({ userId: '', permission: 'view' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState([]);
  const [confirm, confirmDialog] = useConfirm();

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/projects/${projectId}/assignments`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.data);
      }
    } catch (e) {
      console.error(e);
      notify('Gagal memuat assignment', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, notify]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiRequest('/admin/users?page_size=100');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data.filter(u => u.status === 'approved'));
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchUsers();
  }, [fetchAssignments, fetchUsers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!formData.userId || !formData.permission) {
      setFormErrors({ general: 'Semua field wajib diisi' });
      return;
    }
    const exists = assignments.find(a => a.user_id === formData.userId && (modalMode === 'create' || a.id !== editingAssignment?.id));
    if (exists) {
      setFormErrors({ userId: 'Pengguna sudah memiliki assignment pada proyek ini' });
      return;
    }
    setSubmitting(true);
    try {
      let res;
      if (modalMode === 'create') {
        res = await apiRequest(`/admin/projects/${projectId}/assignments`, {
          method: 'POST',
          body: JSON.stringify({ user_id: formData.userId, permission: formData.permission }),
        });
      } else {
        res = await apiRequest(`/admin/projects/${projectId}/assignments/${editingAssignment.user_id}`, {
          method: 'PUT',
          body: JSON.stringify({ permission: formData.permission }),
        });
      }
      if (res.ok) {
        notify(modalMode === 'create' ? 'Assignment ditambahkan' : 'Assignment diperbarui', 'success');
        setModalOpen(false);
        fetchAssignments();
      } else {
        const err = await res.json();
        setFormErrors({ general: err.detail || 'Gagal menyimpan' });
      }
    } catch (e) {
      setFormErrors({ general: 'Terjadi kesalahan' });
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingAssignment(null);
    setFormData({ userId: '', permission: 'view' });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (assignment) => {
    setModalMode('edit');
    setEditingAssignment(assignment);
    setFormData({ userId: assignment.user_id, permission: assignment.permission });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleDelete = async (assignment) => {
    const ok = await confirmDialog({ title: 'Hapus assignment?', message: `Hapus akses pengguna ini dari proyek?`, confirmLabel: 'Hapus', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await apiRequest(`/admin/projects/${projectId}/assignments/${assignment.user_id}`, { method: 'DELETE' });
      if (res.ok) {
        notify('Assignment dihapus', 'success');
        fetchAssignments();
      }
    } catch (e) { notify('Gagal', 'error'); }
  };

  const availableUsers = users.filter(u => !assignments.find(a => a.user_id === u.id));

  const columns = [
    { key: 'email', header: 'Pengguna', render: (a) => <span>{a.email}</span>, width: '250px' },
    { key: 'full_name', header: 'Nama', width: '200px' },
    { key: 'permission', header: 'Izin', render: (a) => <PermissionBadge permission={a.permission} />, width: '150px' },
    { key: 'created_at', header: 'Dibuat', render: (a) => new Date(a.created_at).toLocaleDateString('id-ID'), width: '150px' },
    { key: 'actions', header: 'Aksi', render: (a) => (
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="ghost" size="sm" icon={Edit} onClick={() => openEditModal(a)}>Edit</Button>
        <Button variant="danger" size="sm" icon={Trash2} onClick={() => handleDelete(a)}>Hapus</Button>
      </div>
    ), width: '180px' },
  ];

  return (
    <div className="page-content">
      <PageHead title={`Assignment: ${projectName}`} subtitle="Kelola akses staf ke proyek ini" action={<Button icon={Plus} onClick={openCreateModal}>Tambah Assignment</Button>} />
      <div className="card" style={{ marginTop: '16px' }}>
        {loading ? <div className="loading" style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="spin" size={24} /></div> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    {columns.map((col) => <th key={col.key} style={{ width: col.width }}>{col.header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {assignments.length === 0 ? (
                    <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px', color: 'var(--mute)' }}>Belum ada assignment</td></tr>
                  ) : (
                    assignments.map((row) => (
                      <tr key={row.id}>
                        {columns.map((col) => (
                          <td key={col.key}>
                            {col.render ? col.render(row) : row[col.key]}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalMode === 'create' ? 'Tambah Assignment' : 'Edit Assignment'} size="md">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {formErrors.general && <div className="toast error">{formErrors.general}</div>}
          <div>
            <label className="form-label">Pengguna</label>
            <Field as="select" value={formData.userId} onChange={(e) => setFormData({ ...formData, userId: e.target.value })} required disabled={modalMode === 'edit'}>
              {availableUsers.map(u => <option key={u.id} value={u.id}>{u.email} ({u.full_name})</option>)}
            </Field>
            {formErrors.userId && <span className="error-text">{formErrors.userId}</span>}
          </div>
          <div>
            <label className="form-label">Izin Akses</label>
            <Field as="select" value={formData.permission} onChange={(e) => setFormData({ ...formData, permission: e.target.value })} required>
              <option value="view">Lihat Saja</option>
              <option value="edit">Lihat & Edit</option>
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" icon={Loader2} loading={submitting}>{modalMode === 'create' ? 'Tambah' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}