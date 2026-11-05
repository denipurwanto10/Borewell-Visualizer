import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useContext, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

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
  const isDate = Element === 'input' && props.type === 'date';
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-control">
        {isDate
          ? <DateField {...props} />
          : Element === 'select' || Element === 'textarea'
            ? <Element className="field-input" {...props}>{children}</Element>
            : <Element className="field-input" {...props} />}
        {!isDate && Element !== 'select' && Element !== 'textarea' && children && <span className="field-icon">{children}</span>}
        {unit && <span className="field-unit">{unit}</span>}
      </span>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

/* ---------- Kalender kustom: popover di desktop, bottom sheet di layar kecil ---------- */
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

function DateField({ value, onChange, name, disabled, required, className, placeholder, ...rest }) {
  const mqSheet = '(max-width: 640px), (pointer: coarse) and (max-width: 820px)';
  const [sheet, setSheet] = useState(() => typeof window !== 'undefined' && window.matchMedia(mqSheet).matches);
  useEffect(() => {
    const mq = window.matchMedia(mqSheet);
    const on = () => setSheet(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const selected = parseISO(value);
  const [view, setView] = useState(() => selected || new Date());
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // Hitung posisi sebelum paint; popover memakai portal sehingga tidak terpotong modal.
  useLayoutEffect(() => {
    if (!open || sheet) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = Math.min(316, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left), window.innerWidth - W - 12);
    const below = window.innerHeight - r.bottom;
    const up = below < 400 && r.top > below;
    setPos(up
      ? { left, width: W, bottom: window.innerHeight - r.top + 8, up: true }
      : { left, width: W, top: r.bottom + 8, up: false });
  }, [open, sheet]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    const close = (e) => { if (!popRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    if (!sheet) {
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, { passive: true, capture: true });
    }
    const prevOverflow = document.body.style.overflow;
    if (sheet) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, { capture: true });
      document.body.style.overflow = prevOverflow;
    };
  }, [open, sheet]);

  const emit = (v) => onChange && onChange({ target: { value: v, name } });
  const pick = (d) => { emit(toISO(d)); setOpen(false); btnRef.current?.focus(); };
  const label = selected ? `${pad(selected.getDate())} ${BULAN[selected.getMonth()].slice(0, 3)} ${selected.getFullYear()}` : null;

  return (
    <span className={`datefield ${open ? 'is-open' : ''}`}>
      <button
        ref={btnRef} type="button" disabled={disabled}
        className={`field-input date-trigger ${label ? '' : 'is-empty'}`}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); if (!open) setView(selected || new Date()); setOpen((v) => !v); }}
      >
        <span>{label || placeholder || 'Pilih tanggal'}</span>
        <CalendarDays size={17} strokeWidth={1.8} />
      </button>
      {open && (sheet || pos) && createPortal(
        <DatePopover
          popRef={popRef} sheet={sheet} pos={pos} view={view} setView={setView}
          selected={selected} required={required} onPick={pick}
          onClear={() => { emit(''); setOpen(false); }} onClose={() => setOpen(false)}
        />,
        document.body,
      )}
    </span>
  );
}

function DatePopover({ popRef, sheet, pos, view, setView, selected, required, onPick, onClear, onClose }) {
  const y = view.getFullYear(); const m = view.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Senin = 0
  const today = new Date();
  const same = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const shift = (n) => setView(new Date(y, m + n, 1));
  const cells = [];
  for (let i = 0; i < 42; i += 1) cells.push(new Date(y, m, 1 - offset + i));
  const style = sheet ? undefined : { left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom };

  return (
    <div className={`dp-layer ${sheet ? 'is-sheet' : ''}`}>
      {sheet && <div className="dp-backdrop" onClick={onClose} aria-hidden="true" />}
      <div
        ref={popRef} className={`dp-pop ${!sheet && pos?.up ? 'is-up' : ''}`} style={style}
        role="dialog" aria-modal={sheet || undefined} aria-label="Pilih tanggal"
      >
        {sheet && <span className="dp-grab" aria-hidden="true" />}
        <div className="dp-head">
          <strong>{BULAN[m]} {y}</strong>
          <span>
            <button type="button" className="dp-nav" aria-label="Bulan sebelumnya" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
            <button type="button" className="dp-nav" aria-label="Bulan berikutnya" onClick={() => shift(1)}><ChevronRight size={18} /></button>
          </span>
        </div>
        <div className="dp-grid">
          {HARI.map((h) => <i key={h} className="dp-dow">{h}</i>)}
          {cells.map((d) => (
            <button
              key={d.getTime()} type="button"
              className={`dp-day ${d.getMonth() !== m ? 'is-out' : ''} ${same(d, today) ? 'is-today' : ''} ${same(d, selected) ? 'is-selected' : ''}`}
              onClick={() => onPick(d)}
            >{d.getDate()}</button>
          ))}
        </div>
        <div className="dp-foot">
          {!required && <button type="button" onClick={onClear}>Hapus</button>}
          <button type="button" onClick={() => onPick(new Date())}>Hari ini</button>
        </div>
      </div>
    </div>
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

/* ---------- Action menu (dropdown "⋯") ---------- */
export function ActionMenu({ children, label = 'Opsi', icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches);
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const on = () => setSheet(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Posisi menu dihitung dari tombolnya (position: fixed) agar tidak terpotong
  // oleh tabel yang bisa di-scroll. Menu membuka ke atas bila ruang bawah sempit.
  const place = useCallback(() => {
    const btn = btnRef.current;
    const root = ref.current;
    if (!btn || !root) return;
    if (sheet) { root.dataset.flip = 'sheet'; return; }
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    root.style.setProperty('--mx', `${Math.max(12, window.innerWidth - r.right)}px`);
    if (below < 280 && r.top > below) {
      root.style.setProperty('--my', 'auto');
      root.style.setProperty('--mb', `${window.innerHeight - r.top + 6}px`);
      root.dataset.flip = 'up';
    } else {
      root.style.setProperty('--my', `${r.bottom + 6}px`);
      root.style.setProperty('--mb', 'auto');
      root.dataset.flip = 'down';
    }
  }, [sheet]);

  useEffect(() => {
    if (!open) return undefined;
    place();
    const close = () => setOpen(false);
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const isSheet = () => window.matchMedia('(max-width: 820px)').matches;
    const closeIfFloating = () => { if (!isSheet()) close(); };
    window.addEventListener('resize', closeIfFloating);
    window.addEventListener('scroll', closeIfFloating, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeIfFloating);
      window.removeEventListener('scroll', closeIfFloating, { capture: true });
    };
  }, [open, place]);

  return (
    <div className={`action-menu ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {Icon ? <Icon size={18} /> : <span className="dots" aria-hidden="true"><i /><i /><i /></span>}
      </button>
      <div className="dropdown" role="menu" aria-hidden={!open} onClick={() => setOpen(false)}>{children}</div>
    </div>
  );
}
