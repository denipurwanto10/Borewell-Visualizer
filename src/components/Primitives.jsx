import React, { useCallback, useEffect, useRef, useState, useContext, isValidElement } from 'react';
import { MoreHorizontal, Check, ChevronDown, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

/* ---------- Button ---------- */
export function Button({ children, variant = 'primary', size, icon: Icon, loading = false, disabled = false, className = '', ...props }) {
  const tone = variant === 'destructive' ? 'danger' : variant;
  return (
    <button
      type="button"
      className={`btn btn-${tone} ${size ? `btn-${size}` : ''} ${loading ? 'is-loading' : ''} ${className}`}
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
export function Field({ label, unit, hint, error, className = '', as: Element = 'input', children, ...props }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-control">
        {Element === 'select' || Element === 'textarea'
          ? <Element className="field-input" {...props}>{children}</Element>
          : <Element className="field-input" {...props} />}
        {Element !== 'select' && Element !== 'textarea' && children && <span className="field-icon">{children}</span>}
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
  const numValue = Number(value);
  const safeValue = Number.isFinite(numValue) ? numValue : 0;
  const [shown, setShown] = useState(safeValue);
  const from = useRef(safeValue);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(safeValue); from.current = safeValue; return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - (1 - t) ** 4;
      const v = a + (safeValue - a) * e;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safeValue, ms]);
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

/* ---------- Stat card ---------- */
export function Stat({ label, value, unit, decimals = true, icon: Icon, color }) {
  const numValue = Number(value);
  const safeValue = Number.isFinite(numValue) ? numValue : 0;
  const [shown, setShown] = useState(safeValue);
  const from = useRef(safeValue);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(safeValue); from.current = safeValue; return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 750);
      const e = 1 - (1 - t) ** 4;
      const v = a + (safeValue - a) * e;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safeValue]);

  function formatNumber(num) {
    if (num === null || num === undefined || num === '-' || num === '') return '-';
    if (typeof num === 'string') { if (num === '-') return '-'; num = parseFloat(num); if (isNaN(num)) return '-'; }
    const formatted = Number(num).toFixed(2);
    return formatted.replace(/\.00$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
  }

  return (
    <div className="stat" style={color ? { '--stat-color': color } : {}}>
      {Icon && (
        <div className="stat-icon" style={{ color: color || 'var(--teal)' }}>
          {/* Terima component referensi (mis. UserPlus) atau elemen React (mis. <FolderOpen size={24} />). */}
          {isValidElement(Icon) ? Icon : <Icon />}
        </div>
      )}
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        <b>{decimals ? formatNumber(shown) : Math.round(shown)}</b>
        {unit && <i>{unit}</i>}
      </span>
    </div>
  );
}

/* ---------- Page heading ---------- */
// Kicker berfungsi sebagai penunjuk lokasi (breadcrumb) — nomor urut "01 ·" dan
// nilai kosong ("undefined") dibuang agar tampil bersih.
const cleanKicker = (k) => (typeof k === 'string'
  ? k.replace(/^\s*\d+\s*·\s*/, '').replace(/:\s*(undefined|null)\s*$/i, '').trim()
  : k);

export function PageHead({ kicker, title, description, children }) {
  const label = cleanKicker(kicker);
  return (
    <header className="page-head">
      <div className="page-head-text">
        {label ? <span className="kicker">{label}</span> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-head-aside">{children}</div>}
    </header>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({ value, onChange, children, className = '' }) {
  const [activeValue, setActiveValue] = useState(value);
  useEffect(() => { setActiveValue(value); }, [value]);
  return (
    <TabsContext.Provider value={{ activeValue, onChange }}>
      <div className={`tabs ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children }) {
  return <div className="tab-list" role="tablist">{children}</div>;
}

export function Tab({ value, children, disabled }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be used within Tabs');
  const { activeValue, onChange } = context;
  const isActive = activeValue === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      className={`tab ${isActive ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={() => !disabled && onChange(value)}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

const TabsContext = React.createContext(null);

export function TabPanels({ value, children }) {
  const [activeValue, setActiveValue] = useState(value);
  useEffect(() => { setActiveValue(value); }, [value]);
  return (
    <TabsContext.Provider value={{ activeValue }}>
      <div className="tab-panels">{children}</div>
    </TabsContext.Provider>
  );
}

export function TabPanel({ value, children }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanel must be used within Tabs');
  const { activeValue } = context;
  if (activeValue !== value) return null;
  return <div className="tab-panel" role="tabpanel">{children}</div>;
}

/* ---------- Card ---------- */
export function Card({ title, children, className = '', footer }) {
  return (
    <div className={`card ${className}`}>
      {title && <div className="card-header"><h3>{title}</h3></div>}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`badge badge-${variant} ${className}`}>{children}</span>
  );
}

/* ---------- Section header ---------- */
export function SectionHeader({ title, children }) {
  return (
    <div className="section-header">
      <h3>{title}</h3>
      <div className="section-actions">{children}</div>
    </div>
  );
}


/* ---------- RowMenu: menu aksi per baris ----------
   Terbuka saat tombol ditekan, ditutup lewat klik di luar / Esc / gulir.
   Posisi "fixed" supaya tidak terpotong oleh tabel yang bisa digulir, dan
   otomatis membuka ke atas bila ruang di bawah tidak cukup. */
export function RowMenu({ children, label = 'Opsi' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(below < 260 && r.top > below
      ? { bottom: window.innerHeight - r.top + 6, right }
      : { top: r.bottom + 6, right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { close(); btnRef.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div className={`action-menu ${open ? 'is-open' : ''}`} ref={wrapRef}>
      <button type="button" ref={btnRef} className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="dropdown" role="menu" style={pos} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
