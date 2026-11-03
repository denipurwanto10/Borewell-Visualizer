import { useAuth } from '../../context/AuthContext';
import { Button } from '../Primitives';

export default function PendingApprovalPage() {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.status !== 'pending') {
    return null;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Akun Menunggu Persetujuan</h1>
          <p>Pendaftaran Anda masih menunggu persetujuan dari Admin.</p>
        </div>

        <div className="auth-pending-info" role="status">
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Status:</strong> Menunggu Persetujuan</p>
          <p>Silakan tunggu Admin meninjau dan menyetujui akun Anda. Anda akan mendapat notifikasi setelah akun disetujui.</p>
        </div>

        <div className="auth-actions">
          <Button variant="ghost" as="a" href="/login">Kembali ke Halaman Masuk</Button>
          <Button variant="destructive" onClick={logout}>Keluar</Button>
        </div>
      </div>
    </div>
  );
}