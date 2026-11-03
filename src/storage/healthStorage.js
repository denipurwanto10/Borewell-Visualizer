// Phase 7 — Storage Health Monitor
// Tracks LocalStorage and IndexedDB usage, quotas, and provides warnings

import { getAllProjects, getWellData, getWellsForProject } from './projectStorage.js';
import { getProjectDocumentation, getWellDocumentation, getProjectDocsData, getWellDocsData } from './documentationStorage.js';

export async function getStorageHealth() {
  const health = {
    localStorage: await getLocalStorageHealth(),
    indexedDB: await getIndexedDBHealth(),
    dataCounts: await getDataCounts(),
    totalEstimatedSize: 0,
    warnings: [],
    timestamp: new Date().toISOString(),
  };

  health.totalEstimatedSize = health.localStorage.used + health.indexedDB.used;

  // Generate warnings
  if (health.localStorage.percent > 80) {
    health.warnings.push({
      type: 'localStorage',
      level: 'critical',
      message: `LocalStorage usage at ${health.localStorage.percent}% (${formatBytes(health.localStorage.used)} / ${formatBytes(health.localStorage.quota)})`,
    });
  } else if (health.localStorage.percent > 60) {
    health.warnings.push({
      type: 'localStorage',
      level: 'warning',
      message: `LocalStorage usage at ${health.localStorage.percent}%`,
    });
  }

  if (health.indexedDB.available && health.indexedDB.percent > 80) {
    health.warnings.push({
      type: 'indexedDB',
      level: 'critical',
      message: `IndexedDB usage at ${health.indexedDB.percent}% (${formatBytes(health.indexedDB.used)} / ${formatBytes(health.indexedDB.quota)})`,
    });
  } else if (health.indexedDB.available && health.indexedDB.percent > 60) {
    health.warnings.push({
      type: 'indexedDB',
      level: 'warning',
      message: `IndexedDB usage at ${health.indexedDB.percent}%`,
    });
  }

  if (!health.indexedDB.available) {
    health.warnings.push({
      type: 'indexedDB',
      level: 'info',
      message: 'IndexedDB quota estimation not available in this browser',
    });
  }

  return health;
}

async function getLocalStorageHealth() {
  let used = 0;
  let borewellUsed = 0;
  const keyCount = localStorage.length;
  const borewellKeys = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      const size = value ? new Blob([value]).size : 0;
      used += size;
      if (key.startsWith('borewell-') || key === 'wellData' || key === 'visualisasi-pipa-sumur-bor:v2') {
        borewellUsed += size;
        borewellKeys.push({ key, size });
      }
    }
  }

  // Browser quota is typically 5-10MB per origin, but varies
  // Use a conservative estimate of 5MB if quota API not available
  let quota = 5 * 1024 * 1024; // 5MB default
  let percent = quota > 0 ? Math.round((used / quota) * 100) : 0;

  // Try to get actual quota if available
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota) {
        quota = estimate.quota;
        percent = Math.round((used / quota) * 100);
      }
    } catch {
      // Fallback to default
    }
  }

  return {
    available: true,
    used,
    borewellUsed,
    quota,
    percent,
    keyCount,
    borewellKeyCount: borewellKeys.length,
    borewellKeys,
    // Breakdown by category
    breakdown: {
      projects: borewellKeys.filter(k => k.key.startsWith('borewell-projects') || k.key.startsWith('borewell-project-')).reduce((s, k) => s + k.size, 0),
      wells: borewellKeys.filter(k => k.key.startsWith('borewell-well-') && !k.key.includes('docs')).reduce((s, k) => s + k.size, 0),
      documentation: borewellKeys.filter(k => k.key.includes('docs')).reduce((s, k) => s + k.size, 0),
      legacy: borewellKeys.filter(k => k.key === 'wellData' || k.key === 'visualisasi-pipa-sumur-bor:v2' || k.key.endsWith('.backup')).reduce((s, k) => s + k.size, 0),
      other: borewellKeys.filter(k => !k.key.startsWith('borewell-project') && !k.key.startsWith('borewell-well') && !k.key.includes('docs') && k.key !== 'wellData' && k.key !== 'visualisasi-pipa-sumur-bor:v2' && !k.key.endsWith('.backup')).reduce((s, k) => s + k.size, 0),
    },
  };
}

async function getIndexedDBHealth() {
  if (typeof indexedDB === 'undefined') {
    return {
      available: false,
      used: 0,
      quota: 0,
      percent: 0,
      photoCount: 0,
      documentCount: 0,
      photoSize: 0,
      documentSize: 0,
    };
  }

  let used = 0;
  let photoCount = 0;
  let documentCount = 0;
  let photoSize = 0;
  let documentSize = 0;

  try {
    const db = await openDocsDB();
    if (!db) {
      return { available: false, used: 0, quota: 0, percent: 0, photoCount: 0, documentCount: 0, photoSize: 0, documentSize: 0 };
    }

    // Get all records and estimate size
    const photos = await getAllFromStore(db, 'photos');
    const documents = await getAllFromStore(db, 'documents');

    photoCount = photos.length;
    documentCount = documents.length;

    for (const photo of photos) {
      if (photo.dataUrl) {
        const size = estimateDataUrlSize(photo.dataUrl);
        photoSize += size;
        used += size;
      }
    }

    for (const doc of documents) {
      if (doc.dataUrl) {
        const size = estimateDataUrlSize(doc.dataUrl);
        documentSize += size;
        used += size;
      }
    }
  } catch (e) {
    console.warn('Failed to get IndexedDB health:', e);
  }

  // Get quota from Storage API
  let quota = 0;
  let percent = 0;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quota = estimate.quota || 0;
      used = estimate.usage || used;
      percent = quota > 0 ? Math.round((used / quota) * 100) : 0;
    } catch {
      // Quota not available
    }
  }

  return {
    available: true,
    used,
    quota,
    percent,
    photoCount,
    documentCount,
    photoSize,
    documentSize,
  };
}

function estimateDataUrlSize(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return 0;
  const base64 = dataUrl.split(',')[1] || '';
  // Base64 is ~33% overhead, so actual binary size is ~75% of base64 length
  return Math.round(base64.length * 0.75);
}

async function getDataCounts() {
  const projects = getAllProjects();
  let wellCount = 0;
  let photoCount = 0;
  let documentCount = 0;
  let totalPhotoSize = 0;
  let totalDocumentSize = 0;

  for (const project of projects) {
    const wells = getWellsForProject(project.id);
    wellCount += wells.length;

    const projectDocs = getProjectDocumentation(project.id);
    photoCount += projectDocs.photos?.length || 0;
    documentCount += projectDocs.documents?.length || 0;
    totalPhotoSize += projectDocs.photos?.reduce((s, p) => s + (p.fileSize || 0), 0) || 0;
    totalDocumentSize += projectDocs.documents?.reduce((s, d) => s + (d.fileSize || 0), 0) || 0;

    for (const well of wells) {
      const wellDocs = getWellDocumentation(well.id);
      photoCount += wellDocs.photos?.length || 0;
      documentCount += wellDocs.documents?.length || 0;
      totalPhotoSize += wellDocs.photos?.reduce((s, p) => s + (p.fileSize || 0), 0) || 0;
      totalDocumentSize += wellDocs.documents?.reduce((s, d) => s + (d.fileSize || 0), 0) || 0;
    }
  }

  return {
    projectCount: projects.length,
    wellCount,
    photoCount,
    documentCount,
    totalPhotoSize,
    totalDocumentSize,
    totalFileSize: totalPhotoSize + totalDocumentSize,
  };
}

function openDocsDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open('BorewellDocsDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Export formatBytes for UI use
export { formatBytes };