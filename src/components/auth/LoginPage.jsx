import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button, useConfirm } from '../Primitives';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitted(true);

    if (!email || !password) return; // pesan tampil di bawah kolom yang kosong

    setLoading(true);
    try {
      await login({ email, password });
    } catch (err) {
      setError(err.message || 'Login gagal. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="auth-page">
      {confirmDialog}
      <div className="auth-card">
        <div className="auth-header">
          <h1>Masuk</h1>
          <p>Masuk ke akun Borewell Engineering Visualizer Anda.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

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
            {submitted && !email && <span className="form-error" role="alert">Email wajib diisi.</span>}
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
                autoComplete="current-password"
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
            {submitted && !password && <span className="form-error" role="alert">Password wajib diisi.</span>}
          </div>

          <Button type="submit" variant="primary" className="auth-submit" loading={loading} disabled={loading}>
            Masuk
          </Button>
        </form>

        <div className="auth-footer">
          <p>Belum punya akun? <a href="/register">Daftar sekarang</a></p>
        </div>
      </div>
    </div>
  );
}