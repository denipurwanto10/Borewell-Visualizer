import { useEffect, useRef, useState } from 'react';
import {
  Menu, X, PanelLeftClose, PanelLeftOpen, Download, RotateCcw, LogOut,
  FolderOpen, Droplets, ChevronRight, ChevronsUpDown, MoreHorizontal,
} from 'lucide-react';
import { Button, Toast } from '../Primitives';
import { NAV_ITEMS, TAB_IDS, PAGE_HASH_MAP, getNavGroups } from './navConfig';
import logo from '../../../img/tubes.png';

const initialsOf = (user) => {
  const src = (user?.full_name || user?.fullName || user?.email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
};

/** Kartu "sedang mengerjakan apa" + tombol Ganti. Tampil di sidebar & menu HP. */
function ContextCard({ project, well, onSwitch }) {
  return (
    <div className="active-context">
      <div className="ctx-row">
        <span className="ctx-ico" aria-hidden="true"><FolderOpen size={15} strokeWidth={1.9} /></span>
        <span className="ctx-text">
          <span className="context-label">Proyek aktif</span>
          <span className={`context-value ${project ? '' : 'is-empty'}`} title={project || undefined}>{project || 'Belum dipilih'}</span>
        </span>
      </div>
      <div className="ctx-row">
        <span className="ctx-ico is-water" aria-hidden="true"><Droplets size={15} strokeWidth={1.9} /></span>
        <span className="ctx-text">
          <span className="context-label">Sumur aktif</span>
          <span className={`context-value ${well ? '' : 'is-empty'}`} title={well || undefined}>{well || 'Belum dipilih'}</span>
        </span>
      </div>
      <button type="button" className="ctx-switch" onClick={onSwitch}>
        <ChevronsUpDown size={14} aria-hidden="true" />
        {project ? 'Ganti proyek / sumur' : 'Pilih proyek & sumur'}
      </button>
    </div>
  );
}

function UserChip({ user, logout }) {
  return (
    <div className="user-chip">
      <span className="avatar" aria-hidden="true">{initialsOf(user)}</span>
      <span className="user-meta">
        <strong>{user.full_name || user.fullName || user.email}</strong>
        <small>{user.role === 'admin' ? 'Administrator' : 'Pengguna'}</small>
      </span>
      <button type="button" className="icon-btn user-logout" aria-label="Keluar dari akun" title="Keluar" onClick={logout}>
        <LogOut size={17} strokeWidth={1.9} />
      </button>
    </div>
  );
}

/** Menu "⋯" di topbar: tindakan berisiko dipisah dari tombol utama. */
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className="more-wrap" ref={ref}>
      <button
        type="button"
        className="more-btn"
        aria-label="Aksi lainnya"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {items.map(({ key, label, icon: Icon, danger, onClick }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className={`more-item ${danger ? 'is-danger' : ''}`}
              onClick={() => { setOpen(false); onClick(); }}
            >
              <Icon size={17} strokeWidth={1.9} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppShell({
  children,
  page,
  setPage,
  drawerOpen,
  setDrawerOpen,
  railCollapsed,
  setRailCollapsed,
  setSelectedProjectId,
  setViewMode,
  user,
  logout,
  isAuthenticated,
  activeProject,
  activeWell,
  activeWellId,
  notify,
  toast,
  setProjectToast,
  confirmDialog,
  isDownloading,
  downloadPdf,
  resetAll,
}) {
  const isAdmin = user?.role === 'admin';
  const groups = getNavGroups({ isAdmin });
  const tabItems = TAB_IDS.map((id) => NAV_ITEMS.find((i) => i.id === id));
  const pageLabel = NAV_ITEMS.find((i) => i.id === page)?.label || 'Sumur Bor';
  const projectName = activeProject?.projectName;
  const wellName = activeWell?.well?.wellName;

  const handleNavClick = (id) => {
    const item = NAV_ITEMS.find((i) => i.id === id);
    if (!item?.available) {
      notify(`${item?.label || 'Fitur ini'} akan segera hadir.`, 'info');
      return;
    }
    setPage(id);
    setDrawerOpen(false);
    if (id === 'projects') {
      setViewMode('list');
      setSelectedProjectId(null);
    }
    const hash = PAGE_HASH_MAP[id];
    window.location.hash = hash && hash !== '/' ? hash : '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goSwitchContext = () => handleNavClick('projects');

  const moreItems = [
    activeWellId && { key: 'reset', label: 'Reset data sumur ini', icon: RotateCcw, danger: true, onClick: resetAll },
  ].filter(Boolean);

  const renderGroupHint = (group) => (
    group.needsWell && !activeWellId ? (
      <button type="button" className="group-hint" onClick={goSwitchContext}>
        Pilih sumur dulu agar menu ini bisa dipakai
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    ) : null
  );

  return (
    <div className={`app ${railCollapsed ? 'is-rail' : ''}`}>
      {/* ───────── Sidebar (desktop) ───────── */}
      <aside className="sidebar" aria-label="Navigasi utama">
        <div className="sidebar-header">
          <span className="sidebar-brand">
            <span className="sidebar-brand-mark"><img src={logo} alt="" width="26" height="26" /></span>
            <span className="sidebar-brand-text">
              <strong>Sumur Bor</strong>
              <small>Visualisasi konstruksi</small>
            </span>
          </span>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={railCollapsed ? 'Lebarkan menu samping' : 'Ciutkan menu samping'}
            aria-expanded={!railCollapsed}
            onClick={() => setRailCollapsed((v) => !v)}
          >
            {railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="sidebar-context">
          <ContextCard project={projectName} well={wellName} onSwitch={goSwitchContext} />
        </div>

        <nav className="sidebar-scroll" aria-label="Menu utama">
          {groups.map((group) => (
            <section className="sidebar-group" key={group.id}>
              <h2 className="sidebar-heading">{group.label}</h2>
              {renderGroupHint(group)}
              <ul className="sidebar-nav">
                {group.items.map(({ id, label, icon: Icon, available, needsWell }) => {
                  const isActive = page === id;
                  const idle = needsWell && !activeWellId && available;
                  return (
                    <li
                      key={id}
                      className={`sidebar-item ${isActive ? 'is-active' : ''} ${!available ? 'is-disabled' : ''} ${idle ? 'is-idle' : ''}`}
                      data-tip={label}
                    >
                      <button
                        type="button"
                        onClick={() => handleNavClick(id)}
                        className="sidebar-btn"
                        title={idle ? `${label} — pilih sumur dulu` : label}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon size={19} strokeWidth={1.9} className="sidebar-icon" />
                        <span className="sidebar-label">{label}</span>
                        {!available && <span className="sidebar-badge">Segera</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        {isAuthenticated && user && (
          <div className="sidebar-footer">
            <UserChip user={user} logout={logout} />
          </div>
        )}
      </aside>

      {/* ───────── Topbar ───────── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <button type="button" className="menu-toggle" aria-label="Buka menu" onClick={() => setDrawerOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="brand">
              <span className="brand-mark"><img src={logo} alt="" width="24" height="24" /></span>
              <span className="brand-text">
                <strong>{pageLabel}</strong>
                <button
                  type="button"
                  className={`ctx-pill ${projectName ? '' : 'is-empty'}`}
                  onClick={goSwitchContext}
                  title="Ganti proyek atau sumur aktif"
                  aria-label={projectName
                    ? `Proyek ${projectName}${wellName ? `, sumur ${wellName}` : ', belum ada sumur'}. Ganti proyek atau sumur.`
                    : 'Belum ada proyek aktif. Pilih proyek dan sumur.'}
                >
                  <FolderOpen size={13} aria-hidden="true" />
                  <span className="ctx-pill-part">{projectName || 'Pilih proyek & sumur'}</span>
                  {projectName && (
                    <>
                      <ChevronRight size={12} aria-hidden="true" className="ctx-pill-sep" />
                      <Droplets size={13} aria-hidden="true" />
                      <span className="ctx-pill-part is-well">{wellName || 'Pilih sumur'}</span>
                    </>
                  )}
                  <ChevronsUpDown size={12} aria-hidden="true" className="ctx-pill-caret" />
                </button>
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            <Button
              variant="primary"
              icon={Download}
              loading={isDownloading}
              onClick={downloadPdf}
              disabled={!activeWellId}
              title={activeWellId ? 'Unduh laporan konstruksi sumur sebagai PDF' : 'Pilih sumur dulu untuk mengunduh PDF'}
              aria-label="Unduh PDF"
            >
              <span className="hide-xs">{isDownloading ? 'Menyiapkan…' : 'Unduh PDF'}</span>
              <span className="show-xs">PDF</span>
            </Button>
            <MoreMenu items={moreItems} />
          </div>
        </div>
      </header>

      <main className="main">{children}</main>

      {/* ───────── Menu tablet & HP (drawer / bottom sheet) ───────── */}
      <div className={`drawer-layer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />
        <aside className="sidebar-drawer" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <span className="sheet-grip" aria-hidden="true" />
          <div className="drawer-header">
            <span className="drawer-brand">
              <span className="drawer-brand-mark"><img src={logo} alt="" width="24" height="24" /></span>
              <span className="drawer-brand-text">Semua menu</span>
            </span>
            <button type="button" className="drawer-close" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} tabIndex={drawerOpen ? 0 : -1}>
              <X size={20} />
            </button>
          </div>

          <div className="drawer-context">
            <ContextCard project={projectName} well={wellName} onSwitch={goSwitchContext} />
          </div>

          <div className="drawer-scroll">
            {groups.map((group) => (
              <section className="drawer-group" key={group.id}>
                <h2 className="drawer-heading">{group.label}</h2>
                {renderGroupHint(group)}
                <ul className="drawer-nav">
                  {group.items.map(({ id, label, icon: Icon, available, needsWell }) => {
                    const idle = needsWell && !activeWellId && available;
                    return (
                      <li
                        key={id}
                        className={`drawer-item ${page === id ? 'is-active' : ''} ${!available ? 'is-disabled' : ''} ${idle ? 'is-idle' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleNavClick(id)}
                          className="drawer-btn"
                          aria-current={page === id ? 'page' : undefined}
                          tabIndex={drawerOpen ? 0 : -1}
                        >
                          <Icon size={20} strokeWidth={2} className="drawer-icon" />
                          <span className="drawer-label">{label}</span>
                          {!available && <span className="drawer-badge">Segera</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {isAuthenticated && user && (
            <div className="drawer-footer">
              <UserChip user={user} logout={() => { setDrawerOpen(false); logout(); }} />
            </div>
          )}
        </aside>
      </div>

      {/* ───────── Tab bawah (HP) ───────── */}
      <nav className="tabbar" aria-label="Pintasan">
        {tabItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={page === id && !drawerOpen ? 'is-active' : ''}
            onClick={() => handleNavClick(id)}
            aria-current={page === id ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={1.9} /><span>{label.split(' ')[0]}</span>
          </button>
        ))}
        <button
          type="button"
          className={drawerOpen || !tabItems.some((t) => t.id === page) ? 'is-active' : ''}
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka semua menu"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
        >
          <Menu size={20} strokeWidth={1.9} /><span>Menu</span>
        </button>
      </nav>

      <Toast toast={toast} onClose={() => setProjectToast(null)} />
      {confirmDialog}
    </div>
  );
}
