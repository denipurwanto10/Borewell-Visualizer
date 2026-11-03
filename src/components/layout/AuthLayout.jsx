export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      <main className="auth-viewport" aria-label="Halaman autentikasi">
        {children}
      </main>
    </div>
  );
}
