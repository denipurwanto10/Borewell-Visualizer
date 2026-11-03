import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button, useConfirm } from '../Primitives';
import { Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitted(true);

    if (!name.trim()) {
      setError('Nama lengkap wajib diisi.');
      return;
    }
    if (!email) {
      setError('Email wajib diisi.');
      return;
    }
    if (!password) {
      setError('Password wajib diisi.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }
    if (password.length < 12) {
      setError('Password minimal 12 karakter.');
      return;
    }

    setLoading(true);
    try {
      await register({
        email,
        password,
        passwordConfirmation: confirmPassword,
        fullName: name.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Pendaftaran gagal. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return null;
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Pendaftaran Berhasil</h1>
            <p>Akun Anda telah dibuat dan menunggu persetujuan Admin.</p>
          </div>
          <div className="auth-success" role="status">
            <p>Status akun: <strong>Menunggu Persetujuan</strong></p>
            <p>Silakan tunggu Admin menyetujui pendaftaran Anda sebelum masuk.</p>
          </div>
          <Button variant="primary" as="a" href="/login" className="auth-submit">
            Kembali ke Masuk
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      {confirmDialog}
      <div className="auth-card">
        <div className="auth-header">
          <h1>Daftar</h1>
          <p>Buat akun baru untuk Borewell Engineering Visualizer.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="name">Nama Lengkap</label>
            <input
              id="name"
              type="text"
              placeholder="Contoh: Budi Santoso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="form-input"
            />
            {submitted && !name.trim() && (
              <span className="form-error" role="alert">
                Nama lengkap wajib diisi.
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="nama@contoh.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="form-input"
            />
            {submitted && !email && (
              <span className="form-error" role="alert">
                Email wajib diisi.
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="input-with-toggle">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="form-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <span className="form-hint">Minimal 12 karakter.</span>
            {submitted && !password && (
              <span className="form-error" role="alert">
                Password wajib diisi.
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm_password">Konfirmasi Password</label>
            <div className="input-with-toggle">
              <input
                id="confirm_password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="form-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {(submitted || confirmPassword) && password !== confirmPassword && (
              <span className="form-error" role="alert">
                Konfirmasi password tidak cocok.
              </span>
            )}
          </div>

          <Button type="submit" variant="primary" className="auth-submit" loading={loading} disabled={loading}>
            Daftar
          </Button>
        </form>

        <div className="auth-footer">
          <p>Sudah punya akun? <a href="/login">Masuk</a></p>
        </div>
      </div>
    </div>
  );
}