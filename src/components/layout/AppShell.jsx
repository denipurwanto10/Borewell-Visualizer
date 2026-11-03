import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Menu, X, PanelLeftClose, PanelLeftOpen, Download, RotateCcw, LogOut,
  LayoutDashboard, FolderOpen, Ruler, ClipboardList, Images, FileText,
  Layers, Droplets, Database, Settings, Shield, FolderTree,
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
  const navRef = useRef(null);
  const [navInd, setNavInd] = useState(null);

  // Penanda aktif sidebar: satu elemen yang bergeser mulus antar menu
  useLayoutEffect(() => {
    const measure = () => {
      const li = navRef.current?.querySelector('.sidebar-item.is-active');
      setNavInd(li && li.offsetHeight ? { y: li.offsetTop, h: li.offsetHeight } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 480); // setelah rail/sidebar selesai berubah lebar
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [page, railCollapsed]);

  // Tabel di ponsel menjadi kartu: isi data-label dari header kolom
  useEffect(() => {
    let raf = 0;
    const label = () => {
      document.querySelectorAll('table.data-table, table.admin-table').forEach((table) => {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
        table.querySelectorAll('tbody tr').forEach((tr) => {
          [...tr.children].forEach((td, i) => {
            if (heads[i] && td.getAttribute('data-label') !== heads[i] && !td.hasAttribute('colspan')) td.setAttribute('data-label', heads[i]);
          });
        });
      });
    };
    const obs = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(label); });
    obs.observe(document.body, { childList: true, subtree: true });
    label();
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, []);

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

        <ul className="sidebar-nav" ref={navRef}>
          <li className="nav-ind" role="presentation" aria-hidden="true"
            style={navInd ? { transform: `translateY(${navInd.y}px)`, height: navInd.h, opacity: 1 } : { opacity: 0 }} />
          {NAV_ITEMS.map(({ id, label, icon: Icon, available }) => {
            const isActive = page === id;
            const disabled = !available;
            return (
              <li key={id} className={`sidebar-item ${isActive ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}>
                <button
                  type="button"
                  onClick={() => handleNavClick(id)}
                  disabled={disabled}
                  className="sidebar-btn"
                  title={label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={19} strokeWidth={2} className="sidebar-icon" />
                  <span className="sidebar-label">{label}</span>
                  {!available && <span className="sidebar-badge">Baru</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="sidebar-footer">
          <div className="active-context">
            <div className="context-label">Proyek aktif</div>
            <div className="context-value">{activeProject?.projectName || '—'}</div>
            <div className="context-label">Sumur aktif</div>
            <div className="context-value">{activeWell?.well?.wellName || '—'}</div>
          </div>
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
                <strong>{activeProject?.projectName || 'Sumur Bor'}</strong>
                <small>{activeWell?.well?.wellName ? `Sumur: ${activeWell.well.wellName}` : 'Belum ada sumur aktif'}</small>
              </span>
            </div>
          </div>

          <div className="topbar-actions">
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
              <Button variant="ghost" icon={LogOut} onClick={logout} className="hide-sm" aria-label="Keluar">
                Keluar
              </Button>
            )}
            {isAuthenticated && (
              <Button variant="ghost" icon={LogOut} onClick={logout} className="icon-only show-sm" aria-label="Keluar" />
            )}
          </div>
        </div>
      </header>

      <main className="main">{children}</main>

      <div className={`drawer-layer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />
        <aside className="sidebar-drawer" role="dialog" aria-modal="true" aria-label="Menu navigasi">
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
            {NAV_ITEMS.map(({ id, label, icon: Icon, available }) => {
              const isActive = page === id;
              return (
                <li key={id} className={`drawer-item ${isActive ? 'is-active' : ''} ${!available ? 'is-disabled' : ''}`}>
                  <button
                    type="button"
                    onClick={() => handleNavClick(id)}
                    disabled={!available}
                    className="drawer-btn"
                    aria-current={isActive ? 'page' : undefined}
                    tabIndex={drawerOpen ? 0 : -1}
                  >
                    <Icon size={20} strokeWidth={2} className="drawer-icon" />
                    <span className="drawer-label">{label}</span>
                    {!available && <span className="drawer-badge">Baru</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="drawer-footer">
            <div className="context-label">Proyek aktif</div>
            <div className="context-value">{activeProject?.projectName || '—'}</div>
            <div className="context-label">Sumur aktif</div>
            <div className="context-value">{activeWell?.well?.wellName || '—'}</div>
          </div>
        </aside>
      </div>

      <nav className="tabbar" aria-label="Navigasi cepat" style={{ '--i': Math.max(0, TAB_ITEMS.findIndex((t) => t.id === page)) }}>
        <span className="tabbar-ind" aria-hidden="true" data-on={TAB_ITEMS.some((t) => t.id === page)} />
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
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Menu lainnya">
          <Menu size={20} strokeWidth={1.9} /><span>Menu</span>
        </button>
      </nav>

      <Toast toast={toast} onClose={() => setProjectToast(null)} />
      {confirmDialog}
    </div>
  );
}
