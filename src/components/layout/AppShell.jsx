import { useEffect, useState } from 'react';
import {
  Menu, X, PanelLeftClose, PanelLeftOpen, Download, RotateCcw, LogOut,
  LayoutDashboard, FolderOpen, Ruler, ClipboardList, Images, FileText,
  Layers, Droplets, Database, Settings, Shield, FolderTree, ChevronRight,
} from 'lucide-react';
import { Button, Toast } from '../Primitives';
import logo from '../../../img/tubes.png';

const RAIL_QUERY = '(min-width: 1100px) and (max-width: 1279px)';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Dash', icon: LayoutDashboard, available: true },
  { id: 'projects', label: 'Proyek', short: 'Proyek', icon: FolderOpen, available: true },
  { id: 'project-docs', label: 'Dokumen Proyek', short: 'Proj Docs', icon: FolderTree, available: true },
  { id: 'visualisasi', label: 'Visualisasi', short: 'Visual', icon: Ruler, available: true },
  { id: 'desain', label: 'Desain Sumur', short: 'Desain', icon: RotateCcw, available: true },
  { id: 'data', label: 'Data Sumur', short: 'Data', icon: ClipboardList, available: true },
  { id: 'docs', label: 'Dokumentasi Kegiatan', short: 'Docs', icon: Images, available: true },
  { id: 'documentation', label: 'Galeri Foto & Dokumen', short: 'Galeri', icon: FileText, available: true },
  { id: 'geology', label: 'Log Geologi', short: 'Geologi', icon: Layers, available: true },
  { id: 'monitoring', label: 'Monitoring Air Tanah', short: 'Monitor', icon: Droplets, available: true },
  { id: 'reports', label: 'Pembuat Laporan', short: 'Laporan', icon: Download, available: true },
  { id: 'data-management', label: 'Manajemen Data', short: 'Data Mgmt', icon: Database, available: true },
  { id: 'settings', label: 'Pengaturan', short: 'Setelan', icon: Settings, available: false },
  { id: 'admin-approval', label: 'Persetujuan Admin', short: 'Admin', icon: Shield, available: true },
];

const NAV_GROUPS = [
  { label: 'Utama', ids: ['dashboard', 'projects', 'project-docs'] },
  { label: 'Pekerjaan sumur', ids: ['visualisasi', 'desain', 'data', 'docs', 'documentation', 'geology', 'monitoring'] },
  { label: 'Sistem', ids: ['reports', 'data-management', 'settings', 'admin-approval'] },
].map((g) => ({ ...g, items: g.ids.map((id) => NAV_ITEMS.find((i) => i.id === id)).filter(Boolean) }));

const initialsOf = (user) => {
  const src = (user?.full_name || user?.fullName || user?.email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
};

function ContextCard({ project, well }) {
  return (
    <div className="active-context">
      <div className="ctx-row">
        <span className="ctx-ico" aria-hidden="true"><FolderOpen size={15} strokeWidth={1.9} /></span>
        <span className="ctx-text">
          <span className="context-label">Proyek aktif</span>
          <span className="context-value" title={project || undefined}>{project || '—'}</span>
        </span>
      </div>
      <div className="ctx-row">
        <span className="ctx-ico is-water" aria-hidden="true"><Droplets size={15} strokeWidth={1.9} /></span>
        <span className="ctx-text">
          <span className="context-label">Sumur aktif</span>
          <span className="context-value" title={well || undefined}>{well || '—'}</span>
        </span>
      </div>
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
      <button type="button" className="icon-btn user-logout" aria-label="Keluar" title="Keluar" onClick={logout}>
        <LogOut size={17} strokeWidth={1.9} />
      </button>
    </div>
  );
}

const TAB_ITEMS = NAV_ITEMS.filter((i) => ['dashboard', 'projects', 'visualisasi', 'desain'].includes(i.id));

export default function AppShell({
  children,
  page,
  setPage,
  drawerOpen,
  setDrawerOpen,
  railCollapsed,
  setRailCollapsed,
  selectedProjectId,
  setSelectedProjectId,
  viewMode,
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
  canvasRef,
}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const drawerRows = NAV_GROUPS.flatMap((g, gi) => [
    { heading: g.label, n: gi },
    ...g.items.map((it, ii) => ({ ...it, n: gi + ii + 1 })),
  ]);
  const pageLabel = NAV_ITEMS.find((i) => i.id === page)?.label || 'Sumur Bor';

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavClick = (id) => {
    const item = NAV_ITEMS.find((i) => i.id === id);
    if (!item?.available) {
      notify('Fitur ini belum tersedia (Coming Soon)', 'info');
      return;
    }
    setPage(id);
    setDrawerOpen(false);
    if (id === 'projects') {
      setViewMode('list');
      setSelectedProjectId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`app ${railCollapsed ? 'is-rail' : ''}`}>
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
            aria-label={railCollapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
            aria-expanded={!railCollapsed}
            onClick={() => setRailCollapsed((v) => !v)}
          >
            {railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="sidebar-scroll" aria-label="Menu utama">
          {NAV_GROUPS.map((group) => (
            <section className="sidebar-group" key={group.label}>
              <h2 className="sidebar-heading">{group.label}</h2>
              <ul className="sidebar-nav">
                {group.items.map(({ id, label, icon: Icon, available }) => {
                  const isActive = page === id;
                  const disabled = !available;
                  return (
                    <li key={id} className={`sidebar-item ${isActive ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`} data-tip={label}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(id)}
                        disabled={disabled}
                        className="sidebar-btn"
                        title={label}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon size={19} strokeWidth={1.9} className="sidebar-icon" />
                        <span className="sidebar-label">{label}</span>
                        {!available && <span className="sidebar-badge">Baru</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <ContextCard project={activeProject?.projectName} well={activeWell?.well?.wellName} />
          {isAuthenticated && user && <UserChip user={user} logout={logout} />}
        </div>
      </aside>

      <header className={`topbar ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="topbar-inner">
          <div className="topbar-left">
            <button type="button" className="menu-toggle" aria-label="Buka menu" onClick={() => setDrawerOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="brand">
              <span className="brand-mark"><img src={logo} alt="" width="24" height="24" /></span>
              <span className="brand-text">
                <strong>{pageLabel}</strong>
                <small>
                  <span className="crumb">{activeProject?.projectName || 'Belum ada proyek'}</span>
                  {activeWell?.well?.wellName && <><ChevronRight size={12} aria-hidden="true" /><span className="crumb is-well">{activeWell.well.wellName}</span></>}
                </small>
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            <span className={`well-chip ${activeWellId ? 'is-on' : ''}`} role="status">
              <i aria-hidden="true" />
              <span>{activeWellId ? 'Sumur aktif' : 'Belum ada sumur aktif'}</span>
            </span>
            <span className="topbar-sep" aria-hidden="true" />
            {activeWellId && (
              <Button variant="ghost" icon={RotateCcw} onClick={resetAll} className="hide-sm" aria-label="Reset sumur ini">
                Reset Sumur
              </Button>
            )}
            <Button variant="primary" icon={Download} loading={isDownloading} onClick={downloadPdf} disabled={!activeWellId}>
              <span className="hide-xs">{isDownloading ? 'Menyiapkan…' : 'Unduh PDF'}</span>
              <span className="show-xs">PDF</span>
            </Button>
            {activeWellId && (
              <Button variant="ghost" icon={RotateCcw} onClick={resetAll} className="icon-only show-sm" aria-label="Reset sumur ini" />
            )}
            {isAuthenticated && (
              <Button variant="ghost" icon={LogOut} onClick={logout} className="topbar-logout" aria-label="Keluar">
                <span className="hide-md">Keluar</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="main">{children}</main>

      <div className={`drawer-layer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />
        <aside className="sidebar-drawer" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <span className="sheet-grip" aria-hidden="true" />
          <div className="drawer-header">
            <span className="drawer-brand">
              <span className="drawer-brand-mark"><img src={logo} alt="" width="24" height="24" /></span>
              <span className="drawer-brand-text">Sumur Bor</span>
            </span>
            <button type="button" className="drawer-close" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <ul className="drawer-nav">
            {drawerRows.map((row) => row.heading ? (
              <li key={`h-${row.heading}`} className="drawer-heading" style={{ '--n': row.n }}>{row.heading}</li>
            ) : (
              <li key={row.id} className={`drawer-item ${page === row.id ? 'is-active' : ''} ${!row.available ? 'is-disabled' : ''}`} style={{ '--n': row.n }}>
                <button
                  type="button"
                  onClick={() => handleNavClick(row.id)}
                  disabled={!row.available}
                  className="drawer-btn"
                  aria-current={page === row.id ? 'page' : undefined}
                  tabIndex={drawerOpen ? 0 : -1}
                >
                  <row.icon size={20} strokeWidth={2} className="drawer-icon" />
                  <span className="drawer-label">{row.label}</span>
                  {!row.available && <span className="drawer-badge">Baru</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="drawer-footer">
            <ContextCard project={activeProject?.projectName} well={activeWell?.well?.wellName} />
            {isAuthenticated && user && <UserChip user={user} logout={() => { setDrawerOpen(false); logout(); }} />}
          </div>
        </aside>
      </div>

      <nav className="tabbar" aria-label="Navigasi cepat">
        {TAB_ITEMS.map(({ id, short, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={page === id ? 'is-active' : ''}
            onClick={() => handleNavClick(id)}
            aria-current={page === id ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={1.9} /><span>{short}</span>
          </button>
        ))}
        <button
          type="button"
          className={!TAB_ITEMS.some((t) => t.id === page) || drawerOpen ? 'is-active' : ''}
          onClick={() => setDrawerOpen(true)}
          aria-label="Menu lainnya"
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
