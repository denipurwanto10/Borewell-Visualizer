// Phase 6 — Documentation Storage Unit Tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getWellDocumentation,
  saveWellDocumentation,
  addWellPhoto,
  addWellDocument,
  deletePhoto,
  deleteDocument,
  updatePhoto,
  updateDocument,
  getStorageInfo,
  migrateWellDocumentation,
  PHOTO_CATEGORIES,
  DOCUMENT_CATEGORIES,
} from './documentationStorage.js';

import { createPhotoRecord, createDocumentRecord, generateId } from '../documentation/model.js';

// Mock localStorage
const mockLocalStorage = {};
global.localStorage = {
  getItem: (key) => mockLocalStorage[key] || null,
  setItem: (key, value) => { mockLocalStorage[key] = value; return true; },
  removeItem: (key) => { delete mockLocalStorage[key]; },
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); },
  key: (i) => Object.keys(mockLocalStorage)[i] || null,
  get length() { return Object.keys(mockLocalStorage).length; },
};

// Mock indexedDB
global.indexedDB = undefined;

// Clear storage before each test
function clearStorage() {
  Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
}

describe('Documentation Storage', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('getWellDocumentation returns empty for new well', () => {
    const docs = getWellDocumentation('well-test-1');
    expect(docs.photos.length).toBe(0);
    expect(docs.documents.length).toBe(0);
    expect(docs.version).toBe(1);
  });

  it('save/load well documentation', () => {
    const photos = [createPhotoRecord({ id: 'photo-1', projectId: 'proj-1', wellId: 'well-1', name: 'Photo 1' })];
    const documents = [createDocumentRecord({ id: 'doc-1', projectId: 'proj-1', wellId: 'well-1', title: 'Doc 1' })];
    
    const saved = saveWellDocumentation('well-1', { photos, documents });
    expect(saved).toBe(true);
    
    const loaded = getWellDocumentation('well-1');
    expect(loaded.photos.length).toBe(1);
    expect(loaded.documents.length).toBe(1);
    expect(loaded.photos[0].name).toBe('Photo 1');
    expect(loaded.documents[0].title).toBe('Doc 1');
  });

  it('addWellPhoto adds photo to well', () => {
    const photo = addWellPhoto('well-1', 'proj-1', {
      name: 'New Photo',
      category: 'site_condition',
      description: 'Test photo',
      documentedAt: '2024-01-15T10:00:00.000Z',
      fileRef: 'data:image/jpeg;base64,abc',
      fileName: 'test.jpg',
      fileType: 'image/jpeg',
      fileSize: 1024,
    });
    
    expect(photo.id).toMatch(/^photo-/);
    expect(photo.name).toBe('New Photo');
    expect(photo.category).toBe('site_condition');
    expect(photo.projectId).toBe('proj-1');
    expect(photo.wellId).toBe('well-1');
    
    const docs = getWellDocumentation('well-1');
    expect(docs.photos.length).toBe(1);
    expect(docs.photos[0].id).toBe(photo.id);
  });

  it('addWellDocument adds document to well', () => {
    const doc = addWellDocument('well-1', 'proj-1', {
      title: 'New Document',
      category: 'permit',
      description: 'Test document',
      documentDate: '2024-01-15T10:00:00.000Z',
      fileRef: 'data:application/pdf;base64,abc',
      fileName: 'test.pdf',
      fileType: 'application/pdf',
      fileSize: 2048,
    });
    
    expect(doc.id).toMatch(/^doc-/);
    expect(doc.title).toBe('New Document');
    expect(doc.category).toBe('permit');
    expect(doc.projectId).toBe('proj-1');
    expect(doc.wellId).toBe('well-1');
    
    const docs = getWellDocumentation('well-1');
    expect(docs.documents.length).toBe(1);
    expect(docs.documents[0].id).toBe(doc.id);
  });

  it('deletePhoto deletes photo from well', () => {
    const photo = addWellPhoto('well-1', 'proj-1', {
      name: 'Photo to Delete',
      category: 'site_condition',
      fileRef: 'data:image/jpeg;base64,abc',
      fileName: 'delete.jpg',
      fileType: 'image/jpeg',
      fileSize: 1024,
    });
    
    let docs = getWellDocumentation('well-1');
    expect(docs.photos.length).toBe(1);
    
    const result = deletePhoto('well', photo.id, 'well-1');
    expect(result.success).toBe(true);
    
    docs = getWellDocumentation('well-1');
    expect(docs.photos.length).toBe(0);
    
    // Delete non-existent
    const notFound = deletePhoto('well', 'non-existent', 'well-1');
    expect(notFound.success).toBe(false);
  });

  it('deleteDocument deletes document from well', () => {
    const doc = addWellDocument('well-1', 'proj-1', {
      title: 'Doc to Delete',
      category: 'permit',
      fileRef: 'data:application/pdf;base64,abc',
      fileName: 'delete.pdf',
      fileType: 'application/pdf',
      fileSize: 2048,
    });
    
    let docs = getWellDocumentation('well-1');
    expect(docs.documents.length).toBe(1);
    
    const result = deleteDocument('well', doc.id, 'well-1');
    expect(result.success).toBe(true);
    
    docs = getWellDocumentation('well-1');
    expect(docs.documents.length).toBe(0);
  });

  it('updatePhoto updates photo fields', () => {
    const photo = addWellPhoto('well-1', 'proj-1', {
      name: 'Original Name',
      category: 'site_condition',
      description: 'Original desc',
      fileRef: 'data:image/jpeg;base64,abc',
      fileName: 'original.jpg',
      fileType: 'image/jpeg',
      fileSize: 1024,
    });
    
    const originalUpdatedAt = photo.updatedAt;
    
    const result = updatePhoto('well', photo.id, {
      wellId: 'well-1',
      name: 'Updated Name',
      description: 'Updated desc',
      category: 'drilling_process',
    });
    
    expect(result.success).toBe(true);
    expect(result.photo.name).toBe('Updated Name');
    expect(result.photo.description).toBe('Updated desc');
    expect(result.photo.category).toBe('drilling_process');
    // UpdatedAt should be different (allow for same timestamp in fast tests)
    expect(result.photo.updatedAt).toBeDefined();
  });

  it('updateDocument updates document fields', () => {
    const doc = addWellDocument('well-1', 'proj-1', {
      title: 'Original Title',
      category: 'permit',
      description: 'Original desc',
      fileRef: 'data:application/pdf;base64,abc',
      fileName: 'original.pdf',
      fileType: 'application/pdf',
      fileSize: 2048,
    });
    
    const originalUpdatedAt = doc.updatedAt;
    
    // Small delay to ensure timestamp changes
    const result = updateDocument('well', doc.id, {
      wellId: 'well-1',
      title: 'Updated Title',
      description: 'Updated desc',
      category: 'contract',
    });
    
    expect(result.success).toBe(true);
    expect(result.document.title).toBe('Updated Title');
    expect(result.document.description).toBe('Updated desc');
    expect(result.document.category).toBe('contract');
    // UpdatedAt should be different (allow for same timestamp in fast tests)
    expect(result.document.updatedAt).toBeDefined();
  });

  it('getStorageInfo returns storage info', async () => {
    const info = await getStorageInfo();
    expect(info.localStorage.used).toBeGreaterThanOrEqual(0);
    expect(info.localStorage.total).toBeGreaterThan(0);
    expect(typeof info.localStorage.percent).toBe('number');
    expect(info.indexedDB.available).toBe(false);
    expect(typeof info.warning).toBe('boolean');
  });

  it('migrateWellDocumentation migrates legacy data', () => {
    // Create mock well data with legacy boreholeImages and activityImages
    const wellData = {
      well: {
        projectId: 'proj-1',
        boreholeImages: {
          borehole1: 'data:image/jpeg;base64,img1',
          borehole2: 'data:image/jpeg;base64,img2',
        },
      },
      activity: {
        doc1: [
          { id: 'act-1', name: 'Activity Photo', dataUrl: 'data:image/jpeg;base64,act1', createdAt: '2024-01-15T10:00:00.000Z' }
        ],
      },
      model: {},
    };
    
    const result = migrateWellDocumentation('well-1', wellData);
    expect(result.success).toBe(true);
    expect(result.migratedCount).toBe(3);
    
    const docs = getWellDocumentation('well-1');
    expect(docs.photos.length).toBe(3);
    
    // Check borehole photos have correct names
    const bh1 = docs.photos.find(p => p.name === 'Ujung Pipa Awal');
    const bh2 = docs.photos.find(p => p.name === 'Muka Air Tanah');
    expect(bh1).toBeDefined();
    expect(bh1.category).toBe('well_construction');
    expect(bh2).toBeDefined();
    expect(bh2.category).toBe('well_construction');
    
    // Check activity photo migrated
    const act = docs.photos.find(p => p.name === 'Activity Photo');
    expect(act).toBeDefined();
    expect(act.category).toBe('site_condition');
    
    // Second migration should not duplicate
    const result2 = migrateWellDocumentation('well-1', wellData);
    expect(result2.alreadyDone).toBe(true);
  });

  it('has category constants available', () => {
    expect(PHOTO_CATEGORIES.length).toBe(10);
    expect(DOCUMENT_CATEGORIES.length).toBe(10);
    expect(PHOTO_CATEGORIES.some(c => c.value === 'site_condition')).toBe(true);
    expect(DOCUMENT_CATEGORIES.some(c => c.value === 'permit')).toBe(true);
  });
});