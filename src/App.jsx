import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Download, Images, RotateCcw, Ruler } from 'lucide-react';
import VisualizationPage from './components/VisualizationPage';
import DataPage from './components/DataPage';
import DocsPage from './components/DocsPage';
import { Button, Toast, useConfirm } from './components/Primitives';
import { useBoreholeState } from './hooks';
import { downloadBoreholePdf } from './pdf';
import { INITIAL_WELL, makeEmptyActivity } from './model';
import logo from '../img/tubes.png';

const NAV_ITEMS = [
  { id: 'page1', label: 'Visualisasi', short: 'Visual', icon: Ruler },
  { id: 'page2', label: 'Data Sumur', short: 'Data', icon: ClipboardList },
  { id: 'page3', label: 'Dokumentasi', short: 'Foto', icon: Images },
];

const freshWell = () => ({ ...INITIAL_WELL, boreholeImages: {} });

export default function App() {
  const { model, setModel, well, setWell, activity, setActivity, page, setPage, toast, setToast, notify, persist } = useBoreholeState();
  const [isDownloading, setIsDownloading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const canvasRef = useRef(null);
  const stateRef = useRef({ model, well, activity });
  stateRef.current = { model, well, activity };

  const activeIndex = Math.max(0, NAV_ITEMS.findIndex((item) => item.id === page));

  const saveAll = (message = 'Data berhasil disimpan di browser ini.') => {
    const current = stateRef.current;
    persist(current.model, current.well, current.activity);
    try {
      localStorage.setItem('wellData', JSON.stringify({
        ...current.well,
        activityImages: current.activity,
        visualization: current.model,
        timestamp: new Date().toISOString(),
      }));
    } catch {
      // Penyimpanan penuh: data tetap aman di memori.
    }
    notify(message, 'success');
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Reset semua data?',
      message: 'Visualisasi pipa, data sumur, dan seluruh foto dokumentasi akan dihapus dari browser ini.',
      confirmLabel: 'Reset semua',
    });
    if (!ok) return;
    setModel({ pipes: [], ground: null, mat: null, screens: [], openHole: null });
    setWell(freshWell());
    setActivity(makeEmptyActivity());
    notify('Semua data telah direset.', 'success');
  };

  const resetWell = async () => {
    const ok = await confirm({
      title: 'Reset data sumur?',
      message: 'Isian data sumur dan seluruh foto borehole akan dihapus.',
      confirmLabel: 'Reset data',
    });
    if (!ok) return;
    setWell(freshWell());
    notify('Data sumur bor telah direset.', 'success');
  };

  const resetActivity = async () => {
    const ok = await confirm({
      title: 'Reset dokumentasi?',
      message: 'Seluruh foto dokumentasi kegiatan akan dihapus.',
      confirmLabel: 'Reset foto',
    });
    if (!ok) return;
    setActivity(makeEmptyActivity());
    notify('Dokumentasi kegiatan telah direset.', 'success');
  };

  const downloadPdf = async () => {
    if (!model.pipes.length) return notify('Buat pipa terlebih dahulu sebelum mengunduh PDF.', 'warning');
    setIsDownloading(true);
    try {
      await downloadBoreholePdf({ model, well, activity, canvas: canvasRef.current });
      notify('PDF berhasil diunduh.', 'success');
    } catch (error) {
      console.error(error);
      notify('Gagal membuat PDF. Coba lagi dengan foto yang lebih kecil.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const current = stateRef.current;
    persist(current.model, current.well, current.activity);
  }, [model, well, activity, persist]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const changePage = (id) => {
    if (id === page) return;
    setPage(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app">
      <header className={`topbar ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark"><img src={logo} alt="" width="26" height="26" /></span>
            <span className="brand-text">
              <strong>Sumur Bor</strong>
              <small>Visualisasi konstruksi</small>
            </span>
          </div>

          <nav className="seg seg-3 nav-desktop" style={{ '--i': activeIndex }} aria-label="Halaman">
            <i className="seg-ind" aria-hidden="true" />
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button key={id} id={`nav-${id}`} type="button" className={page === id ? 'is-active' : ''} onClick={() => changePage(id)} aria-current={page === id ? 'page' : undefined}>
                <Icon size={16} strokeWidth={2} /><span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="topbar-actions">
            <Button variant="ghost" icon={RotateCcw} onClick={resetAll} className="hide-sm" aria-label="Reset semua">Reset</Button>
            <Button variant="primary" icon={Download} loading={isDownloading} onClick={downloadPdf}>
              <span className="hide-xs">{isDownloading ? 'Menyiapkan…' : 'Unduh PDF'}</span>
              <span className="show-xs">PDF</span>
            </Button>
            <Button variant="ghost" icon={RotateCcw} onClick={resetAll} className="icon-only show-sm" aria-label="Reset semua" />
          </div>
        </div>
      </header>

      <main className="main">
        <div className={`page ${page === 'page1' ? 'is-active' : ''}`} id="page1">
          <VisualizationPage model={model} setModel={setModel} canvasRef={canvasRef} notify={notify} />
        </div>
        <div className={`page ${page === 'page2' ? 'is-active' : ''}`} id="page2">
          <DataPage well={well} setWell={setWell} notify={notify} onSave={() => saveAll('Data sumur bor berhasil disimpan.')} onReset={resetWell} />
        </div>
        <div className={`page ${page === 'page3' ? 'is-active' : ''}`} id="page3">
          <DocsPage activity={activity} setActivity={setActivity} notify={notify} onSave={() => saveAll('Dokumentasi kegiatan berhasil disimpan.')} onReset={resetActivity} />
        </div>
      </main>

      <nav className="tabbar" style={{ '--i': activeIndex }} aria-label="Navigasi utama">
        <i className="tabbar-ind" aria-hidden="true" />
        {NAV_ITEMS.map(({ id, short, icon: Icon }) => (
          <button key={id} type="button" className={page === id ? 'is-active' : ''} onClick={() => changePage(id)} aria-current={page === id ? 'page' : undefined}>
            <Icon size={21} strokeWidth={1.9} /><span>{short}</span>
          </button>
        ))}
      </nav>

      <Toast toast={toast} onClose={() => setToast(null)} />
      {confirmDialog}
    </div>
  );
}
