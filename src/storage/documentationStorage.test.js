// Phase 6 — Documentation Storage Unit Tests

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

console.log('=== Phase 6 Documentation Storage Tests ===\n');

// Clear storage before each test
function clearStorage() {
  Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
}

// Test 1: Empty well documentation
console.log('Testing getWellDocumentation (empty)...');
{
  clearStorage();
  const docs = getWellDocumentation('well-test-1');
  console.assert(docs.photos.length === 0, 'Test 1a: No photos');
  console.assert(docs.documents.length === 0, 'Test 1b: No documents');
  console.assert(docs.version === 1, 'Test 1c: Version 1');
  console.log('Test 1 passed: Empty well documentation');
}

// Test 2: Save and load well documentation
console.log('\nTesting save/load well documentation...');
{
  clearStorage();
  const photos = [createPhotoRecord({ id: 'photo-1', projectId: 'proj-1', wellId: 'well-1', name: 'Photo 1' })];
  const documents = [createDocumentRecord({ id: 'doc-1', projectId: 'proj-1', wellId: 'well-1', title: 'Doc 1' })];
  
  const saved = saveWellDocumentation('well-1', { photos, documents });
  console.assert(saved === true, 'Test 2a: Save returns true');
  
  const loaded = getWellDocumentation('well-1');
  console.assert(loaded.photos.length === 1, 'Test 2b: Photo loaded');
  console.assert(loaded.documents.length === 1, 'Test 2c: Document loaded');
  console.assert(loaded.photos[0].name === 'Photo 1', 'Test 2d: Photo name correct');
  console.assert(loaded.documents[0].title === 'Doc 1', 'Test 2e: Document title correct');
  console.log('Test 2 passed: Save/load well documentation');
}

// Test 3: Add photo to well
console.log('\nTesting addWellPhoto...');
{
  clearStorage();
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
  
  console.assert(photo.id.startsWith('photo-'), 'Test 3a: Photo ID generated');
  console.assert(photo.name === 'New Photo', 'Test 3b: Name set');
  console.assert(photo.category === 'site_condition', 'Test 3c: Category set');
  console.assert(photo.projectId === 'proj-1', 'Test 3d: Project ID set');
  console.assert(photo.wellId === 'well-1', 'Test 3e: Well ID set');
  
  const docs = getWellDocumentation('well-1');
  console.assert(docs.photos.length === 1, 'Test 3f: Photo in storage');
  console.assert(docs.photos[0].id === photo.id, 'Test 3g: Correct photo stored');
  console.log('Test 3 passed: addWellPhoto');
}

// Test 4: Add document to well
console.log('\nTesting addWellDocument...');
{
  clearStorage();
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
  
  console.assert(doc.id.startsWith('doc-'), 'Test 4a: Document ID generated');
  console.assert(doc.title === 'New Document', 'Test 4b: Title set');
  console.assert(doc.category === 'permit', 'Test 4c: Category set');
  console.assert(doc.projectId === 'proj-1', 'Test 4d: Project ID set');
  console.assert(doc.wellId === 'well-1', 'Test 4e: Well ID set');
  
  const docs = getWellDocumentation('well-1');
  console.assert(docs.documents.length === 1, 'Test 4f: Document in storage');
  console.assert(docs.documents[0].id === doc.id, 'Test 4g: Correct document stored');
  console.log('Test 4 passed: addWellDocument');
}

// Test 5: Delete photo
console.log('\nTesting deletePhoto...');
{
  clearStorage();
  const photo = addWellPhoto('well-1', 'proj-1', {
    name: 'Photo to Delete',
    category: 'site_condition',
    fileRef: 'data:image/jpeg;base64,abc',
    fileName: 'delete.jpg',
    fileType: 'image/jpeg',
    fileSize: 1024,
  });
  
  let docs = getWellDocumentation('well-1');
  console.assert(docs.photos.length === 1, 'Test 5a: Photo added');
  
  const result = deletePhoto('well', photo.id, 'well-1');
  console.assert(result.success === true, 'Test 5b: Delete returns success');
  
  docs = getWellDocumentation('well-1');
  console.assert(docs.photos.length === 0, 'Test 5c: Photo deleted');
  
  // Delete non-existent
  const notFound = deletePhoto('well', 'non-existent', 'well-1');
  console.assert(notFound.success === false, 'Test 5d: Non-existent returns false');
  console.log('Test 5 passed: deletePhoto');
}

// Test 6: Delete document
console.log('\nTesting deleteDocument...');
{
  clearStorage();
  const doc = addWellDocument('well-1', 'proj-1', {
    title: 'Doc to Delete',
    category: 'permit',
    fileRef: 'data:application/pdf;base64,abc',
    fileName: 'delete.pdf',
    fileType: 'application/pdf',
    fileSize: 2048,
  });
  
  let docs = getWellDocumentation('well-1');
  console.assert(docs.documents.length === 1, 'Test 6a: Document added');
  
  const result = deleteDocument('well', doc.id, 'well-1');
  console.assert(result.success === true, 'Test 6b: Delete returns success');
  
  docs = getWellDocumentation('well-1');
  console.assert(docs.documents.length === 0, 'Test 6c: Document deleted');
  console.log('Test 6 passed: deleteDocument');
}

// Test 7: Update photo
console.log('\nTesting updatePhoto...');
{
  clearStorage();
  const photo = addWellPhoto('well-1', 'proj-1', {
    name: 'Original Name',
    category: 'site_condition',
    description: 'Original desc',
    fileRef: 'data:image/jpeg;base64,abc',
    fileName: 'original.jpg',
    fileType: 'image/jpeg',
    fileSize: 1024,
  });
  
  const result = updatePhoto('well', photo.id, {
    wellId: 'well-1',
    name: 'Updated Name',
    description: 'Updated desc',
    category: 'drilling_process',
  });
  
  console.assert(result.success === true, 'Test 7a: Update returns success');
  console.assert(result.photo.name === 'Updated Name', 'Test 7b: Name updated');
  console.assert(result.photo.description === 'Updated desc', 'Test 7c: Description updated');
  console.assert(result.photo.category === 'drilling_process', 'Test 7d: Category updated');
  console.assert(result.photo.updatedAt !== photo.updatedAt, 'Test 7e: UpdatedAt changed');
  console.log('Test 7 passed: updatePhoto');
}

// Test 8: Update document
console.log('\nTesting updateDocument...');
{
  clearStorage();
  const doc = addWellDocument('well-1', 'proj-1', {
    title: 'Original Title',
    category: 'permit',
    description: 'Original desc',
    fileRef: 'data:application/pdf;base64,abc',
    fileName: 'original.pdf',
    fileType: 'application/pdf',
    fileSize: 2048,
  });
  
  const result = updateDocument('well', doc.id, {
    wellId: 'well-1',
    title: 'Updated Title',
    description: 'Updated desc',
    category: 'contract',
  });
  
  console.assert(result.success === true, 'Test 8a: Update returns success');
  console.assert(result.document.title === 'Updated Title', 'Test 8b: Title updated');
  console.assert(result.document.description === 'Updated desc', 'Test 8c: Description updated');
  console.assert(result.document.category === 'contract', 'Test 8d: Category updated');
  console.assert(result.document.updatedAt !== doc.updatedAt, 'Test 8e: UpdatedAt changed');
  console.log('Test 8 passed: updateDocument');
}

// Test 9: getStorageInfo
console.log('\nTesting getStorageInfo...');
{
  clearStorage();
  const info = await getStorageInfo();
  console.assert(info.localStorage.used >= 0, 'Test 9a: localStorage used is number');
  console.assert(info.localStorage.total > 0, 'Test 9b: localStorage total is number');
  console.assert(typeof info.localStorage.percent === 'number', 'Test 9c: Percent is number');
  console.assert(info.indexedDB.available === false, 'Test 9d: indexedDB not available in test');
  console.assert(typeof info.warning === 'boolean', 'Test 9e: Warning is boolean');
  console.log('Test 9 passed: getStorageInfo');
}

// Test 10: Migration
console.log('\nTesting migrateWellDocumentation...');
{
  clearStorage();
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
  console.assert(result.success === true, 'Test 10a: Migration returns success');
  console.assert(result.migratedCount === 3, 'Test 10b: 3 photos migrated (2 borehole + 1 activity)');
  
  const docs = getWellDocumentation('well-1');
  console.assert(docs.photos.length === 3, 'Test 10c: 3 photos in storage');
  
  // Check borehole photos have correct names
  const bh1 = docs.photos.find(p => p.name === 'Ujung Pipa Awal');
  const bh2 = docs.photos.find(p => p.name === 'Muka Air Tanah');
  console.assert(bh1 && bh1.category === 'well_construction', 'Test 10d: Borehole 1 migrated correctly');
  console.assert(bh2 && bh2.category === 'well_construction', 'Test 10e: Borehole 2 migrated correctly');
  
  // Check activity photo migrated
  const act = docs.photos.find(p => p.name === 'Activity Photo');
  console.assert(act && act.category === 'site_condition', 'Test 10f: Activity photo migrated correctly');
  
  // Second migration should not duplicate
  const result2 = migrateWellDocumentation('well-1', wellData);
  console.assert(result2.alreadyDone === true, 'Test 10g: Second migration returns alreadyDone');
  console.log('Test 10 passed: migrateWellDocumentation');
}

// Test 11: Category constants available
console.log('\nTesting category constants...');
{
  console.assert(PHOTO_CATEGORIES.length === 10, 'Test 11a: 10 photo categories');
  console.assert(DOCUMENT_CATEGORIES.length === 10, 'Test 11b: 10 document categories');
  console.assert(PHOTO_CATEGORIES.some(c => c.value === 'site_condition'), 'Test 11c: site_condition exists');
  console.assert(DOCUMENT_CATEGORIES.some(c => c.value === 'permit'), 'Test 11d: permit exists');
  console.log('Test 11 passed: Category constants');
}

console.log('\n✅ All Phase 6 Documentation Storage Tests Completed!');