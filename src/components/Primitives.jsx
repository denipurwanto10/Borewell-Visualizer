import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

/* ---------- Button ---------- */
export function Button({ children, variant = 'primary', icon: Icon, loading = false, disabled = false, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${loading ? 'is-loading' : ''} ${className}`}
      {...props}
      disabled={loading || disabled}
    >
      <span className="btn-icon">
        {loading ? <LoaderCircle size={17} className="spin" /> : Icon && <Icon size={17} strokeWidth={2} />}
      </span>
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/* ---------- Field ---------- */
export function Field({ label, unit, hint, error, className = '', as: Element = 'input', ...props }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-control">
        <Element className="field-input" {...props} />
        {unit && <span className="field-unit">{unit}</span>}
      </span>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

/* ---------- Accordion step ---------- */
export function Step({ index, title, summary, open, onToggle, done, children }) {
  return (
    <section className={`step ${open ? 'is-open' : ''} ${done ? 'is-done' : ''}`}>
      <button type="button" className="step-head" onClick={onToggle} aria-expanded={open}>
        <span className="step-num" aria-hidden="true">
          <span className="step-num-text">{index}</span>
          <Check className="step-num-check" size={14} strokeWidth={3} />
        </span>
        <span className="step-title">{title}</span>
        <span className="step-summary">{summary}</span>
        <ChevronDown className="step-chev" size={18} />
      </button>
      <div className="step-body">
        <div className="step-body-inner">
          <div className="step-content">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Animated removal for list rows ---------- */
export function useExit(onRemove, ms = 260) {
  const [leaving, setLeaving] = useState(() => new Set());
  const remove = useCallback((id) => {
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => {
      onRemove(id);
      setLeaving((s) => { const n = new Set(s); n.delete(id); return n; });
    }, ms);
  }, [onRemove, ms]);
  return [leaving, remove];
}

export function Row({ leaving, children }) {
  return (
    <div className={`row ${leaving ? 'is-leaving' : ''}`}>
      <div className="row-inner">{children}</div>
    </div>
  );
}

/* ---------- Number tween ---------- */
export function useCountUp(value, ms = 750) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(value); from.current = value; return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - (1 - t) ** 4;
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/* ---------- Toast (with exit animation) ---------- */
const TOAST_ICON = { success: CircleCheck, warning: TriangleAlert, error: CircleX, info: Info };

export function Toast({ toast, onClose }) {
  const [view, setView] = useState(toast);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (toast) {
      setView(toast);
      const raf = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(raf);
    }
    setOpen(false);
    const t = setTimeout(() => setView(null), 380);
    return () => clearTimeout(t);
  }, [toast]);

  if (!view) return null;
  const Icon = TOAST_ICON[view.type] || Info;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast toast-${view.type || 'info'} ${open ? 'is-open' : ''}`}>
        <Icon size={19} className="toast-icon" />
        <span className="toast-msg">{view.message}</span>
        <button type="button" className="toast-close" onClick={onClose} aria-label="Tutup notifikasi"><X size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- Confirm dialog ---------- */
function ConfirmDialog({ state, onClose }) {
  const [view, setView] = useState(state);
  const [open, setOpen] = useState(false);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (state) {
      setView(state);
      const raf = requestAnimationFrame(() => { setOpen(true); cancelRef.current?.focus(); });
      return () => cancelAnimationFrame(raf);
    }
    setOpen(false);
    const t = setTimeout(() => setView(null), 320);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onClose]);

  if (!view) return null;
  return (
    <div className={`dialog-layer ${open ? 'is-open' : ''}`}>
      <div className="dialog-scrim" onClick={() => onClose(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <div className="dialog-mark"><TriangleAlert size={20} /></div>
        <h3 id="dlg-title">{view.title}</h3>
        <p>{view.message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={() => onClose(false)}><span className="btn-label">Batal</span></button>
          <button type="button" className="btn btn-danger" onClick={() => onClose(true)}><span className="btn-label">{view.confirmLabel || 'Ya, lanjutkan'}</span></button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current = resolve;
    setState(options);
  }), []);
  const close = useCallback((value) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  }, []);
  return [confirm, <ConfirmDialog key="confirm" state={state} onClose={close} />];
}

/* ---------- Page heading ---------- */
export function PageHead({ kicker, title, description, children }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-head-aside">{children}</div>}
    </header>
  );
}
