import { useEffect, useState, useCallback } from 'react';
import { Plus, UserX, UserCheck, Shield, UserCog, Loader2, AlertCircle, ChevronsUpDown } from 'lucide-react';
import { PageHead, Button, Field, Modal, Toast, Badge, useConfirm } from '../Primitives';
import { apiRequest } from '../../api/client';

const STATUS_LABELS = { approved: 'Aktif', pending: 'Menunggu', rejected: 'Ditolak', suspended: 'Ditolak' };
const STATUS_COLORS = { approved: 'success', pending: 'warning', rejected: 'error', suspended: 'error' };

function RoleBadge({ role }) {
  return <Badge variant={role === 'admin' ? 'primary' : 'secondary'}>{role === 'admin' ? 'Admin' : 'Staf'}</Badge>;
}

function StatusBadge({ status }) {
  return <Badge variant={STATUS_COLORS[status] || 'secondary'}>{STATUS_LABELS[status] || status}</Badge>;
}

function ActionButtons({ user, onEdit, onDelete, onToggleSuspend, loading }) {
  const isSelf = false; // would check against current user
  if (user.status === 'pending') {
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="success" size="sm" icon={UserCheck} onClick={() => onEdit(user, 'approve')}>Setujui</Button>
        <Button variant="danger" size="sm" icon={UserX} onClick={() => onEdit(user, 'reject')}>Tolak</Button>
      </div>
    );
  }
  if (user.status === 'rejected') {
    return <span style={{ color: 'var(--mute)', fontSize: '12px' }}>Ditolak</span>;
  }
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {user.status === 'approved' && (
        <Button variant="warning" size="sm" icon={UserCog} onClick={() => onToggleSuspend(user, true)} disabled={loading || isSelf}>
          Suspend
        </Button>
      )}
      {user.status === 'suspended' && (
        <Button variant="success" size="sm" icon={UserCheck} onClick={() => onToggleSuspend(user, false)} disabled={loading || isSelf}>
          Aktifkan
        </Button>
      )}
      <Button variant="danger" size="sm" icon={UserX} onClick={() => onDelete(user)} disabled={loading || isSelf}>Hapus</Button>
    </div>
  );
}

export default function UserManagementPage({ notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState({ email: '', password: '', fullName: '', role: 'user' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('page_size', pageSize);
    if (statusFilter) params.set('status', statusFilter);
    if (roleFilter) params.set('role', roleFilter);
    if (search) params.set('search', search);
    return params.toString();
  }, [page, pageSize, statusFilter, roleFilter, search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/admin/users?' + buildParams());
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data);
        setTotal(data.meta.total);
        setTotalPages(data.meta.total_pages);
      }
    } catch (e) {
      console.error(e);
      notify('Gagal memuat daftar pengguna', 'error');
    } finally {
      setLoading(false);
    }
  }, [buildParams, notify]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!formData.email || !formData.password || !formData.fullName) {
      setFormErrors({ general: 'Semua field wajib diisi' });
      return;
    }
    if (formData.password.length < 12) {
      setFormErrors({ password: 'Password minimal 12 karakter' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        notify('Pengguna berhasil dibuat', 'success');
        setModalOpen(false);
        fetchUsers();
      } else {
        const err = await res.json();
        setFormErrors({ general: err.detail || 'Gagal membuat pengguna' });
      }
    } catch (e) {
      setFormErrors({ general: 'Terjadi kesalahan' });
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({ email: '', password: '', fullName: '', role: 'user' });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleApprove = async (user, action) => {
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    const reason = action === 'reject' ? await confirmDialog({ title: 'Alasan penolakan', message: 'Masukkan alasan penolakan:' }) : '';
    try {
      const res = await apiRequest(`/admin/users/${user.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        notify(`Pengguna berhasil di${action === 'approve' ? 'setujui' : 'tolak'}`, 'success');
        fetchUsers();
      }
    } catch (e) { notify('Gagal', 'error'); }
  };

  const handleToggleSuspend = async (user, suspend) => {
    try {
      const res = await apiRequest(`/admin/users/${user.id}/${suspend ? 'suspend' : 'unsuspend'}`, {
        method: 'POST',
        body: JSON.stringify({ reason: suspend ? 'Suspended by admin' : '' }),
      });
      if (res.ok) {
        notify(suspend ? 'Pengguna disuspend' : 'Pengguna diaktifkan', 'success');
        fetchUsers();
      }
    } catch (e) { notify('Gagal', 'error'); }
  };

  const handleDelete = async (user) => {
    const ok = await confirmDialog({ title: 'Hapus pengguna?', message: `Hapus ${user.email}?`, confirmLabel: 'Hapus', variant: 'danger' });
    if (!ok) return;
    try {
      // Use suspend as delete alternative since no delete endpoint
      const res = await apiRequest(`/admin/users/${user.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Deleted by admin' }),
      });
      if (res.ok) {
        notify('Pengguna dihapus (disuspend)', 'success');
        fetchUsers();
      }
    } catch (e) { notify('Gagal', 'error'); }
  };

  const columns = [
    { key: 'email', header: 'Email', width: '220px' },
    { key: 'full_name', header: 'Nama', width: '180px' },
    { key: 'role', header: 'Peran', render: (u) => <RoleBadge role={u.role} />, width: '100px' },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} />, width: '120px' },
    { key: 'created_at', header: 'Dibuat', render: (u) => new Date(u.created_at).toLocaleDateString('id-ID'), width: '130px' },
    { key: 'actions', header: 'Aksi', render: (u) => <ActionButtons user={u} onEdit={handleApprove} onDelete={handleDelete} onToggleSuspend={handleToggleSuspend} loading={loading} />, width: '220px' },
  ];

  return (
    <div className="page-content">
      <PageHead title="Manajemen Pengguna" subtitle="Kelola akun staf dan admin" action={<Button icon={Plus} onClick={openCreateModal}>Tambah Pengguna</Button>} />
      <div className="card" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'end' }}>
          <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email/nama" style={{ minWidth: '200px' }} />
          <Field as="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: '160px' }}>
            <option value="">Semua Status</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Field>
          <Field as="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ minWidth: '140px' }}>
            <option value="">Semua Peran</option>
            <option value="admin">Admin</option>
            <option value="user">Staf</option>
          </Field>
        </div>
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
                  {users.length === 0 ? (
                    <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px', color: 'var(--mute)' }}>Tidak ada pengguna</td></tr>
                  ) : (
                    users.map((row) => (
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
            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>&laquo;</Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return <Button key={p} variant={page === p ? 'primary' : 'ghost'} size="sm" onClick={() => setPage(p)}>{p}</Button>;
                })}
                <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>&raquo;</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalMode === 'create' ? 'Buat Pengguna Baru' : 'Edit Pengguna'} size="md">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(formErrors.general || formErrors.password) && <div className="toast error">{formErrors.general || formErrors.password}</div>}
          <div>
            <label className="form-label">Email</label>
            <Field type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
          </div>
          <div>
            <label className="form-label">Password {modalMode === 'create' ? '(min 12 karakter)' : '(kosongkan untuk tidak mengubah)'}</label>
            <Field type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required={modalMode === 'create'} />
          </div>
          <div>
            <label className="form-label">Nama Lengkap</label>
            <Field value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} required />
          </div>
          <div>
            <label className="form-label">Peran</label>
            <Field as="select" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} required>
              <option value="user">Staf</option>
              <option value="admin">Admin</option>
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" icon={Loader2} loading={submitting}>{modalMode === 'create' ? 'Buat' : 'Simpan'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}