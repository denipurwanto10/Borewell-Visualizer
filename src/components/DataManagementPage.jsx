// Phase 7 — Data Management Page
// Comprehensive UI for backup, restore, import/export, storage health, and data integrity

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download, Upload, RotateCcw, AlertCircle, CheckCircle, XCircle, Info,
  HardDrive, Database, Search, Trash2, FileText, Archive, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, Shield, FilePlus, Copy,
  Loader2, Zap, FolderOpen, FileMinus, RefreshCcw,
} from 'lucide-react';
import { Button, Field, PageHead, Card, Toast, useConfirm, Stat, Badge, Tabs, TabList, Tab, TabPanels, TabPanel } from '../components/Primitives';
import { useProject } from '../context/ProjectContext';
import { backupAPI, migrationAPI } from '../api/client';
import {
  createFullBackup,
  downloadBackup,
  restoreFromBackup,
  getBackupHistory,
  deleteBackupHistoryEntry,
  clearBackupHistory,
  hasSafetyBackup,
  restoreSafetyBackup,
  exportProjects,
  exportWell,
  exportMonitoringCSV,
  exportGeologyCSV,
  exportDocumentationMetadata,
  importProjects,
  importWell,
} from '../storage/backupStorage.js';
import { checkDataIntegrity, generateRepairPreview, executeRepair, SEVERITY } from '../storage/integrityStorage.js';
import { getStorageHealth, formatBytes } from '../storage/healthStorage.js';
import { auditStorage, collectIndexedDBAssets } from '../storage/backupStorage.js';
import MigrationWizard from './MigrationWizard';

const TABS = [
  { id: 'backup', label: 'Backup & Restore', icon: Archive },
  { id: 'import-export', label: 'Import & Export', icon: FileText },
  { id: 'migration', label: 'Legacy Migration', icon: RefreshCcw },
  { id: 'health', label: 'Storage Health', icon: HardDrive },
  { id: 'integrity', label: 'Data Integrity', icon: Shield },
];

export default function DataManagementPage() {
  const { projects, activeWellId, notify, getWellsForProject, getWellData, getProjectById, isAuthenticated } = useProject();
  const [activeTab, setActiveTab] = useState('backup');
  const [confirm, confirmDialog] = useConfirm();
  const [toast, setToast] = useState(null);

  // Backup state
  const [backupHistory, setBackupHistory] = useState([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMode, setRestoreMode] = useState('replace');
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [backupPreview, setBackupPreview] = useState(null);
  const [showSafetyBackup, setShowSafetyBackup] = useState(false);

  // Import/Export state
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedWellForExport, setSelectedWellForExport] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importType, setImportType] = useState('projects');

  // Health state
  const [healthData, setHealthData] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Integrity state
  const [integrityData, setIntegrityData] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [repairPreview, setRepairPreview] = useState(null);
  const [executingRepair, setExecutingRepair] = useState(false);

  const notifyLocal = useCallback((message, type = 'info') => {
    setToast({ id: Date.now(), message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load backup history on mount
  useEffect(() => {
    setBackupHistory(getBackupHistory());
  }, []);

  // ==================== BACKUP & RESTORE ====================

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      if (isAuthenticated) {
        // API mode: get backup data from backend
        const res = await backupAPI.create();
        const data = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `borewell-backup-${timestamp}.json`;

        // Save to history
        const entry = {
          filename,
          size: blob.size,
          createdAt: new Date().toISOString(),
          projectCount: res.projects?.length || 0,
          wellCount: res.projects?.reduce((s, p) => s + (p.wells?.length || 0), 0) || 0,
        };
        const history = getBackupHistory();
        history.unshift(entry);
        if (history.length > 50) history.length = 50;
        localStorage.setItem('borewell-backup-history:v1', JSON.stringify(history));
        setBackupHistory(history);

        // Download
        downloadBackup(blob, filename);
        notifyLocal('Backup berhasil dibuat dan diunduh', 'success');
      } else {
        // LocalStorage mode
        const blob = await createFullBackup('2.0.0');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `borewell-backup-${timestamp}.zip`;

        // Save to history
        const entry = {
          filename,
          size: blob.size,
          createdAt: new Date().toISOString(),
          projectCount: projects.length,
          wellCount: projects.flatMap(p => p.wells || []).length,
        };
        const history = getBackupHistory();
        history.unshift(entry);
        if (history.length > 50) history.length = 50;
        localStorage.setItem('borewell-backup-history:v1', JSON.stringify(history));
        setBackupHistory(history);

        // Download
        downloadBackup(blob, filename);
        notifyLocal('Backup berhasil dibuat dan diunduh', 'success');
      }
    } catch (e) {
      console.error(e);
      notifyLocal(`Gagal membuat backup: ${e.message}`, 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleBackupFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedBackupFile(file);
      previewBackupFile(file);
    }
  };

  const previewBackupFile = async (file) => {
    try {
      if (file.name.endsWith('.zip')) {
        // ZIP backup (localStorage mode)
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) throw new Error('Invalid backup: manifest.json not found');
        const manifestText = await manifestFile.async('text');
        const manifest = JSON.parse(manifestText);

        setBackupPreview({
          filename: file.name,
          size: file.size,
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion,
          projectCount: manifest.projects?.length || 0,
          wellCount: manifest.wells?.length || 0,
          projectPhotoCount: manifest.documentation?.project?.reduce((s, p) => s + (p.photos?.length || 0), 0) || 0,
          wellPhotoCount: manifest.documentation?.well?.reduce((s, w) => s + (w.photos?.length || 0), 0) || 0,
          projectDocCount: manifest.documentation?.project?.reduce((s, p) => s + (p.documents?.length || 0), 0) || 0,
          wellDocCount: manifest.documentation?.well?.reduce((s, w) => s + (w.documents?.length || 0), 0) || 0,
          indexedDBAssets: manifest.storageManifest?.indexedDB?.length || 0,
          validation: { valid: true, errors: [], warnings: [] },
        });
      } else {
        // JSON backup (API mode)
        const text = await file.text();
        const manifest = JSON.parse(text);

        setBackupPreview({
          filename: file.name,
          size: file.size,
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion || 'unknown',
          projectCount: manifest.projects?.length || 0,
          wellCount: manifest.projects?.reduce((s, p) => s + (p.wells?.length || 0), 0) || 0,
          projectPhotoCount: manifest.projects?.reduce((s, p) => s + (p.wells?.reduce((w, bw) => w + (bw.photos?.length || 0), 0), 0), 0) || 0,
          wellPhotoCount: manifest.projects?.reduce((s, p) => s + (p.wells?.reduce((w, bw) => w + (bw.photos?.length || 0), 0), 0), 0) || 0,
          projectDocCount: manifest.projects?.reduce((s, p) => s + (p.wells?.reduce((w, bw) => w + (bw.documents?.length || 0), 0), 0), 0) || 0,
          wellDocCount: manifest.projects?.reduce((s, p) => s + (p.wells?.reduce((w, bw) => w + (bw.documents?.length || 0), 0), 0), 0) || 0,
          indexedDBAssets: 0,
          validation: { valid: true, errors: [], warnings: [] },
        });
      }
    } catch (e) {
      setBackupPreview({ error: e.message, validation: { valid: false, errors: [e.message], warnings: [] } });
    }
  };

  const handleRestore = async () => {
    if (!selectedBackupFile) return;

    const ok = await confirm({
      title: restoreMode === 'replace' ? 'Ganti Semua Data (Full Replace)' : 'Gabungkan Data (Merge)',
      message: restoreMode === 'replace'
        ? 'INI AKAN MENGHAPUS SEMUA DATA SAAT INI dan menggantinya dengan data dari backup. Safety backup akan dibuat otomatis. Lanjutkan?'
        : 'Data dari backup akan digabungkan dengan data saat ini. Konflik ID akan ditampilkan untuk konfirmasi. Safety backup akan dibuat otomatis. Lanjutkan?',
      confirmLabel: restoreMode === 'replace' ? 'Ya, Ganti Semua' : 'Ya, Gabungkan',
      variant: 'destructive',
    });

    if (!ok) return;

    setRestoring(true);
    try {
      if (isAuthenticated) {
        // API mode: restore via backend
        const text = await selectedBackupFile.text();
        const result = await backupAPI.restore(text, restoreMode);
        if (result.success) {
          notifyLocal(`Restore ${restoreMode} berhasil! ${result.data.restored.projects} proyek, ${result.data.restored.wells} sumur.`, 'success');
          setSelectedBackupFile(null);
          setBackupPreview(null);
          window.location.reload();
        } else {
          notifyLocal(`Restore gagal: ${result.error || 'Unknown error'}`, 'error');
        }
      } else {
        // LocalStorage mode
        const result = await restoreFromBackup(selectedBackupFile, restoreMode);
        if (result.success) {
          notifyLocal(`Restore ${restoreMode === 'replace' ? 'Full Replace' : 'Merge'} berhasil! ${result.restored?.projects || 0} proyek, ${result.restored?.wells || 0} sumur.`, 'success');
          setSelectedBackupFile(null);
          setBackupPreview(null);
          // Refresh project context
          window.location.reload();
        } else {
          const rolledBack = result.rolledBack ? ' (Data dikembalikan ke safety backup)' : '';
          notifyLocal(`Restore gagal: ${result.error}${rolledBack}`, 'error');
        }
      }
    } catch (e) {
      notifyLocal(`Restore error: ${e.message}`, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreSafetyBackup = async () => {
    const ok = await confirm({
      title: 'Pulihkan Safety Backup?',
      message: 'Ini akan mengganti semua data saat ini dengan safety backup yang dibuat sebelum restore terakhir. Lanjutkan?',
      confirmLabel: 'Ya, Pulihkan',
      variant: 'destructive',
    });
    if (!ok) return;

    const result = restoreSafetyBackup();
    if (result.success) {
      notifyLocal('Safety backup berhasil dipulihkan', 'success');
      window.location.reload();
    } else {
      notifyLocal(`Gagal memulihkan safety backup: ${result.error}`, 'error');
    }
  };

  const handleDeleteBackupHistory = (index) => {
    deleteBackupHistoryEntry(index);
    setBackupHistory(getBackupHistory());
  };

  const handleClearBackupHistory = async () => {
    const ok = await confirm({
      title: 'Hapus Riwayat Backup?',
      message: 'Semua riwayat backup lokal akan dihapus. File backup yang sudah diunduh tidak terpengaruh.',
      confirmLabel: 'Hapus',
      variant: 'destructive',
    });
    if (ok) {
      clearBackupHistory();
      setBackupHistory([]);
      notifyLocal('Riwayat backup dihapus', 'success');
    }
  };

  // ==================== IMPORT & EXPORT ====================

  const handleExport = async (type) => {
    setExporting(true);
    try {
      let content, filename, mimeType;

      switch (type) {
        case 'projects': {
          content = exportProjects();
          filename = `borewell-projects-${new Date().toISOString().slice(0, 10)}.json`;
          mimeType = 'application/json';
          break;
        }
        case 'well': {
          if (!selectedWellForExport) {
            notifyLocal('Pilih sumur terlebih dahulu', 'warning');
            return;
          }
          content = exportWell(selectedWellForExport);
          if (!content) {
            notifyLocal('Data sumur tidak ditemukan', 'error');
            return;
          }
          const well = getWellData(selectedWellForExport);
          filename = `borewell-well-${well?.well?.wellCode || 'unknown'}-${new Date().toISOString().slice(0, 10)}.json`;
          mimeType = 'application/json';
          break;
        }
        case 'monitoring': {
          if (!selectedWellForExport) {
            notifyLocal('Pilih sumur terlebih dahulu', 'warning');
            return;
          }
          content = exportMonitoringCSV(selectedWellForExport);
          if (!content) {
            notifyLocal('Data monitoring tidak ditemukan', 'error');
            return;
          }
          const well = getWellData(selectedWellForExport);
          filename = `borewell-monitoring-${well?.well?.wellCode || 'unknown'}-${new Date().toISOString().slice(0, 10)}.csv`;
          mimeType = 'text/csv';
          break;
        }
        case 'geology': {
          if (!selectedWellForExport) {
            notifyLocal('Pilih sumur terlebih dahulu', 'warning');
            return;
          }
          content = exportGeologyCSV(selectedWellForExport);
          if (!content) {
            notifyLocal('Data geologi tidak ditemukan', 'error');
            return;
          }
          const well = getWellData(selectedWellForExport);
          filename = `borewell-geology-${well?.well?.wellCode || 'unknown'}-${new Date().toISOString().slice(0, 10)}.csv`;
          mimeType = 'text/csv';
          break;
        }
        case 'docs': {
          content = exportDocumentationMetadata();
          filename = `borewell-docs-metadata-${new Date().toISOString().slice(0, 10)}.json`;
          mimeType = 'application/json';
          break;
        }
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notifyLocal(`${type} berhasil diekspor`, 'success');
    } catch (e) {
      console.error(e);
      notifyLocal(`Gagal ekspor: ${e.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImportFile(file);
      previewImportFile(file);
    }
  };

  const previewImportFile = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (importType === 'projects') {
        setImportPreview({
          type: 'projects',
          projectCount: data.projects?.length || 0,
          projectCodes: data.projects?.map(p => p.projectCode).slice(0, 10) || [],
        });
      } else if (importType === 'well') {
        setImportPreview({
          type: 'well',
          wellCode: data.well?.well?.wellCode,
          wellName: data.well?.well?.wellName,
          projectId: data.well?.well?.projectId,
          hasModel: !!data.well?.model,
          hasDocumentation: !!data.documentation,
        });
      }
    } catch (e) {
      setImportPreview({ error: e.message });
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    const ok = await confirm({
      title: 'Impor Data?',
      message: `Data dari file akan diimpor. Data existing tidak akan dihapus. Lanjutkan?`,
      confirmLabel: 'Ya, Impor',
    });
    if (!ok) return;

    setImporting(true);
    try {
      const text = await importFile.text();
      let result;
      if (importType === 'projects') {
        result = await importProjects(text);
        notifyLocal(`Impor proyek: ${result.created} baru, ${result.updated} diperbarui`, 'success');
      } else if (importType === 'well') {
        result = await importWell(text);
        notifyLocal(`Impor sumur: ${result.wellId}`, 'success');
      }
      setImportFile(null);
      setImportPreview(null);
      window.location.reload();
    } catch (e) {
      notifyLocal(`Gagal impor: ${e.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  // ==================== STORAGE HEALTH ====================

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const health = await getStorageHealth();
      setHealthData(health);
    } catch (e) {
      notifyLocal(`Gagal memeriksa kesehatan: ${e.message}`, 'error');
    } finally {
      setCheckingHealth(false);
    }
  };

  // ==================== DATA INTEGRITY ====================

  const handleCheckIntegrity = async () => {
    setCheckingIntegrity(true);
    try {
      const result = checkDataIntegrity();
      // Wait for indexedDB check
      const indexedDBResult = await result.indexedDBCheck;
      const allIssues = [...result.issues, ...indexedDBResult.issues];
      setIntegrityData({
        ...result,
        issues: allIssues,
        summary: {
          totalIssues: allIssues.length,
          errors: allIssues.filter(i => i.severity === SEVERITY.ERROR).length,
          warnings: allIssues.filter(i => i.severity === SEVERITY.WARNING).length,
          info: allIssues.filter(i => i.severity === SEVERITY.INFO).length,
        },
        indexedDB: indexedDBResult,
      });
      // Generate repair preview
      const repairs = generateRepairPreview(allIssues);
      setRepairPreview(repairs);
    } catch (e) {
      notifyLocal(`Gagal memeriksa integritas: ${e.message}`, 'error');
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const handleExecuteRepair = async (repair) => {
    const ok = await confirm({
      title: 'Jalankan Perbaikan?',
      message: `${repair.description}\n\nPreview: ${repair.preview}\n\n${repair.destructive ? '⚠️ TINDAKAN DESTRUKTIF - Data akan dihapus permanen' : ''}`,
      confirmLabel: 'Ya, Jalankan',
      variant: repair.destructive ? 'destructive' : 'primary',
    });
    if (!ok) return;

    setExecutingRepair(true);
    try {
      const result = await executeRepair(repair.action, repair.issueId ? integrityData.issues.find(i => i.id === repair.issueId)?.details : {});
      if (result.success) {
        notifyLocal(result.message, 'success');
        // Re-check integrity
        handleCheckIntegrity();
      } else {
        notifyLocal(result.message, 'error');
      }
    } catch (e) {
      notifyLocal(`Perbaikan gagal: ${e.message}`, 'error');
    } finally {
      setExecutingRepair(false);
    }
  };

  // ==================== RENDER ====================

  const wellsForExport = activeWellId
    ? [{ id: activeWellId, ...getWellData(activeWellId)?.well }]
    : projects.flatMap(p => getWellsForProject(p.id).map(w => ({ ...w, projectId: p.id })));

  return (
    <div className="data-management-page">
      <PageHead
        kicker="08 · Manajemen Data"
        title="Backup, Restore & Integritas Data"
        description="Kelola backup, impor/ekspor, kesehatan penyimpanan, dan integritas data aplikasi."
      >
        <Tabs value={activeTab} onChange={setActiveTab} className="page-tabs">
          <TabList>
            {TABS.map(({ id, label, icon: Icon }) => (
              <Tab key={id} value={id}><Icon size={16} /><span>{label}</span></Tab>
            ))}
          </TabList>
        </Tabs>
      </PageHead>

      <TabPanels value={activeTab}>
        {/* BACKUP & RESTORE TAB */}
        <TabPanel value="backup">
          <div className="tab-content">
            <section className="card-section">
              <h3><Archive size={20} /> Buat Backup Lengkap</h3>
              <p className="card-desc">Backup mencakup semua proyek, sumur, desain, log geologi, monitoring, foto, dokumen, dan file binary IndexedDB.</p>
              <Button variant="primary" icon={Download} loading={creatingBackup} onClick={handleCreateBackup} disabled={creatingBackup}>
                {creatingBackup ? 'Membuat Backup...' : 'Buat & Unduh Backup'}
              </Button>
              {hasSafetyBackup() && (
                <div className="safety-backup-banner">
                  <Shield size={16} style={{ color: 'var(--ochre)' }} />
                  <span>Safety backup tersedia dari restore terakhir</span>
                  <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleRestoreSafetyBackup}>Pulihkan Safety Backup</Button>
                </div>
              )}
            </section>

            <section className="card-section">
              <h3><Upload size={20} /> Restore dari File Backup</h3>
              <p className="card-desc">Pilih file backup (.zip) untuk memulihkan data.</p>
              <div className="file-input-wrap">
                <input type="file" accept=".zip" onChange={handleBackupFileSelect} id="backup-file" className="file-input" />
                <label htmlFor="backup-file" className="file-input-label">
                  <Upload size={20} /><span>Pilih File Backup (.zip)</span>
                </label>
              </div>

              {backupPreview && (
                <div className={`backup-preview ${backupPreview.error ? 'error' : ''}`}>
                  {backupPreview.error ? (
                    <div className="preview-error">
                      <XCircle size={24} /><span>{backupPreview.error}</span>
                    </div>
                  ) : (
                    <>
                      <div className="preview-header">
                        <strong>{backupPreview.filename}</strong>
                        <Badge variant="success">Valid</Badge>
                      </div>
                      <div className="preview-stats">
                        <Stat label="Ukuran" value={formatBytes(backupPreview.size)} />
                        <Stat label="Dibuat" value={new Date(backupPreview.createdAt).toLocaleString('id-ID')} />
                        <Stat label="Proyek" value={backupPreview.projectCount} />
                        <Stat label="Sumur" value={backupPreview.wellCount} />
                        <Stat label="Foto Proyek" value={backupPreview.projectPhotoCount} />
                        <Stat label="Foto Sumur" value={backupPreview.wellPhotoCount} />
                        <Stat label="Dokumen Proyek" value={backupPreview.projectDocCount} />
                        <Stat label="Dokumen Sumur" value={backupPreview.wellDocCount} />
                        <Stat label="Aset IndexedDB" value={backupPreview.indexedDBAssets} />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="restore-mode-selector">
                <label>
                  <input
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={e => setRestoreMode(e.target.value)}
                  />
                  <span className="mode-option">
                    <RotateCcw size={16} />
                    <div>
                      <strong>Full Replace</strong>
                      <small>Ganti seluruh data aplikasi dengan backup</small>
                    </div>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={e => setRestoreMode(e.target.value)}
                  />
                  <span className="mode-option">
                    <FilePlus size={16} />
                    <div>
                      <strong>Merge</strong>
                      <small>Gabungkan data backup dengan data existing (deteksi konflik)</small>
                    </div>
                  </span>
                </label>
              </div>

              <Button
                variant={restoreMode === 'replace' ? 'destructive' : 'primary'}
                icon={RotateCcw}
                loading={restoring}
                onClick={handleRestore}
                disabled={!backupPreview || restoring || backupPreview.error}
              >
                {restoring ? 'Memulihkan...' : restoreMode === 'replace' ? 'Ganti Semua Data' : 'Gabungkan Data'}
              </Button>
            </section>

            <section className="card-section">
              <h3><FileText size={20} /> Riwayat Backup Lokal</h3>
              {backupHistory.length === 0 ? (
                <p className="empty-state">Belum ada riwayat backup. Backup akan tersimpan di sini setelah dibuat.</p>
              ) : (
                <div className="history-list">
                  {backupHistory.map((entry, index) => (
                    <div key={index} className="history-item">
                      <div className="history-info">
                        <strong>{entry.filename}</strong>
                        <span className="meta">
                          {formatBytes(entry.size)} • {new Date(entry.createdAt).toLocaleString('id-ID')} •
                          {entry.projectCount} proyek, {entry.wellCount} sumur
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => handleDeleteBackupHistory(index)}>Hapus</Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={handleClearBackupHistory} className="clear-history">
                    Hapus Semua Riwayat
                  </Button>
                </div>
              )}
            </section>
          </div>
        </TabPanel>

        {/* IMPORT & EXPORT TAB */}
        <TabPanel value="import-export">
          <div className="tab-content">
            <section className="card-section">
              <h3><Download size={20} /> Ekspor Data</h3>
              <div className="export-grid">
                <ExportCard
                  title="Proyek"
                  description="Semua proyek (JSON)"
                  icon={FolderOpen}
                  onExport={() => handleExport('projects')}
                  loading={exporting}
                />
                <ExportCard
                  title="Sumur Terpilih"
                  description="Data sumur lengkap + dokumentasi (JSON)"
                  icon={Database}
                  onExport={() => handleExport('well')}
                  loading={exporting}
                  disabled={!selectedWellForExport}
                  selectWell={selectedWellForExport}
                  onSelectWell={setSelectedWellForExport}
                  wells={wellsForExport}
                />
                <ExportCard
                  title="Monitoring Air Tanah"
                  description="Data pengukuran (CSV)"
                  icon={Zap}
                  onExport={() => handleExport('monitoring')}
                  loading={exporting}
                  disabled={!selectedWellForExport}
                  selectWell={selectedWellForExport}
                  onSelectWell={setSelectedWellForExport}
                  wells={wellsForExport}
                />
                <ExportCard
                  title="Log Geologi"
                  description="Lapisan geologi (CSV)"
                  icon={Search}
                  onExport={() => handleExport('geology')}
                  loading={exporting}
                  disabled={!selectedWellForExport}
                  selectWell={selectedWellForExport}
                  onSelectWell={setSelectedWellForExport}
                  wells={wellsForExport}
                />
                <ExportCard
                  title="Metadata Dokumentasi"
                  description="Ringkasan foto & dokumen (JSON)"
                  icon={FileText}
                  onExport={() => handleExport('docs')}
                  loading={exporting}
                />
              </div>
            </section>

            <section className="card-section">
              <h3><Upload size={20} /> Impor Data</h3>
              <div className="import-type-selector">
                <label>
                  <input type="radio" name="importType" value="projects" checked={importType === 'projects'} onChange={e => { setImportType(e.target.value); setImportPreview(null); }} />
                  <span>Proyek (JSON)</span>
                </label>
                <label>
                  <input type="radio" name="importType" value="well" checked={importType === 'well'} onChange={e => { setImportType(e.target.value); setImportPreview(null); }} />
                  <span>Sumur (JSON)</span>
                </label>
              </div>
              <div className="file-input-wrap">
                <input type="file" accept=".json" onChange={handleImportFileSelect} id="import-file" className="file-input" />
                <label htmlFor="import-file" className="file-input-label">
                  <Upload size={20} /><span>Pilih File JSON</span>
                </label>
              </div>

              {importPreview && (
                <div className={`import-preview ${importPreview.error ? 'error' : ''}`}>
                  {importPreview.error ? (
                    <div className="preview-error"><XCircle size={24} /><span>{importPreview.error}</span></div>
                  ) : importPreview.type === 'projects' ? (
                    <>
                      <strong>Proyek: {importPreview.projectCount}</strong>
                      <div className="preview-codes">{importPreview.projectCodes.join(', ')}</div>
                    </>
                  ) : (
                    <>
                      <strong>Sumur: {importPreview.wellCode} - {importPreview.wellName}</strong>
                      <div className="meta">Proyek: {importPreview.projectId} • Model: {importPreview.hasModel ? 'Ya' : 'Tidak'} • Docs: {importPreview.hasDocumentation ? 'Ya' : 'Tidak'}</div>
                    </>
                  )}
                </div>
              )}

              <Button variant="primary" icon={Upload} loading={importing} onClick={handleImport} disabled={!importPreview || importing || importPreview.error}>
                {importing ? 'Mengimpor...' : 'Impor Data'}
              </Button>
            </section>
          </div>
        </TabPanel>

        {/* LEGACY MIGRATION TAB */}
        <TabPanel value="migration">
          <div className="tab-content">
            <MigrationWizard isAuthenticated={isAuthenticated} />
          </div>
        </TabPanel>

        {/* STORAGE HEALTH TAB */}
        <TabPanel value="health">
          <div className="tab-content">
            <section className="card-section">
              <div className="section-header">
                <h3><HardDrive size={20} /> Kesehatan Penyimpanan</h3>
                <Button variant="primary" icon={RefreshCw} loading={checkingHealth} onClick={handleCheckHealth} disabled={checkingHealth}>
                  {checkingHealth ? 'Memeriksa...' : 'Periksa Kesehatan'}
                </Button>
              </div>

              {healthData && (
                <>
                  {healthData.warnings.length > 0 && (
                    <div className="health-warnings">
                      {healthData.warnings.map((w, i) => (
                        <div key={i} className={`health-warning ${w.level}`}>
                          {w.level === 'critical' && <AlertTriangle size={16} />}
                          {w.level === 'warning' && <AlertCircle size={16} />}
                          {w.level === 'info' && <Info size={16} />}
                          <span>{w.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="health-grid">
                    <HealthCard
                      title="LocalStorage"
                      used={healthData.localStorage.used}
                      quota={healthData.localStorage.quota}
                      percent={healthData.localStorage.percent}
                      breakdown={healthData.localStorage.breakdown}
                      keyCount={healthData.localStorage.keyCount}
                    />
                    <HealthCard
                      title="IndexedDB"
                      used={healthData.indexedDB.used}
                      quota={healthData.indexedDB.quota}
                      percent={healthData.indexedDB.percent}
                      available={healthData.indexedDB.available}
                      photoCount={healthData.indexedDB.photoCount}
                      documentCount={healthData.indexedDB.documentCount}
                      photoSize={healthData.indexedDB.photoSize}
                      documentSize={healthData.indexedDB.documentSize}
                    />
                  </div>

                  <div className="data-counts">
                    <h4>Jumlah Data</h4>
                    <div className="counts-grid">
                      <Stat label="Proyek" value={healthData.dataCounts.projectCount} />
                      <Stat label="Sumur" value={healthData.dataCounts.wellCount} />
                      <Stat label="Foto" value={healthData.dataCounts.photoCount} />
                      <Stat label="Dokumen" value={healthData.dataCounts.documentCount} />
                      <Stat label="Total File" value={formatBytes(healthData.dataCounts.totalFileSize)} />
                      <Stat label="Estimasi Total" value={formatBytes(healthData.totalEstimatedSize)} />
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="card-section">
              <h3><Database size={20} /> Audit Storage Keys</h3>
              <AuditStorageDisplay />
            </section>
          </div>
        </TabPanel>

        {/* DATA INTEGRITY TAB */}
        <TabPanel value="integrity">
          <div className="tab-content">
            <section className="card-section">
              <div className="section-header">
                <h3><Shield size={20} /> Pemeriksaan Integritas Data</h3>
                <Button variant="primary" icon={RefreshCw} loading={checkingIntegrity} onClick={handleCheckIntegrity} disabled={checkingIntegrity}>
                  {checkingIntegrity ? 'Memeriksa...' : 'Periksa Integritas'}
                </Button>
              </div>

              {integrityData && (
                <>
                  <div className="integrity-summary">
                    <Stat label="Total Masalah" value={integrityData.summary.totalIssues} color={integrityData.summary.errors > 0 ? 'var(--red)' : integrityData.summary.warnings > 0 ? 'var(--ochre)' : 'var(--green)'} />
                    <Stat label="Error" value={integrityData.summary.errors} color="var(--red)" />
                    <Stat label="Warning" value={integrityData.summary.warnings} color="var(--ochre)" />
                    <Stat label="Info" value={integrityData.summary.info} color="var(--blue)" />
                    <Stat label="Proyek Dicek" value={integrityData.stats.projectsChecked} />
                    <Stat label="Sumur Dicek" value={integrityData.stats.wellsChecked} />
                    <Stat label="Foto Dicek" value={integrityData.stats.photosChecked} />
                    <Stat label="Dokumen Dicek" value={integrityData.stats.documentsChecked} />
                  </div>

                  {integrityData.indexedDB && integrityData.indexedDB.checked && (
                    <div className="indexeddb-status">
                      <Info size={16} />
                      <span>IndexedDB: {integrityData.indexedDB.photoCount} foto, {integrityData.indexedDB.documentCount} dokumen</span>
                    </div>
                  )}

                  {integrityData.issues.length === 0 ? (
                    <div className="empty-state success">
                      <CheckCircle size={48} style={{ color: 'var(--green)' }} />
                      <h4>Tidak ada masalah ditemukan</h4>
                      <p>Semua data konsisten dan valid.</p>
                    </div>
                  ) : (
                    <div className="issues-list">
                      {integrityData.issues
                        .sort((a, b) => {
                          const sevOrder = { error: 0, warning: 1, info: 2 };
                          return sevOrder[a.severity] - sevOrder[b.severity];
                        })
                        .map((issue) => (
                          <IssueCard
                            key={issue.id}
                            issue={issue}
                            repair={repairPreview?.find(r => r.issueId === issue.id)}
                            onRepair={handleExecuteRepair}
                            executing={executingRepair}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}

              {!integrityData && (
                <p className="empty-state">Klik "Periksa Integritas" untuk memulai pemeriksaan.</p>
              )}
            </section>
          </div>
        </TabPanel>
      </TabPanels>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      {confirmDialog}
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function ExportCard({ title, description, icon: Icon, onExport, loading, disabled, selectWell, onSelectWell, wells }) {
  return (
    <div className={`export-card ${disabled ? 'disabled' : ''}`}>
      <Icon size={28} />
      <h4>{title}</h4>
      <p>{description}</p>
      {selectWell !== undefined && wells && wells.length > 0 && (
        <Field as="select" value={selectWell} onChange={e => onSelectWell(e.target.value || null)} className="well-select">
          <option value="">Pilih sumur...</option>
          {wells.map(w => <option key={w.id} value={w.id}>{w.wellCode} - {w.wellName}</option>)}
        </Field>
      )}
      <Button
        variant="primary"
        icon={Download}
        onClick={onExport}
        disabled={loading || disabled || (wells && wells.length > 0 && !selectWell)}
        className="export-btn"
      >
        {loading ? 'Mengekspor...' : 'Ekspor'}
      </Button>
    </div>
  );
}

function HealthCard({ title, used, quota, percent, breakdown, keyCount, available, photoCount, documentCount, photoSize, documentSize }) {
  if (title === 'LocalStorage') {
    return (
      <div className="health-card">
        <h4>{title}</h4>
        <div className="usage-bar">
          <div className="usage-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
        <div className="usage-text">
          <span>{formatBytes(used)} / {formatBytes(quota)} ({percent}%)</span>
          <span>{keyCount} keys</span>
        </div>
        {breakdown && (
          <div className="breakdown">
            <div><strong>Proyek:</strong> {formatBytes(breakdown.projects)}</div>
            <div><strong>Sumur:</strong> {formatBytes(breakdown.wells)}</div>
            <div><strong>Dokumentasi:</strong> {formatBytes(breakdown.documentation)}</div>
            <div><strong>Legacy:</strong> {formatBytes(breakdown.legacy)}</div>
            <div><strong>Lainnya:</strong> {formatBytes(breakdown.other)}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="health-card">
      <h4>{title} {available ? <CheckCircle size={16} style={{ color: 'var(--green)' }} /> : <XCircle size={16} style={{ color: 'var(--red)' }} />}</h4>
      {available ? (
        <>
          <div className="usage-bar">
            <div className="usage-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
          <div className="usage-text">
            <span>{formatBytes(used)} / {formatBytes(quota)} ({percent}%)</span>
          </div>
          <div className="breakdown">
            <div><strong>Foto:</strong> {photoCount} ({formatBytes(photoSize)})</div>
            <div><strong>Dokumen:</strong> {documentCount} ({formatBytes(documentSize)})</div>
          </div>
        </>
      ) : (
        <div className="usage-text">Estimasi kuota tidak tersedia di browser ini</div>
      )}
    </div>
  );
}

function AuditStorageDisplay() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAudit = () => {
    setLoading(true);
    setTimeout(() => {
      setAudit(auditStorage());
      setLoading(false);
    }, 100);
  };

  useEffect(() => { runAudit(); }, []);

  if (!audit) return <Button variant="primary" icon={RefreshCw} onClick={runAudit} loading={loading}>Jalankan Audit</Button>;

  return (
    <div className="audit-display">
      <div className="audit-summary">
        <Stat label="Total Keys" value={audit.localStorage.totalKeys} />
        <Stat label="Total Size" value={formatBytes(audit.localStorage.totalSize)} />
        <Stat label="Borewell Keys" value={audit.localStorage.borewellKeys.length} />
        <Stat label="Borewell Size" value={formatBytes(audit.localStorage.borewellSize)} />
        <Stat label="Projects" value={audit.projects} />
        <Stat label="Wells" value={audit.wells} />
      </div>
      <details className="audit-details">
        <summary>Lihat semua LocalStorage keys</summary>
        <table className="audit-table">
          <thead><tr><th>Key</th><th>Size</th></tr></thead>
          <tbody>
            {audit.localStorage.allKeys.map(({ key, size }) => (
              <tr key={key} className={key.startsWith('borewell-') ? 'borewell' : ''}>
                <td className="mono">{key}</td>
                <td className="mono">{formatBytes(size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function IssueCard({ issue, repair, onRepair, executing }) {
  const severityColors = {
    error: 'var(--red)',
    warning: 'var(--ochre)',
    info: 'var(--blue)',
  };
  const severityIcons = {
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };
  const Icon = severityIcons[issue.severity];

  return (
    <div className={`issue-card ${issue.severity}`}>
      <div className="issue-header">
        <Icon size={18} style={{ color: severityColors[issue.severity] }} />
        <div className="issue-main">
          <strong>{issue.category.toUpperCase()}: {issue.message}</strong>
          <span className={`severity-badge ${issue.severity}`}>{issue.severity}</span>
        </div>
        <span className="issue-time">{new Date(issue.timestamp).toLocaleString('id-ID')}</span>
      </div>
      {issue.details && Object.keys(issue.details).length > 0 && (
        <details className="issue-details">
          <summary>Detail</summary>
          <pre>{JSON.stringify(issue.details, null, 2)}</pre>
        </details>
      )}
      {repair && (
        <div className="issue-repair">
          <button
            className={`repair-btn ${repair.destructive ? 'destructive' : ''}`}
            onClick={() => onRepair(repair)}
            disabled={executing}
          >
            {executing ? <Loader2 size={14} className="spin" /> : null}
            {repair.destructive ? '⚠️ ' : ''}{repair.action.replace(/_/g, ' ')}
          </button>
          <small>{repair.preview}</small>
        </div>
      )}
    </div>
  );
}