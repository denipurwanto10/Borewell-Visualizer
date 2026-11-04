import { useEffect, useRef, useState, useCallback, useMemo, Component } from 'react';
import { Download, RotateCcw, Ruler, ClipboardList, Images, Layers, Droplets, FileText, FilePlus } from 'lucide-react';
import VisualizationPage from './components/VisualizationPage';
import DesignerPage from './components/DesignerPage';
import DataPage from './components/DataPage';
import DocsPage from './components/DocsPage';
import DocumentationPage from './components/DocumentationPage';
import ProjectDocumentationPage from './components/ProjectDocumentationPage';
import ReportBuilderPage from './components/ReportBuilderPage';
import ProjectsPage from './components/ProjectsPage';
import ProjectDetailPage from './components/ProjectDetailPage';
import DashboardPage from './components/DashboardPage';
import GeologyPage from './components/GeologyPage';
import MonitoringPage from './components/MonitoringPage';
import DataManagementPage from './components/DataManagementPage';
import { Button, Toast, useConfirm, PageHead } from './components/Primitives';
import { useProject } from './context/ProjectContext';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import PendingApprovalPage from './components/auth/PendingApprovalPage';
import RejectedAccountPage from './components/auth/RejectedAccountPage';
import SuspendedAccountPage from './components/auth/SuspendedAccountPage';
import AdminApprovalPage from './components/auth/AdminApprovalPage';
import AppShell from './components/layout/AppShell';
import AuthLayout from './components/layout/AuthLayout';
import { downloadBoreholePdf } from './pdf';
import { INITIAL_WELL, EMPTY_MODEL, makeEmptyActivity } from './model';
import logo from '../img/tubes.png';

const RAIL_QUERY = '(min-width: 1100px) and (max-width: 1279px)';

const freshWell = () => ({ ...INITIAL_WELL, boreholeImages: {} });
const freshModel = () => ({ ...EMPTY_MODEL, pipes: [], screens: [] });
const freshActivity = () => makeEmptyActivity();

class ErrorBoundary extends Component {
  state = { error: null, errorInfo: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2>Render Error Caught</h2>
          <p><strong>Error:</strong> {this.state.error?.message}</p>
          <p><strong>Stack:</strong></p>
          <pre>{this.state.error?.stack}</pre>
          <p><strong>Component Stack:</strong></p>
          <pre>{this.state.errorInfo?.componentStack}</pre>
          <button onClick={() => this.setState({ error: null, errorInfo: null })}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { user, loading: authLoading, isAuthenticated, isAdmin, logout } = useAuth();
  const {
    projects,
    activeProjectId,
    activeWellId,
    activeProject,
    activeWell,
    loading: projectLoading,
    toast: projectToast,
    setToast: setProjectToast,
    notify: projectNotify,
    selectProject,
    selectWell,
    loadActiveWellData,
    saveActiveWellData,
    refreshProjects,
  } = useProject();

  const [isDownloading, setIsDownloading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [railCollapsed, setRailCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia(RAIL_QUERY).matches);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const canvasRef = useRef(null);
  const [model, setModel] = useState(freshModel());
  const [well, setWell] = useState(freshWell());
  const [activity, setActivity] = useState(freshActivity());
  const [page, setPage] = useState(() => (
    typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/register' ? 'register' : 'login'
  ));

  const stateRef = useRef({ model, well, activity });
  stateRef.current = { model, well, activity };

  // ── All hooks must be called unconditionally before any early return ──
  const loadWellData = useCallback((wellData) => {
    if (!wellData) return;
    setModel(wellData.model || freshModel());
    setWell({ ...INITIAL_WELL, ...wellData.well, boreholeImages: wellData.well?.boreholeImages || {} });
    setActivity(wellData.activity || freshActivity());
  }, []);

  const saveWellData = useCallback((message = 'Data berhasil disimpan.') => {
    const current = stateRef.current;
    saveActiveWellData({
      well: current.well,
      model: current.model,
      activity: current.activity,
    });
    projectNotify(message, 'success');
  }, [saveActiveWellData, projectNotify]);

  useEffect(() => {
    if (activeWellId) {
      const wellData = loadActiveWellData();
      loadWellData(wellData);
    } else {
      setModel(freshModel());
      setWell(freshWell());
      setActivity(freshActivity());
    }
  }, [activeWellId, loadActiveWellData, loadWellData]);

  useEffect(() => {
    const current = stateRef.current;
    // Guard: only persist when there is an active well. Note activeWellId is
    // intentionally NOT a dependency: when the user switches wells, the load
    // effect above replaces model/well/activity first, and this effect then
    // persists the (new) active well's data — never the previous well's data.
    if (activeWellId) {
      saveActiveWellData({
        model: current.model,
        well: current.well,
        activity: current.activity,
      });
    }
  }, [model, well, activity, saveActiveWellData]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Layar menengah: sidebar otomatis menjadi rail ikon agar konten tetap lega.
  useEffect(() => {
    const mq = window.matchMedia(RAIL_QUERY);
    const onChange = (e) => { if (e.matches) setRailCollapsed(true); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  // ── Status otentikasi — hitung setelah semua hook ──
  // Tentukan halaman yang ditampilkan berdasarkan status otentikasi.
  let displayPage = page;
  if (!isAuthenticated) {
    // Belum login: langsung tampilkan Login (register tetap bisa diakses).
    displayPage = page === 'register' ? 'register' : 'login';
  } else {
    switch (user?.status) {
      case 'pending':
        displayPage = 'pending';
        break;
      case 'rejected':
        displayPage = 'rejected';
        break;
      case 'suspended':
        displayPage = 'suspended';
        break;
      case 'approved':
        // Sudah login membuka halaman login/daftar → diarahkan ke Dashboard.
        if (page === 'login' || page === 'register') {
          displayPage = 'dashboard';
        }
        break;
      default:
        break;
    }
  }

  // Sinkronkan state `page` agar sidebar/nav konsisten dengan halaman yang ditampilkan.
  useEffect(() => {
    if (authLoading) return;
    if (displayPage !== page) {
      setPage(displayPage);
    }
  }, [authLoading, displayPage, page]);

  // Tautan Masuk/Daftar (AuthLink) memakai history API; sinkronkan `page` dengan URL.
  useEffect(() => {
    const syncFromUrl = () => {
      const path = window.location.pathname.replace(/\/+$/, '');
      if (path === '/register') setPage('register');
      else if (path === '/login' || path === '') setPage('login');
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  if (authLoading) {
    return (
      <div className="app loading">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Memuat sesi...</p>
        </div>
      </div>
    );
  }

  const changePage = (id) => {
    if (id === page) return;
    setPage(id);
    setDrawerOpen(false);
    if (id === 'projects') {
      setViewMode('list');
      setSelectedProjectId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Reset semua data sumur ini?',
      message: 'Visualisasi pipa, data sumur, dan seluruh foto dokumentasi untuk sumur aktif akan dihapus.',
      confirmLabel: 'Reset semua',
    });
    if (!ok) return;
    setModel(freshModel());
    setWell(freshWell());
    setActivity(freshActivity());
    saveWellData('Semua data sumur telah direset.');
  };

  const resetWell = async () => {
    const ok = await confirm({
      title: 'Reset data sumur?',
      message: 'Isian data sumur dan seluruh foto borehole akan dihapus.',
      confirmLabel: 'Reset data',
    });
    if (!ok) return;
    setWell(freshWell());
    saveWellData('Data sumur bor telah direset.');
  };

  const resetActivity = async () => {
    const ok = await confirm({
      title: 'Reset dokumentasi?',
      message: 'Seluruh foto dokumentasi kegiatan akan dihapus.',
      confirmLabel: 'Reset foto',
    });
    if (!ok) return;
    setActivity(freshActivity());
    saveWellData('Dokumentasi kegiatan telah direset.');
  };

  const downloadPdf = async () => {
    // Check if there's any construction data (legacy pipes or Designer components)
    const wellData = loadActiveWellData();
    const hasDesignerData = wellData?.model?.designer?.components?.length > 0;
    const hasLegacyData = model.pipes.length > 0;
    if (!hasDesignerData && !hasLegacyData) {
      return projectNotify('Buat pipa atau desain konstruksi terlebih dahulu sebelum mengunduh PDF.', 'warning');
    }
    setIsDownloading(true);
    try {
      // Pass designer state from storage (includes autosaved changes)
      const designer = wellData?.model?.designer || null;
      const geology = wellData?.model?.geologicalLog || null;
      await downloadBoreholePdf({ model, well, activity, canvas: canvasRef.current, project: activeProject, designer, geology });
      projectNotify('PDF berhasil diunduh.', 'success');
    } catch (error) {
      console.error(error);
      projectNotify('Gagal membuat PDF. Coba lagi dengan foto yang lebih kecil.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleProjectSelect = (projectId) => {
    setSelectedProjectId(projectId);
    setViewMode('detail');
    selectProject(projectId);
  };

  const handleWellSelect = (wellId) => {
    selectWell(wellId);
    if (page !== 'visualisasi' && page !== 'data' && page !== 'docs') {
      changePage('visualisasi');
    }
  };

  const toast = projectToast;

  if (projectLoading) {
    return (
      <div className="app loading">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Memuat proyek...</p>
        </div>
      </div>
    );
  }

  // ─── Halaman autentikasi — tidak pernah dirender sebagai child dari AppShell ───
  if (!isAuthenticated) {
    return (
      <AuthLayout>
        {displayPage === 'register' ? <RegisterPage /> : <LoginPage />}
      </AuthLayout>
    );
  }

  // ─── Halaman status akun — tidak pernah dirender sebagai child dari AppShell ───
  switch (user?.status) {
    case 'pending':
      return <AuthLayout><PendingApprovalPage /></AuthLayout>;
    case 'rejected':
      return <AuthLayout><RejectedAccountPage /></AuthLayout>;
    case 'suspended':
      return <AuthLayout><SuspendedAccountPage /></AuthLayout>;
    default:
      break;
  }

  // ─── APPROVED → AppShell + halaman engineering ───
  return (
    <AppShell
      page={page}
      setPage={setPage}
      drawerOpen={drawerOpen}
      setDrawerOpen={setDrawerOpen}
      railCollapsed={railCollapsed}
      setRailCollapsed={setRailCollapsed}
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      viewMode={viewMode}
      setViewMode={setViewMode}
      user={user}
      logout={logout}
      isAuthenticated={isAuthenticated}
      activeProject={activeProject}
      activeWell={activeWell}
      activeWellId={activeWellId}
      notify={projectNotify}
      toast={toast}
      setProjectToast={setProjectToast}
      confirmDialog={confirmDialog}
      isDownloading={isDownloading}
      downloadPdf={downloadPdf}
      resetAll={resetAll}
      canvasRef={canvasRef}
    >
      <ErrorBoundary>
        {/* Auth pages (rendered only when approved opens login/register → redirected to dashboard above) */}
        {displayPage === 'login' && <LoginPage />}
        {displayPage === 'register' && <RegisterPage />}
        {displayPage === 'pending' && <PendingApprovalPage />}
        {displayPage === 'rejected' && <RejectedAccountPage />}
        {displayPage === 'suspended' && <SuspendedAccountPage />}
        {displayPage === 'admin-approval' && <AdminApprovalPage />}

        <div className={`page ${page === 'dashboard' ? 'is-active' : ''}`} id="dashboard">
          <DashboardPage onNavigate={changePage} />
        </div>

      <div className={`page ${page === 'project-docs' ? 'is-active' : ''}`} id="project-docs">
        {activeProjectId ? (
          <ProjectDocumentationPage notify={projectNotify} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileText size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada proyek aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat proyek dari halaman Proyek untuk mengelola dokumentasi proyek.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek</Button>
          </div>
        )}
      </div>

      {viewMode === 'list' && displayPage === 'projects' && (
        <ProjectsPage />
      )}

      {viewMode === 'detail' && selectedProjectId && (
        <ProjectDetailPage projectId={selectedProjectId} />
      )}

      <div className={`page ${page === 'visualisasi' ? 'is-active' : ''}`} id="visualisasi">
        {activeWellId ? (
          <VisualizationPage model={model} setModel={setModel} canvasRef={canvasRef} notify={projectNotify} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Ruler size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk memulai visualisasi.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'desain' ? 'is-active' : ''}`} id="desain">
        {activeWellId ? (
          <DesignerPage notify={projectNotify} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <RotateCcw size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk memulai desain konstruksi.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'data' ? 'is-active' : ''}`} id="data">
        {activeWellId ? (
          <DataPage well={well} setWell={setWell} notify={projectNotify} onSave={() => saveWellData('Data sumur bor berhasil disimpan.')} onReset={resetWell} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <ClipboardList size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk mengisi data.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'docs' ? 'is-active' : ''}`} id="docs">
        {activeWellId ? (
          <DocsPage activity={activity} setActivity={setActivity} notify={projectNotify} onSave={() => saveWellData('Dokumentasi kegiatan berhasil disimpan.')} onReset={resetActivity} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Images size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk menambah dokumentasi.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'documentation' ? 'is-active' : ''}`} id="documentation">
        {activeWellId ? (
          <DocumentationPage notify={projectNotify} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileText size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk mengelola galeri foto dan dokumen.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'geology' ? 'is-active' : ''}`} id="geology">
        {activeWellId ? (
          <GeologyPage />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Layers size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk memulai log geologi.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'monitoring' ? 'is-active' : ''}`} id="monitoring">
        {activeWellId ? (
          <MonitoringPage />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Droplets size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk memulai monitoring air tanah.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'reports' ? 'is-active' : ''}`} id="reports">
        {activeWellId ? (
          <ReportBuilderPage notify={projectNotify} />
        ) : (
          <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Download size={64} style={{ color: 'var(--mute-2)', margin: '0 auto 16px' }} />
            <h3>Belum ada sumur aktif</h3>
            <p style={{ color: 'var(--mute)', marginBottom: '20px' }}>Pilih atau buat sumur dari halaman Proyek untuk membuat laporan penyelesaian.</p>
            <Button variant="primary" icon={FilePlus} onClick={() => { setViewMode('list'); changePage('projects'); }}>Kelola Proyek & Sumur</Button>
          </div>
        )}
      </div>

      <div className={`page ${page === 'data-management' ? 'is-active' : ''}`} id="data-management">
        <DataManagementPage />
      </div>
      </ErrorBoundary>
    </AppShell>
  );
}