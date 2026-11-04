import { useState } from 'react';
import { Mail, Lock, ArrowRight, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../Primitives';
import AuthField from './AuthField';
import AuthLink from './AuthLink';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email wajib diisi.');
      return;
    }
    if (!password) {
      setError('Password wajib diisi.');
      return;
    }

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
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-eyebrow">Selamat datang kembali</span>
          <h1>Masuk</h1>
          <p>Masuk ke akun Borewell Engineering Visualizer Anda.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="auth-error" role="alert">
              <TriangleAlert size={17} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <AuthField
            id="email"
            label="Email"
            icon={Mail}
            type="email"
            placeholder="nama@contoh.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            invalid={!!error && !email}
          />

          <AuthField
            id="password"
            label="Password"
            icon={Lock}
            type="password"
            placeholder="Masukkan password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            invalid={!!error && !password}
          />

          <Button type="submit" variant="primary" className="auth-submit" loading={loading} disabled={loading}>
            {loading ? 'Memproses…' : <>Masuk <ArrowRight size={17} aria-hidden="true" /></>}
          </Button>
        </form>

        <div className="auth-footer">
          <p>Belum punya akun? <AuthLink href="/register">Daftar sekarang</AuthLink></p>
        </div>
      </div>
    </div>
  );
}
