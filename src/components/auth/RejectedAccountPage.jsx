import { useAuth } from '../../context/AuthContext';
import { Button } from '../Primitives';

export default function RejectedAccountPage() {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.status !== 'rejected') {
    return null;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Pendaftaran Ditolak</h1>
          <p>Pendaftaran akun Anda telah ditolak oleh Admin.</p>
        </div>

        <div className="auth-rejected-info" role="status">
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Status:</strong> Ditolak</p>
          <p>Anda tidak dapat masuk ke aplikasi. Jika Anda menganggap ini merupakan kesalahan, silakan hubungi Admin untuk informasi lebih lanjut.</p>
        </div>

        <div className="auth-actions">
          <Button variant="destructive" onClick={logout}>Keluar</Button>
        </div>
      </div>
    </div>
  );
}