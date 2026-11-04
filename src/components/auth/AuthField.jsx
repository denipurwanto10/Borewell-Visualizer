import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Field form untuk halaman autentikasi: label terhubung ke input (htmlFor),
 * ikon di kiri, tombol lihat/sembunyikan password, dan pesan hint/error.
 */
export default function AuthField({
  id,
  label,
  icon: Icon,
  type = 'text',
  value,
  onChange,
  invalid = false,
  hint,
  error,
  ...inputProps
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`auth-field ${invalid || error ? 'is-invalid' : ''}`}>
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className="auth-control">
        {Icon && <span className="auth-control-ico" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>}
        <input
          id={id}
          name={id}
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={onChange}
          className={`auth-input ${Icon ? 'has-ico' : ''} ${isPassword ? 'has-toggle' : ''}`}
          aria-invalid={invalid || !!error || undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className="auth-toggle"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
            aria-pressed={show}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error
        ? <span className="auth-msg is-error" id={`${id}-error`} role="alert">{error}</span>
        : hint && <span className="auth-msg" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}
