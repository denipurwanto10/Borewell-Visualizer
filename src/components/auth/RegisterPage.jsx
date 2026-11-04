import { useState } from 'react';
import { User, Mail, Lock, ShieldCheck, ArrowRight, TriangleAlert, CircleCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../Primitives';
import AuthField from './AuthField';
import AuthLink from './AuthLink';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

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
            <span className="auth-badge is-ok" aria-hidden="true"><CircleCheck size={26} strokeWidth={1.8} /></span>
            <h1>Pendaftaran Berhasil</h1>
            <p>Akun Anda telah dibuat dan menunggu persetujuan Admin.</p>
          </div>
          <div className="auth-success" role="status">
            <p>Status akun: <strong>Menunggu Persetujuan</strong></p>
            <p>Silakan tunggu Admin menyetujui pendaftaran Anda sebelum masuk.</p>
          </div>
          <AuthLink href="/login" className="btn btn-primary auth-submit">
            <span className="btn-label">Kembali ke Masuk</span>
          </AuthLink>
        </div>
      </div>
    );
  }

  const mismatch = !!confirmPassword && password !== confirmPassword;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-eyebrow">Akun baru</span>
          <h1>Daftar</h1>
          <p>Buat akun baru untuk Borewell Engineering Visualizer.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="auth-error" role="alert">
              <TriangleAlert size={17} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <AuthField
            id="name"
            label="Nama Lengkap"
            icon={User}
            placeholder="Contoh: Budi Santoso"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            invalid={!!error && !name.trim()}
          />

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

          <div className="auth-row">
            <AuthField
              id="password"
              label="Password"
              icon={Lock}
              type="password"
              placeholder="Minimal 12 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              invalid={!!error && !password}
              hint="Minimal 12 karakter."
            />

            <AuthField
              id="confirm_password"
              label="Konfirmasi Password"
              icon={ShieldCheck}
              type="password"
              placeholder="Ulangi password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              error={mismatch ? 'Konfirmasi password tidak cocok.' : undefined}
            />
          </div>

          <Button type="submit" variant="primary" className="auth-submit" loading={loading} disabled={loading}>
            {loading ? 'Memproses…' : <>Daftar <ArrowRight size={17} aria-hidden="true" /></>}
          </Button>
        </form>

        <div className="auth-footer">
          <p>Sudah punya akun? <AuthLink href="/login">Masuk</AuthLink></p>
        </div>
      </div>
    </div>
  );
}
