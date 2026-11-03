// Phase 6 — Documentation Storage
// Handles project-level and well-level documentation storage with LocalStorage/IndexedDB

import {
  normalizeProjectDocumentation,
  normalizeWellDocumentation,
  createPhotoRecord,
  createDocumentRecord,
  emptyProjectDocumentation,
  emptyWellDocumentation,
  generateId,
  formatFileSize,
  isPreviewable,
  getFileTypeIcon,
  getPhotoCategoryLabel,
  getDocumentCategoryLabel,
} from '../documentation/model.js';

const PROJECT_DOCS_KEY = 'borewell-project-docs:v1';
const WELL_DOCS_PREFIX = 'borewell-well-docs-';
const WELL_DOCS_SUFFIX = ':v1';

// IndexedDB for large binary files (photos, documents)
const DB_NAME = 'BorewellDocsDB';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
const DOCUMENT_STORE = 'documents';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null); // Fail gracefully
  });
  return dbPromise;
}

function storeFileInDB(storeName, record) {
  return openDB().then(db => {
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  });
}

function getFileFromDB(storeName, id) {
  return openDB().then(db => {
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  });
}

function deleteFileFromDB(storeName, id) {
  return openDB().then(db => {
    if (!db) return Promise.resolve(false);
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  });
}

// LocalStorage helpers
export function getProjectDocsData() {
  try {
    const data = localStorage.getItem(PROJECT_DOCS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function saveProjectDocsData(data) {
  try {
    localStorage.setItem(PROJECT_DOCS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Failed to save project docs:', e);
    return false;
  }
}

function getWellDocsKey(wellId) {
  return `${WELL_DOCS_PREFIX}${wellId}${WELL_DOCS_SUFFIX}`;
}

export function getWellDocsData(wellId) {
  try {
    const data = localStorage.getItem(getWellDocsKey(wellId));
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveWellDocsData(wellId, data) {
  try {
    localStorage.setItem(getWellDocsKey(wellId), JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Failed to save well docs:', e);
    return false;
  }
}

// Migration: move existing activity images (borehole images) to new documentation system
function migrateLegacyActivityImages(wellId, wellData) {
  const existing = getWellDocsData(wellId);
  if (existing && existing.version) return { success: true, alreadyDone: true }; // Already migrated

  const activity = wellData?.activity || {};
  const boreholeImages = wellData?.well?.boreholeImages || {};

  const photos = [];
  const now = new Date().toISOString();

  // Migrate borehole images (5 fixed positions)
  Object.entries(boreholeImages).forEach(([key, dataUrl]) => {
    if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      const index = parseInt(key.replace('borehole', ''), 10);
      const names = {
        1: 'Ujung Pipa Awal',
        2: 'Muka Air Tanah',
        3: 'Batas Pipa',
        4: 'Screen Perforasi',
        5: 'Dasar Sumur Bor',
      };
      photos.push(createPhotoRecord({
        id: generateId('photo-mig'),
        projectId: wellData.well?.projectId || '',
        wellId,
        name: names[index] || `Gambar Borehole ${index}`,
        category: 'well_construction',
        description: `Foto migrasi: ${names[index] || key}`,
        documentedAt: now,
        fileRef: dataUrl,
        fileName: `borehole-${index}.jpg`,
        fileType: 'image/jpeg',
        fileSize: Math.round(dataUrl.length * 0.75), // Approximate
        createdAt: now,
        updatedAt: now,
      }));
    }
  });

  // Migrate activity images (6 categories, max 3 each)
  const activityCategories = {
    doc1: 'site_condition',
    doc2: 'well_construction',
    doc3: 'drilling_process',
    doc4: 'drilling_process',
    doc5: 'casing_installation',
    doc6: 'pump_installation',
  };

  Object.entries(activity).forEach(([key, items]) => {
    if (Array.isArray(items)) {
      items.forEach((item, idx) => {
        if (item?.dataUrl && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:')) {
          photos.push(createPhotoRecord({
            id: item.id || generateId('photo-mig'),
            projectId: wellData.well?.projectId || '',
            wellId,
            name: item.name || `Foto ${idx + 1}`,
            category: activityCategories[key] || 'other',
            description: item.description || `Foto migrasi dari kategori ${key}`,
            documentedAt: item.createdAt || now,
            fileRef: item.dataUrl,
            fileName: item.fileName || `activity-${key}-${idx}.jpg`,
            fileType: item.fileType || 'image/jpeg',
            fileSize: Math.round(item.dataUrl.length * 0.75),
            createdAt: item.createdAt || now,
            updatedAt: now,
          }));
        }
      });
    }
  });

  if (photos.length > 0) {
    const wellDocs = emptyWellDocumentation();
    wellDocs.photos = photos;
    saveWellDocsData(wellId, wellDocs);
  }

  return { success: true, migratedCount: photos.length };
}

// --- Public API ---

// Get project-level documentation
export function getProjectDocumentation(projectId) {
  const allData = getProjectDocsData();
  return allData[projectId] ? normalizeProjectDocumentation(allData[projectId]) : emptyProjectDocumentation();
}

// Save project-level documentation
export function saveProjectDocumentation(projectId, { photos, documents }) {
  const allData = getProjectDocsData();
  allData[projectId] = normalizeProjectDocumentation({ photos, documents });
  return saveProjectDocsData(allData);
}

// Get well-level documentation
export function getWellDocumentation(wellId) {
  const data = getWellDocsData(wellId);
  return data ? normalizeWellDocumentation(data) : emptyWellDocumentation();
}

// Save well-level documentation
export function saveWellDocumentation(wellId, { photos, documents }) {
  const data = normalizeWellDocumentation({ photos, documents });
  return saveWellDocsData(wellId, data);
}

// Add a photo to project documentation
export function addProjectPhoto(projectId, photoData) {
  const docs = getProjectDocumentation(projectId);
  const photo = createPhotoRecord({ ...photoData, projectId });
  docs.photos.unshift(photo); // Newest first
  saveProjectDocumentation(projectId, docs);
  return photo;
}

// Add a photo to well documentation
export function addWellPhoto(wellId, projectId, photoData) {
  const docs = getWellDocumentation(wellId);
  const photo = createPhotoRecord({ ...photoData, projectId, wellId });
  docs.photos.unshift(photo);
  saveWellDocumentation(wellId, docs);
  return photo;
}

// Add a document to project documentation
export function addProjectDocument(projectId, docData) {
  const docs = getProjectDocumentation(projectId);
  const doc = createDocumentRecord({ ...docData, projectId, wellId: '' });
  docs.documents.unshift(doc);
  saveProjectDocumentation(projectId, docs);
  return doc;
}

// Add a document to well documentation
export function addWellDocument(wellId, projectId, docData) {
  const docs = getWellDocumentation(wellId);
  const doc = createDocumentRecord({ ...docData, projectId, wellId });
  docs.documents.unshift(doc);
  saveWellDocumentation(wellId, docs);
  return doc;
}

// Update a photo (project or well)
export function updatePhoto(scope, id, updates) {
  if (scope === 'project') {
    // Need projectId - would need to be passed or looked up
    return { success: false, error: 'Project scope requires projectId' };
  }
  if (scope === 'well') {
    const docs = getWellDocumentation(updates.wellId || '');
    const idx = docs.photos.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: 'Photo not found' };
    docs.photos[idx] = { ...docs.photos[idx], ...updates, updatedAt: new Date().toISOString() };
    saveWellDocumentation(updates.wellId, docs);
    return { success: true, photo: docs.photos[idx] };
  }
  return { success: false };
}

// Update a document
export function updateDocument(scope, id, updates) {
  if (scope === 'project') {
    return { success: false, error: 'Project scope requires projectId' };
  }
  if (scope === 'well') {
    const docs = getWellDocumentation(updates.wellId || '');
    const idx = docs.documents.findIndex(d => d.id === id);
    if (idx === -1) return { success: false, error: 'Document not found' };
    docs.documents[idx] = { ...docs.documents[idx], ...updates, updatedAt: new Date().toISOString() };
    saveWellDocumentation(updates.wellId, docs);
    return { success: true, document: docs.documents[idx] };
  }
  return { success: false };
}

// Delete a photo
export function deletePhoto(scope, id, contextId) {
  if (scope === 'project') {
    const docs = getProjectDocumentation(contextId);
    const idx = docs.photos.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: 'Photo not found' };
    const photo = docs.photos[idx];
    docs.photos.splice(idx, 1);
    saveProjectDocumentation(contextId, docs);
    // Clean up IndexedDB if used
    if (photo.fileRef && !photo.fileRef.startsWith('data:')) {
      deleteFileFromDB(PHOTO_STORE, photo.id);
    }
    return { success: true };
  }
  if (scope === 'well') {
    const docs = getWellDocumentation(contextId);
    const idx = docs.photos.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: 'Photo not found' };
    const photo = docs.photos[idx];
    docs.photos.splice(idx, 1);
    saveWellDocumentation(contextId, docs);
    if (photo.fileRef && !photo.fileRef.startsWith('data:')) {
      deleteFileFromDB(PHOTO_STORE, photo.id);
    }
    return { success: true };
  }
  return { success: false };
}

// Delete a document
export function deleteDocument(scope, id, contextId) {
  if (scope === 'project') {
    const docs = getProjectDocumentation(contextId);
    const idx = docs.documents.findIndex(d => d.id === id);
    if (idx === -1) return { success: false, error: 'Document not found' };
    const doc = docs.documents[idx];
    docs.documents.splice(idx, 1);
    saveProjectDocumentation(contextId, docs);
    if (doc.fileRef && !doc.fileRef.startsWith('data:')) {
      deleteFileFromDB(DOCUMENT_STORE, doc.id);
    }
    return { success: true };
  }
  if (scope === 'well') {
    const docs = getWellDocumentation(contextId);
    const idx = docs.documents.findIndex(d => d.id === id);
    if (idx === -1) return { success: false, error: 'Document not found' };
    const doc = docs.documents[idx];
    docs.documents.splice(idx, 1);
    saveWellDocumentation(contextId, docs);
    if (doc.fileRef && !doc.fileRef.startsWith('data:')) {
      deleteFileFromDB(DOCUMENT_STORE, doc.id);
    }
    return { success: true };
  }
  return { success: false };
}

// Store large file in IndexedDB and return reference
export async function storeLargeFile(file, type) {
  const id = generateId(type === 'photo' ? 'photo' : 'doc');
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
  const dataUrl = `data:${file.type};base64,${base64}`;

  const record = {
    id,
    dataUrl,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    createdAt: new Date().toISOString(),
  };

  const stored = await storeFileInDB(type === 'photo' ? PHOTO_STORE : DOCUMENT_STORE, record);
  if (!stored) {
    // Fallback: return data URL directly if IndexedDB fails
    return { id, fileRef: dataUrl, storedInDB: false };
  }
  return { id, fileRef: `indexeddb:${type}:${id}`, storedInDB: true };
}

// Retrieve file from IndexedDB
export async function retrieveFile(fileRef) {
  if (!fileRef || !fileRef.startsWith('indexeddb:')) return fileRef;
  const [, type, id] = fileRef.split(':');
  const storeName = type === 'photo' ? PHOTO_STORE : DOCUMENT_STORE;
  const record = await getFileFromDB(storeName, id);
  return record?.dataUrl || null;
}

// Check storage quota and usage
export async function getStorageInfo() {
  let localStorageUsed = 0;
  let localStorageTotal = 0;

  try {
    // Estimate localStorage usage
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('borewell-')) {
        localStorageUsed += localStorage.getItem(key).length;
      }
    }
    // Estimate total (typically 5-10MB)
    localStorageTotal = 5 * 1024 * 1024; // 5MB estimate
  } catch {}

  let indexedDBAvailable = false;
  let indexedDBUsed = 0;

  try {
    if (typeof indexedDB !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      indexedDBAvailable = true;
      indexedDBUsed = estimate.usage || 0;
    }
  } catch {}

  return {
    localStorage: {
      used: localStorageUsed,
      total: localStorageTotal,
      percent: localStorageTotal > 0 ? Math.round((localStorageUsed / localStorageTotal) * 100) : 0,
    },
    indexedDB: {
      available: indexedDBAvailable,
      used: indexedDBUsed,
    },
    warning: localStorageUsed > localStorageTotal * 0.8,
  };
}

// Migrate legacy data for a well
export function migrateWellDocumentation(wellId, wellData) {
  return migrateLegacyActivityImages(wellId, wellData);
}

// Initialize documentation storage (run migration)
export function initializeDocumentationStorage() {
  // Migration is handled per-well when first accessed
  return { success: true };
}

// Re-export utilities from model for convenience
export { formatFileSize, isPreviewable, getFileTypeIcon, getPhotoCategoryLabel, getDocumentCategoryLabel, PHOTO_CATEGORIES, DOCUMENT_CATEGORIES, REPORT_SECTIONS } from '../documentation/model.js';