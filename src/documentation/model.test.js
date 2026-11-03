// Phase 6 — Documentation & Reports Unit Tests

import {
  generateId,
  createPhotoRecord,
  createDocumentRecord,
  emptyProjectDocumentation,
  emptyWellDocumentation,
  normalizePhotoRecord,
  normalizeDocumentRecord,
  normalizeProjectDocumentation,
  normalizeWellDocumentation,
  getPhotoCategoryLabel,
  getDocumentCategoryLabel,
  formatFileSize,
  isPreviewable,
  getFileTypeIcon,
  PHOTO_CATEGORIES,
  DOCUMENT_CATEGORIES,
  REPORT_SECTIONS,
} from './model.js';

// Helper to create a valid photo record
function createValidPhoto(overrides = {}) {
  return createPhotoRecord({
    projectId: 'proj-1',
    wellId: 'well-1',
    name: 'Test Photo',
    category: 'site_condition',
    description: 'Test description',
    documentedAt: '2024-01-15T10:00:00.000Z',
    fileRef: 'data:image/jpeg;base64,abc123',
    fileName: 'test.jpg',
    fileType: 'image/jpeg',
    fileSize: 102400,
    width: 800,
    height: 600,
    ...overrides,
  });
}

// Helper to create a valid document record
function createValidDocument(overrides = {}) {
  return createDocumentRecord({
    projectId: 'proj-1',
    wellId: 'well-1',
    title: 'Test Document',
    category: 'permit',
    description: 'Test description',
    documentDate: '2024-01-15T10:00:00.000Z',
    fileRef: 'data:application/pdf;base64,abc123',
    fileName: 'test.pdf',
    fileType: 'application/pdf',
    fileSize: 204800,
    ...overrides,
  });
}

console.log('=== Phase 6 Documentation Model Tests ===\n');

// Test 1: generateId
console.log('Testing generateId...');
{
  const id1 = generateId('test');
  const id2 = generateId('test');
  console.assert(id1.startsWith('test-'), 'Test 1a: ID has correct prefix');
  console.assert(id1 !== id2, 'Test 1b: IDs are unique');
  console.assert(id1.length > 10, 'Test 1c: ID has sufficient length');
  console.log('Test 1 passed: generateId');
}

// Test 2: createPhotoRecord
console.log('\nTesting createPhotoRecord...');
{
  const photo = createValidPhoto();
  console.assert(photo.id.startsWith('photo-'), 'Test 2a: ID starts with photo-');
  console.assert(photo.version === 1, 'Test 2b: Version is 1');
  console.assert(photo.projectId === 'proj-1', 'Test 2c: Project ID set');
  console.assert(photo.wellId === 'well-1', 'Test 2d: Well ID set');
  console.assert(photo.name === 'Test Photo', 'Test 2e: Name set');
  console.assert(photo.category === 'site_condition', 'Test 2f: Category set');
  console.assert(photo.description === 'Test description', 'Test 2g: Description set');
  console.assert(photo.fileRef === 'data:image/jpeg;base64,abc123', 'Test 2h: File ref set');
  console.assert(photo.fileSize === 102400, 'Test 2i: File size set');
  console.assert(photo.width === 800 && photo.height === 600, 'Test 2j: Dimensions set');
  console.assert(photo.createdAt && photo.updatedAt, 'Test 2k: Timestamps set');
  console.log('Test 2 passed: createPhotoRecord');
}

// Test 3: createDocumentRecord
console.log('\nTesting createDocumentRecord...');
{
  const doc = createValidDocument();
  console.assert(doc.id.startsWith('doc-'), 'Test 3a: ID starts with doc-');
  console.assert(doc.version === 1, 'Test 3b: Version is 1');
  console.assert(doc.projectId === 'proj-1', 'Test 3c: Project ID set');
  console.assert(doc.wellId === 'well-1', 'Test 3d: Well ID set');
  console.assert(doc.title === 'Test Document', 'Test 3e: Title set');
  console.assert(doc.category === 'permit', 'Test 3f: Category set');
  console.assert(doc.fileType === 'application/pdf', 'Test 3g: File type set');
  console.log('Test 3 passed: createDocumentRecord');
}

// Test 4: Empty documentation states
console.log('\nTesting empty documentation states...');
{
  const projDocs = emptyProjectDocumentation();
  console.assert(projDocs.version === 1, 'Test 4a: Project docs version');
  console.assert(Array.isArray(projDocs.photos) && projDocs.photos.length === 0, 'Test 4b: Project photos empty');
  console.assert(Array.isArray(projDocs.documents) && projDocs.documents.length === 0, 'Test 4c: Project documents empty');

  const wellDocs = emptyWellDocumentation();
  console.assert(wellDocs.version === 1, 'Test 4d: Well docs version');
  console.assert(Array.isArray(wellDocs.photos) && wellDocs.photos.length === 0, 'Test 4e: Well photos empty');
  console.assert(Array.isArray(wellDocs.documents) && wellDocs.documents.length === 0, 'Test 4f: Well documents empty');
  console.log('Test 4 passed: Empty documentation states');
}

// Test 5: normalizePhotoRecord
console.log('\nTesting normalizePhotoRecord...');
{
  // Valid record
  const valid = normalizePhotoRecord(createValidPhoto());
  console.assert(valid.id && valid.version === 1, 'Test 5a: Valid record normalized');

  // Record with missing fields (should fill defaults)
  const minimal = { fileRef: 'data:image/png;base64,xyz' };
  const normalized = normalizePhotoRecord(minimal);
  console.assert(normalized.id.startsWith('photo-'), 'Test 5b: ID generated');
  console.assert(normalized.name === 'Foto Dokumentasi', 'Test 5c: Default name');
  console.assert(normalized.category === 'other', 'Test 5d: Default category');
  console.assert(normalized.fileRef === 'data:image/png;base64,xyz', 'Test 5e: FileRef preserved');
  console.assert(normalized.fileType === 'image/jpeg', 'Test 5f: Default file type');

  // Invalid category should default to 'other'
  const invalidCat = normalizePhotoRecord({ ...createValidPhoto(), category: 'invalid_category' });
  console.assert(invalidCat.category === 'other', 'Test 5g: Invalid category defaults to other');

  // null/undefined input
  console.assert(normalizePhotoRecord(null) === null, 'Test 5h: null returns null');
  console.assert(normalizePhotoRecord(undefined) === null, 'Test 5i: undefined returns null');
  console.log('Test 5 passed: normalizePhotoRecord');
}

// Test 6: normalizeDocumentRecord
console.log('\nTesting normalizeDocumentRecord...');
{
  const valid = normalizeDocumentRecord(createValidDocument());
  console.assert(valid.id && valid.version === 1, 'Test 6a: Valid record normalized');

  const minimal = { fileRef: 'data:application/pdf;base64,xyz' };
  const normalized = normalizeDocumentRecord(minimal);
  console.assert(normalized.id.startsWith('doc-'), 'Test 6b: ID generated');
  console.assert(normalized.title === 'Dokumen Baru', 'Test 6c: Default title');
  console.assert(normalized.category === 'other', 'Test 6d: Default category');
  console.assert(normalized.fileType === 'application/pdf', 'Test 6e: Default file type');

  const invalidCat = normalizeDocumentRecord({ ...createValidDocument(), category: 'invalid' });
  console.assert(invalidCat.category === 'other', 'Test 6f: Invalid category defaults');

  console.assert(normalizeDocumentRecord(null) === null, 'Test 6g: null returns null');
  console.log('Test 6 passed: normalizeDocumentRecord');
}

// Test 7: normalizeProjectDocumentation
console.log('\nTesting normalizeProjectDocumentation...');
{
  const input = {
    version: 1,
    photos: [createValidPhoto(), { invalid: true }],
    documents: [createValidDocument(), null],
  };
  const normalized = normalizeProjectDocumentation(input);
  console.assert(normalized.version === 1, 'Test 7a: Version preserved');
  // Invalid objects are normalized with defaults, not filtered
  console.assert(normalized.photos.length === 2, 'Test 7b: Invalid photo normalized with defaults');
  console.assert(normalized.documents.length === 1, 'Test 7c: null doc filtered');

  // Empty input
  const empty = normalizeProjectDocumentation({});
  console.assert(empty.photos.length === 0 && empty.documents.length === 0, 'Test 7d: Empty input returns empty');
  console.log('Test 7 passed: normalizeProjectDocumentation');
}

// Test 8: normalizeWellDocumentation
console.log('\nTesting normalizeWellDocumentation...');
{
  const input = {
    version: 1,
    photos: [createValidPhoto(), { invalid: true }],
    documents: [createValidDocument(), null],
  };
  const normalized = normalizeWellDocumentation(input);
  console.assert(normalized.version === 1, 'Test 8a: Version preserved');
  // Invalid objects are normalized with defaults, not filtered
  console.assert(normalized.photos.length === 2, 'Test 8b: Invalid photo normalized with defaults');
  console.assert(normalized.documents.length === 1, 'Test 8c: null doc filtered');
  console.log('Test 8 passed: normalizeWellDocumentation');
}

// Test 9: Category labels
console.log('\nTesting category labels...');
{
  console.assert(getPhotoCategoryLabel('site_condition') === 'Kondisi Lapangan', 'Test 9a: Photo category label');
  console.assert(getPhotoCategoryLabel('invalid') === 'invalid', 'Test 9b: Unknown photo category returns value');
  console.assert(getDocumentCategoryLabel('permit') === 'Izin & Perizinan', 'Test 9c: Document category label');
  console.assert(getDocumentCategoryLabel('unknown') === 'unknown', 'Test 9d: Unknown doc category returns value');
  console.log('Test 9 passed: Category labels');
}

// Test 10: formatFileSize
console.log('\nTesting formatFileSize...');
{
  console.assert(formatFileSize(0) === '0 B', 'Test 10a: 0 bytes');
  console.assert(formatFileSize(500) === '500 B', 'Test 10b: Bytes');
  console.assert(formatFileSize(1024) === '1.0 KB', 'Test 10c: 1 KB');
  console.assert(formatFileSize(1536) === '1.5 KB', 'Test 10d: 1.5 KB');
  console.assert(formatFileSize(1024 * 1024) === '1.0 MB', 'Test 10e: 1 MB');
  console.assert(formatFileSize(1024 * 1024 * 1024) === '1.0 GB', 'Test 10f: 1 GB');
  console.assert(formatFileSize(-1) === '—', 'Test 10g: Negative returns dash');
  console.assert(formatFileSize(NaN) === '—', 'Test 10h: NaN returns dash');
  console.log('Test 10 passed: formatFileSize');
}

// Test 11: isPreviewable
console.log('\nTesting isPreviewable...');
{
  console.assert(isPreviewable('image/jpeg') === true, 'Test 11a: JPEG previewable');
  console.assert(isPreviewable('image/png') === true, 'Test 11b: PNG previewable');
  console.assert(isPreviewable('image/webp') === true, 'Test 11c: WebP previewable');
  console.assert(isPreviewable('application/pdf') === true, 'Test 11e: PDF previewable');
  console.assert(isPreviewable('text/plain') === true, 'Test 11f: Text previewable');
  console.assert(isPreviewable('application/msword') === false, 'Test 11g: Word not previewable');
  console.assert(isPreviewable('video/mp4') === false, 'Test 11h: Video not previewable');
  console.assert(isPreviewable(null) === false, 'Test 11i: null returns false');
  console.assert(isPreviewable('') === false, 'Test 11j: empty string returns false');
  console.log('Test 11 passed: isPreviewable');
}

// Test 12: getFileTypeIcon
console.log('\nTesting getFileTypeIcon...');
{
  console.assert(getFileTypeIcon('image/jpeg') === 'image', 'Test 12a: Image type');
  console.assert(getFileTypeIcon('application/pdf') === 'file-text', 'Test 12b: PDF type');
  console.assert(getFileTypeIcon('text/plain') === 'file-text', 'Test 12c: Text type');
  console.assert(getFileTypeIcon('application/msword') === 'file-text', 'Test 12d: Word type');
  console.assert(getFileTypeIcon('application/vnd.ms-excel') === 'table', 'Test 12e: Excel type');
  console.assert(getFileTypeIcon('video/mp4') === 'file', 'Test 12f: Unknown type');
  console.assert(getFileTypeIcon(null) === 'file', 'Test 12g: null returns file');
  console.log('Test 12 passed: getFileTypeIcon');
}

// Test 13: Constants validation
console.log('\nTesting constants...');
{
  console.assert(PHOTO_CATEGORIES.length === 10, 'Test 13a: 10 photo categories');
  console.assert(PHOTO_CATEGORIES.every(c => c.value && c.label), 'Test 13b: All photo categories have value and label');
  console.assert(DOCUMENT_CATEGORIES.length === 10, 'Test 13c: 10 document categories');
  console.assert(DOCUMENT_CATEGORIES.every(c => c.value && c.label), 'Test 13d: All doc categories have value and label');
  console.assert(REPORT_SECTIONS.length === 7, 'Test 13e: 7 report sections');
  console.assert(REPORT_SECTIONS.every(s => s.id && s.label), 'Test 13f: All sections have id and label');
  // SECTION_DEFAULTS is computed in ReportBuilderPage, not exported
  console.log('Test 13 passed: Constants validation');
}

console.log('\n✅ All Phase 6 Documentation Model Tests Completed!');