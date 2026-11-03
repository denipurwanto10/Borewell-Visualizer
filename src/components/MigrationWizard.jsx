import { useState, useCallback, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../components/Primitives';
import { migrationAPI } from '../api/client';
import { auditStorage, collectIndexedDBAssets } from '../storage/backupStorage';
import { getAllProjects, getWellsForProject, getWellData } from '../storage/projectStorage';
import { getProjectDocsData, getWellDocsData } from '../storage/documentationStorage';

const STEP_LABELS = [
  'Detect Legacy Data',
  'Select Owner',
  'Preview Migration',
  'Options',
  'Execute Import',
  'Verify Results'
];

export function MigrationWizard({ onClose, onMigrationComplete, isAuthenticated }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Show auth required message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="migration-wizard">
        <div className="wizard-header">
          <h2>🔄 Wizard Migrasi Data Legacy</h2>
          <p>Pindahkan data dari localStorage/IndexedDB ke PostgreSQL backend</p>
        </div>
        <div className="auth-required">
          <AlertCircle size={48} style={{ color: 'var(--ochre)' }} />
          <h3>Autentikasi Diperlukan</h3>
          <p>Anda harus login untuk melakukan migrasi data legacy.</p>
          <p>Data legacy akan diimpor ke akun pengguna yang sedang login.</p>
          <Button variant="primary" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    );
  }
  
  // ... rest of component
  
  // Step 1: Detected data
  const [detectedData, setDetectedData] = useState(null);
  
  // Step 2: Owner selection
  const [ownerChoice, setOwnerChoice] = useState('current'); // 'current' | 'new'
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  
  // Step 3: Preview
  const [previewData, setPreviewData] = useState(null);
  
  // Step 4: Options
  const [skipConflicts, setSkipConflicts] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  
  // Step 5: Import progress
  const [importProgress, setImportProgress] = useState({ status: 'idle', message: '', details: null });
  
  // Step 6: Results
  const [importResult, setImportResult] = useState(null);

  // Step 1: Detect legacy data on mount
  useEffect(() => {
    detectLegacyData();
  }, []);

  const detectLegacyData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Audit localStorage
      const audit = auditStorage();
      
      // Collect all legacy data
      const projects = getAllProjects();
      const allWells = [];
      const projectDocs = {};
      const wellDocs = {};
      const indexedDBAssets = await collectIndexedDBAssets();
      
      for (const project of projects) {
        const wells = getWellsForProject(project.id);
        for (const well of wells) {
          const wellData = getWellData(well.id);
          if (wellData) {
            allWells.push(wellData);
          }
        }
        // Project docs
        const pDocs = getProjectDocsData();
        if (pDocs[project.id]) {
          projectDocs[project.id] = pDocs[project.id];
        }
      }
      
      // Well docs
      for (const well of allWells) {
        const wDocs = getWellDocsData(well.well.id);
        if (wDocs) {
          wellDocs[well.well.id] = wDocs;
        }
      }
      
      setDetectedData({
        audit,
        projects,
        wells: allWells,
        projectDocs,
        wellDocs,
        indexedDBPhotos: indexedDBAssets.filter(a => a.store === 'photos').length,
        indexedDBDocuments: indexedDBAssets.filter(a => a.store === 'documents').length,
      });
    } catch (err) {
      setError('Gagal mendeteksi data legacy: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNext = useCallback(async () => {
    if (step === 0) {
      // Step 1 -> 2: Go to owner selection
      setStep(1);
    } else if (step === 1) {
      // Step 2 -> 3: Generate preview
      await generatePreview();
    } else if (step === 2) {
      // Step 3 -> 4: Go to options
      setStep(3);
    } else if (step === 3) {
      // Step 4 -> 5: Execute import
      await executeImport();
    } else if (step === 4) {
      // Step 5 -> 6: Show results
      setStep(5);
    }
  }, [step]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      setStep(step - 1);
    }
  }, [step]);

  const generatePreview = useCallback(async () => {
    if (!detectedData) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Prepare legacy data for preview
      const legacyData = {
        projects: detectedData.projects.map(p => ({
          id: p.id,
          projectCode: p.projectCode,
          projectName: p.projectName,
          clientName: p.clientName,
          contractorName: p.contractorName || '',
          location: p.location || '',
          province: p.province || '',
          district: p.district || '',
          village: p.village || '',
          latitude: p.latitude || '',
          longitude: p.longitude || '',
          description: p.description || '',
          startDate: p.startDate || '',
          endDate: p.endDate || '',
          status: p.status || 'planning',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          archivedAt: p.archivedAt || '',
          wells: p.wells || [],
        })),
        wells: detectedData.wells.map(w => ({
          well: w.well,
          model: w.model,
          activity: w.activity,
        })),
        project_docs: detectedData.projectDocs,
        well_docs: detectedData.wellDocs,
      };
      
      const res = await migrationAPI.preview(legacyData);
      setPreviewData(res.data);
      setStep(2);
    } catch (err) {
      setError('Gagal menghasilkan preview: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [detectedData]);

  const executeImport = useCallback(async () => {
    if (!detectedData) return;
    
    setImportProgress({ status: 'running', message: 'Menyiapkan data...', details: null });
    setLoading(true);
    setError(null);
    
    try {
      // Prepare legacy data
      const legacyData = {
        projects: detectedData.projects.map(p => ({
          id: p.id,
          projectCode: p.projectCode,
          projectName: p.projectName,
          clientName: p.clientName,
          contractorName: p.contractorName || '',
          location: p.location || '',
          province: p.province || '',
          district: p.district || '',
          village: p.village || '',
          latitude: p.latitude || '',
          longitude: p.longitude || '',
          description: p.description || '',
          startDate: p.startDate || '',
          endDate: p.endDate || '',
          status: p.status || 'planning',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          archivedAt: p.archivedAt || '',
          wells: p.wells || [],
        })),
        wells: detectedData.wells.map(w => ({
          well: w.well,
          model: w.model,
          activity: w.activity,
        })),
        project_docs: detectedData.projectDocs,
        well_docs: detectedData.wellDocs,
      };
      
      // Collect files from IndexedDB
      const assets = await collectIndexedDBAssets();
      const fileList = [];
      for (const asset of assets) {
        if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
          const base64 = asset.dataUrl.split(',')[1];
          if (base64) {
            const blob = await (await fetch(`data:${asset.fileType};base64,${base64}`)).blob();
            fileList.push(new File([blob], asset.fileName, { type: asset.fileType }));
          }
        }
      }
      
      // Also collect data URL files from localStorage (photos/docs with data: URLs)
      const collectDataUrlFiles = (docs) => {
        const files = [];
        for (const doc of docs) {
          if (doc.fileRef && doc.fileRef.startsWith('data:')) {
            const base64 = doc.fileRef.split(',')[1];
            if (base64) {
              files.push({ fileRef: doc.fileRef, fileName: doc.fileName, fileType: doc.fileType });
            }
          }
        }
        return files;
      };
      
      // For now, we'll rely on the backend to handle data: URLs directly
      // The files from IndexedDB are uploaded separately
      
      const options = { skip_conflicts: skipConflicts, dry_run: dryRun };
      
      setImportProgress({ status: 'running', message: 'Mengimpor data ke backend...', details: null });
      
      const res = await migrationAPI.import(legacyData, { files: fileList }, options);
      
      if (res.data.status === 'DRY_RUN') {
        setImportProgress({ status: 'completed', message: 'Dry run selesai (tidak ada data yang disimpan)', details: res.data });
      } else {
        setImportProgress({ status: 'completed', message: 'Impor selesai', details: res.data });
        setImportResult(res.data);
      }
      
      setStep(4);
    } catch (err) {
      setImportProgress({ status: 'error', message: 'Impor gagal: ' + err.message, details: null });
      setError('Impor gagal: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [detectedData, skipConflicts, dryRun]);

  const handleClose = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  const handleVerify = useCallback(() => {
    if (onMigrationComplete) onMigrationComplete(importResult);
    handleClose();
  }, [importResult, onMigrationComplete, handleClose]);

  // Render steps
  const renderStep = () => {
    switch (step) {
      case 0: return renderStep1();
      case 1: return renderStep2();
      case 2: return renderStep3();
      case 3: return renderStep4();
      case 4: return renderStep5();
      case 5: return renderStep6();
      default: return null;
    }
  };

  const renderStep1 = () => (
    <div className="migration-step">
      <h3>Langkah 1: Deteksi Data Legacy</h3>
      {loading && <p className="loading">Memindai localStorage dan IndexedDB...</p>}
      {error && <div className="error">{error}</div>}
      {detectedData && (
        <div className="detection-summary">
          <div className="summary-grid">
            <div className="summary-card">
              <span className="summary-value">{detectedData.projects.length}</span>
              <span className="summary-label">Project</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{detectedData.wells.length}</span>
              <span className="summary-label">Well</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{Object.values(detectedData.projectDocs).reduce((sum, d) => sum + (d.photos?.length || 0), 0) + 
                Object.values(detectedData.wellDocs).reduce((sum, d) => sum + (d.photos?.length || 0), 0) + 
                detectedData.indexedDBPhotos}</span>
              <span className="summary-label">Foto</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{Object.values(detectedData.projectDocs).reduce((sum, d) => sum + (d.documents?.length || 0), 0) + 
                Object.values(detectedData.wellDocs).reduce((sum, d) => sum + (d.documents?.length || 0), 0) + 
                detectedData.indexedDBDocuments}</span>
              <span className="summary-label">Dokumen</span>
            </div>
          </div>
          
          {detectedData.projects.length > 0 && (
            <div className="project-list">
              <h4>Project yang Ditemukan:</h4>
              <ul>
                {detectedData.projects.map(p => (
                  <li key={p.id}>
                    <strong>{p.projectCode}</strong> — {p.projectName} 
                    ({p.wells?.length || 0} well)
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {detectedData.projects.length === 0 && (
            <div className="no-data">
              <p>Tidak ada data legacy yang ditemukan di browser ini.</p>
              <p>Data migration hanya diperlukan jika Anda memiliki data dari versi sebelumnya yang tersimpan di localStorage/IndexedDB.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="migration-step">
      <h3>Langkah 2: Pilih Pemilik Data</h3>
      <p>Data legacy akan diimpor ke akun pengguna berikut:</p>
      
      <div className="owner-options">
        <label className="radio-option">
          <input
            type="radio"
            name="owner"
            value="current"
            checked={ownerChoice === 'current'}
            onChange={() => setOwnerChoice('current')}
          />
          <div className="radio-content">
            <strong>Pengguna saat ini (default)</strong>
            <span>Data akan dimiliki oleh akun yang sedang login</span>
          </div>
        </label>
        
        <label className="radio-option">
          <input
            type="radio"
            name="owner"
            value="new"
            checked={ownerChoice === 'new'}
            onChange={() => setOwnerChoice('new')}
          />
          <div className="radio-content">
            <strong>Buat pengguna "Legacy Import" baru</strong>
            <span>Data akan dimiliki oleh pengguna khusus untuk impor legacy</span>
          </div>
        </label>
      </div>
      
      {ownerChoice === 'new' && (
        <div className="new-user-form">
          <div className="form-group">
            <label>Email:</label>
            <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="legacy-import@example.com" required />
          </div>
          <div className="form-group">
            <label>Nama Lengkap:</label>
            <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Legacy Import User" required />
          </div>
        </div>
      )}
      
      <p className="hint">Catatan: Data legacy tidak memiliki konsep pengguna. Semua data akan diimpor ke satu pemilik saja.</p>
    </div>
  );

  const renderStep3 = () => (
    <div className="migration-step">
      <h3>Langkah 3: Preview Migrasi</h3>
      {loading && <p className="loading">Menghasilkan preview...</p>}
      {error && <div className="error">{error}</div>}
      {previewData && (
        <div className="preview-data">
          <div className="preview-summary">
            <div className="preview-card">
              <span className="preview-value">{previewData.projects?.length || 0}</span>
              <span className="preview-label">Project Akan Diimpor</span>
            </div>
            <div className="preview-card">
              <span className="preview-value">{previewData.total_wells || 0}</span>
              <span className="preview-label">Total Well</span>
            </div>
            <div className="preview-card">
              <span className="preview-value">{previewData.total_photos || 0}</span>
              <span className="preview-label">Total Foto</span>
            </div>
            <div className="preview-card">
              <span className="preview-value">{previewData.total_documents || 0}</span>
              <span className="preview-label">Total Dokumen</span>
            </div>
            <div className="preview-card">
              <span className="preview-value">{previewData.estimated_size_mb || 0} MB</span>
              <span className="preview-label">Estimasi Ukuran</span>
            </div>
          </div>
          
          {previewData.warnings && previewData.warnings.length > 0 && (
            <div className="warnings">
              <h4>⚠️ Peringatan:</h4>
              <ul>
                {previewData.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          
          {previewData.projects && previewData.projects.length > 0 && (
            <div className="preview-projects">
              <h4>Detail Project:</h4>
              <table>
                <thead>
                  <tr>
                    <th>Kode Project</th>
                    <th>Nama Project</th>
                    <th>Jumlah Well</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.projects.map(p => (
                    <tr key={p.id}>
                      <td>{p.project_code}</td>
                      <td>{p.project_name}</td>
                      <td>{p.well_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="migration-step">
      <h3>Langkah 4: Opsi Impor</h3>
      
      <div className="options-group">
        <label className="checkbox-option">
          <input
            type="checkbox"
            checked={skipConflicts}
            onChange={e => setSkipConflicts(e.target.checked)}
          />
          <span><strong>Lewati konflik</strong> — Jika kode project/well sudah ada, lewati data tersebut (aman, default)</span>
        </label>
        
        <label className="checkbox-option">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
          />
          <span><strong>Dry run</strong> — Simulasikan impor tanpa menyimpan ke database (untuk testing)</span>
        </label>
      </div>
      
      <div className="option-descriptions">
        <h4>Strategi Konflik:</h4>
        <ul>
          <li><strong>Project code duplikat:</strong> {skipConflicts ? 'Lewati (skip)' : 'Rename dengan suffix -IMPORT'}</li>
          <li><strong>Well code duplikat dalam project:</strong> {skipConflicts ? 'Lewati (skip)' : 'Rename dengan suffix -IMPORT'}</li>
          <li><strong>File checksum duplikat:</strong> Gunakan file yang sudah ada, link metadata baru</li>
        </ul>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="migration-step">
      <h3>Langkah 5: Eksekusi Impor</h3>
      
      <div className={`import-progress ${importProgress.status}`}>
        <div className="progress-header">
          <span className={`status-badge ${importProgress.status}`}>
            {importProgress.status === 'running' && '⏳ Sedang berjalan...'}
            {importProgress.status === 'completed' && '✅ Selesai'}
            {importProgress.status === 'error' && '❌ Gagal'}
            {importProgress.status === 'idle' && '⏳ Menunggu...'}
          </span>
        </div>
        <p className="progress-message">{importProgress.message}</p>
        {importProgress.details && (
          <details className="progress-details">
            <summary>Detail hasil</summary>
            <pre>{JSON.stringify(importProgress.details, null, 2)}</pre>
          </details>
        )}
      </div>
      
      {importProgress.status === 'error' && (
        <div className="error-actions">
          <button onClick={() => { setStep(3); setImportProgress({ status: 'idle', message: '', details: null }); }}>
            Kembali ke Opsi
          </button>
        </div>
      )}
    </div>
  );

  const renderStep6 = () => (
    <div className="migration-step">
      <h3>Langkah 6: Verifikasi Hasil</h3>
      
      {importResult && (
        <div className="result-summary">
          <div className={`result-status ${importResult.status?.toLowerCase() || 'completed'}`}>
            <span className="status-icon">
              {importResult.status === 'COMPLETED' && '✅'}
              {importResult.status === 'PARTIAL' && '⚠️'}
              {importResult.status === 'FAILED' && '❌'}
              {importResult.status === 'DRY_RUN' && '🔍'}
            </span>
            <span className="status-text">Status: {importResult.status}</span>
          </div>
          
          <div className="result-stats">
            <div className="stat-card imported">
              <h4>Berhasil Diimpor</h4>
              <ul>
                <li>Project: {importResult.imported?.projects || 0}</li>
                <li>Well: {importResult.imported?.wells || 0}</li>
                <li>Designer States: {importResult.imported?.designer_states || 0}</li>
                <li>Geological Logs: {importResult.imported?.geological_logs || 0}</li>
                <li>Monitoring Data: {importResult.imported?.monitoring_data || 0}</li>
                <li>Foto: {importResult.imported?.photos || 0}</li>
                <li>Dokumen: {importResult.imported?.documents || 0}</li>
                <li>Files: {importResult.imported?.files || 0}</li>
              </ul>
            </div>
            
            {importResult.skipped && (
              <div className="stat-card skipped">
                <h4>Dilewati (Konflik)</h4>
                <ul>
                  <li>Project: {importResult.skipped.projects || 0}</li>
                  <li>Well: {importResult.skipped.wells || 0}</li>
                  <li>Foto: {importResult.skipped.photos || 0}</li>
                  <li>Dokumen: {importResult.skipped.documents || 0}</li>
                </ul>
              </div>
            )}
          </div>
          
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="result-errors">
              <h4>Error:</h4>
              <ul>
                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          
          {importResult.warnings && importResult.warnings.length > 0 && (
            <div className="result-warnings">
              <h4>Peringatan:</h4>
              <ul>
                {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          
          <div className="result-actions">
            <button className="btn-primary" onClick={handleVerify}>
              Selesai & Verifikasi Data
            </button>
            <button className="btn-secondary" onClick={handleClose}>
              Tutup
            </button>
          </div>
          
          <div className="important-note">
            <strong>Penting:</strong> Data lokal (localStorage/IndexedDB) <strong>TIDAK DIHAPUS</strong> secara otomatis. 
            Anda dapat memverifikasi data di backend terlebih dahulu, lalu menghapus data lokal secara manual dari pengaturan jika diinginkan.
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="migration-wizard">
      <div className="wizard-header">
        <h2>🔄 Wizard Migrasi Data Legacy</h2>
        <p>Pindahkan data dari localStorage/IndexedDB ke PostgreSQL backend</p>
      </div>
      
      <div className="wizard-steps">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className={`step-indicator ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}>
            <span className="step-number">{i + 1}</span>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>
      
      <div className="wizard-content">
        {renderStep()}
      </div>
      
      <div className="wizard-footer">
        {step > 0 && (
          <button onClick={handlePrev} disabled={loading} className="btn-secondary">
            ← Kembali
          </button>
        )}
        {step < STEP_LABELS.length - 1 && (
          <button onClick={handleNext} disabled={loading || (step === 1 && ownerChoice === 'new' && (!newUserEmail || !newUserName))} className="btn-primary">
            {loading ? 'Memproses...' : step === STEP_LABELS.length - 2 ? 'Mulai Impor' : 'Lanjut →'}
          </button>
        )}
        {step === STEP_LABELS.length - 1 && (
          <button onClick={handleClose} className="btn-secondary">
            Tutup
          </button>
        )}
      </div>
    </div>
  );
}

export default MigrationWizard;