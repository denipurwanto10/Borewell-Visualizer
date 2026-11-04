import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Field, useConfirm, PageHead, Stat } from '../Primitives';
import { apiRequest } from '../../api/client';
import { UserPlus, CheckCircle, XCircle, Clock, UserX, RotateCcw } from 'lucide-react';

const STATUS_LABELS = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  suspended: 'Ditangguhkan',
};

const STATUS_COLORS = {
  pending: 'text-yellow-600 bg-yellow-50 border-yellow-100',
  approved: 'text-green-600 bg-green-50 border-green-100',
  rejected: 'text-red-600 bg-red-50 border-red-100',
  suspended: 'text-orange-600 bg-orange-50 border-orange-100',
};

export default function AdminApprovalPage() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [confirm, confirmDialog] = useConfirm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/admin/users/pending');
      const data = await res.json();
      setUsers(data.data || []);
    } catch (err) {
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      fetchUsers();
    }
  }, [isAuthenticated, isAdmin, fetchUsers]);

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const handleApprove = async (id) => {
    const ok = await confirm({
      title: 'Setujui Pengguna?',
      message: 'Anda yakin ingin menyetujui pendaftaran ini? Pengguna akan dapat masuk ke aplikasi.',
      confirmLabel: 'Setujui',
    });
    if (!ok) return;

    try {
      await apiRequest(`/admin/users/${id}/approve`, { method: 'POST' });
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Gagal menyetujui pengguna');
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Alasan penolakan (opsional):');
    if (reason === null) return;

    try {
      await apiRequest(`/admin/users/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Gagal menolak pengguna');
    }
  };

  const handleSuspend = async (id) => {
    const reason = prompt('Alasan penangguhan (opsional):');
    if (reason === null) return;

    try {
      await apiRequest(`/admin/users/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Gagal menangguhkan pengguna');
    }
  };

  const filteredUsers = users.filter(u => filterStatus === 'all' || u.status === filterStatus);

  return (
    <div className="admin-approval-page">
      <PageHead
        kicker="Administrasi Pengguna"
        title="Persetujuan Admin"
        description="Kelola pendaftaran pengguna dan persetujuan akun."
      />
      {confirmDialog}

      {error && (
        <div className="auth-error" role="alert">{error}</div>
      )}

      <div className="admin-stats">
        <Stat label="Total Pendaftar" value={users.length} icon={UserPlus} />
        <Stat label="Menunggu" value={users.filter(u => u.status === 'pending').length} icon={Clock} />
        <Stat label="Disetujui" value={users.filter(u => u.status === 'approved').length} icon={CheckCircle} />
        <Stat label="Ditolak / Ditangguhkan" value={users.filter(u => u.status === 'rejected' || u.status === 'suspended').length} icon={UserX} />
      </div>

      <div className="admin-toolbar">
        <Field label="" as="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">Semua Status</option>
          <option value="pending">Menunggu Persetujuan</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
          <option value="suspended">Ditangguhkan</option>
        </Field>
        <button className="btn btn-ghost" onClick={fetchUsers}>
          <RotateCcw size={16} strokeWidth={2} /> Muat Ulang
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Status</th>
              <th>Dibuat pada</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="loading-row">Memuat data...</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">Tidak ada data pendaftar.</td></tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nama" className="admin-cell-name">{u.full_name || '-'}</td>
                  <td data-label="Email" className="admin-cell-email">{u.email}</td>
                  <td data-label="Status">
                    <span className={`badge ${STATUS_COLORS[u.status] || ''}`}>
                      {STATUS_LABELS[u.status] || u.status}
                    </span>
                  </td>
                  <td data-label="Dibuat pada">{new Date(u.created_at).toLocaleDateString('id-ID')}</td>
                  <td data-label="Aksi" className="admin-cell-actions">
                    <div className="action-buttons">
                      {u.status === 'pending' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleApprove(u.id)} title="Setujui">
                            <CheckCircle size={16} strokeWidth={2} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleReject(u.id)} title="Tolak">
                            <XCircle size={16} strokeWidth={2} />
                          </button>
                        </>
                      )}
                      {u.status === 'suspended' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleSuspend(u.id)} title="Aktifkan Kembali">
                          <RotateCcw size={16} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}