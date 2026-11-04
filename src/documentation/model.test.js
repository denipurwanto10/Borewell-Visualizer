// Phase 6 — Documentation & Reports Unit Tests

import { describe, it, expect } from 'vitest';
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

describe('generateId', () => {
  it('generates unique IDs with correct prefix', () => {
    const id1 = generateId('test');
    const id2 = generateId('test');
    expect(id1).toMatch(/^test-/);
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(10);
  });
});

describe('createPhotoRecord', () => {
  it('creates a valid photo record with all fields', () => {
    const photo = createValidPhoto();
    expect(photo.id).toMatch(/^photo-/);
    expect(photo.version).toBe(1);
    expect(photo.projectId).toBe('proj-1');
    expect(photo.wellId).toBe('well-1');
    expect(photo.name).toBe('Test Photo');
    expect(photo.category).toBe('site_condition');
    expect(photo.description).toBe('Test description');
    expect(photo.fileRef).toBe('data:image/jpeg;base64,abc123');
    expect(photo.fileSize).toBe(102400);
    expect(photo.width).toBe(800);
    expect(photo.height).toBe(600);
    expect(photo.createdAt).toBeDefined();
    expect(photo.updatedAt).toBeDefined();
  });
});

describe('createDocumentRecord', () => {
  it('creates a valid document record with all fields', () => {
    const doc = createValidDocument();
    expect(doc.id).toMatch(/^doc-/);
    expect(doc.version).toBe(1);
    expect(doc.projectId).toBe('proj-1');
    expect(doc.wellId).toBe('well-1');
    expect(doc.title).toBe('Test Document');
    expect(doc.category).toBe('permit');
    expect(doc.fileType).toBe('application/pdf');
  });
});

describe('empty documentation states', () => {
  it('returns empty project documentation', () => {
    const projDocs = emptyProjectDocumentation();
    expect(projDocs.version).toBe(1);
    expect(projDocs.photos).toEqual([]);
    expect(projDocs.documents).toEqual([]);
  });

  it('returns empty well documentation', () => {
    const wellDocs = emptyWellDocumentation();
    expect(wellDocs.version).toBe(1);
    expect(wellDocs.photos).toEqual([]);
    expect(wellDocs.documents).toEqual([]);
  });
});

describe('normalizePhotoRecord', () => {
  it('normalizes a valid record', () => {
    const valid = normalizePhotoRecord(createValidPhoto());
    expect(valid.id).toBeDefined();
    expect(valid.version).toBe(1);
  });

  it('fills defaults for minimal record', () => {
    const minimal = { fileRef: 'data:image/png;base64,xyz' };
    const normalized = normalizePhotoRecord(minimal);
    expect(normalized.id).toMatch(/^photo-/);
    expect(normalized.name).toBe('Foto Dokumentasi');
    expect(normalized.category).toBe('other');
    expect(normalized.fileRef).toBe('data:image/png;base64,xyz');
    expect(normalized.fileType).toBe('image/jpeg');
  });

  it('defaults invalid category to other', () => {
    const invalidCat = normalizePhotoRecord({ ...createValidPhoto(), category: 'invalid_category' });
    expect(invalidCat.category).toBe('other');
  });

  it('returns null for null/undefined input', () => {
    expect(normalizePhotoRecord(null)).toBeNull();
    expect(normalizePhotoRecord(undefined)).toBeNull();
  });
});

describe('normalizeDocumentRecord', () => {
  it('normalizes a valid record', () => {
    const valid = normalizeDocumentRecord(createValidDocument());
    expect(valid.id).toBeDefined();
    expect(valid.version).toBe(1);
  });

  it('fills defaults for minimal record', () => {
    const minimal = { fileRef: 'data:application/pdf;base64,xyz' };
    const normalized = normalizeDocumentRecord(minimal);
    expect(normalized.id).toMatch(/^doc-/);
    expect(normalized.title).toBe('Dokumen Baru');
    expect(normalized.category).toBe('other');
    expect(normalized.fileType).toBe('application/pdf');
  });

  it('defaults invalid category to other', () => {
    const invalidCat = normalizeDocumentRecord({ ...createValidDocument(), category: 'invalid' });
    expect(invalidCat.category).toBe('other');
  });

  it('returns null for null input', () => {
    expect(normalizeDocumentRecord(null)).toBeNull();
  });
});

describe('normalizeProjectDocumentation', () => {
  it('normalizes project documentation', () => {
    const input = {
      version: 1,
      photos: [createValidPhoto(), { invalid: true }],
      documents: [createValidDocument(), null],
    };
    const normalized = normalizeProjectDocumentation(input);
    expect(normalized.version).toBe(1);
    // Invalid objects are normalized with defaults, not filtered
    expect(normalized.photos.length).toBe(2);
    expect(normalized.documents.length).toBe(1);
  });

  it('returns empty for empty input', () => {
    const empty = normalizeProjectDocumentation({});
    expect(empty.photos.length).toBe(0);
    expect(empty.documents.length).toBe(0);
  });
});

describe('normalizeWellDocumentation', () => {
  it('normalizes well documentation', () => {
    const input = {
      version: 1,
      photos: [createValidPhoto(), { invalid: true }],
      documents: [createValidDocument(), null],
    };
    const normalized = normalizeWellDocumentation(input);
    expect(normalized.version).toBe(1);
    expect(normalized.photos.length).toBe(2);
    expect(normalized.documents.length).toBe(1);
  });
});

describe('Category labels', () => {
  it('returns correct photo category labels', () => {
    expect(getPhotoCategoryLabel('site_condition')).toBe('Kondisi Lapangan');
    expect(getPhotoCategoryLabel('invalid')).toBe('invalid');
  });

  it('returns correct document category labels', () => {
    expect(getDocumentCategoryLabel('permit')).toBe('Izin & Perizinan');
    expect(getDocumentCategoryLabel('unknown')).toBe('unknown');
  });
});

describe('formatFileSize', () => {
  it('formats file sizes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatFileSize(-1)).toBe('—');
    expect(formatFileSize(NaN)).toBe('—');
  });
});

describe('isPreviewable', () => {
  it('returns true for previewable types', () => {
    expect(isPreviewable('image/jpeg')).toBe(true);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('image/webp')).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('text/plain')).toBe(true);
  });

  it('returns false for non-previewable types', () => {
    expect(isPreviewable('application/msword')).toBe(false);
    expect(isPreviewable('video/mp4')).toBe(false);
    expect(isPreviewable(null)).toBe(false);
    expect(isPreviewable('')).toBe(false);
  });
});

describe('getFileTypeIcon', () => {
  it('returns correct icons', () => {
    expect(getFileTypeIcon('image/jpeg')).toBe('image');
    expect(getFileTypeIcon('application/pdf')).toBe('file-text');
    expect(getFileTypeIcon('text/plain')).toBe('file-text');
    expect(getFileTypeIcon('application/msword')).toBe('file-text');
    expect(getFileTypeIcon('application/vnd.ms-excel')).toBe('table');
    expect(getFileTypeIcon('video/mp4')).toBe('file');
    expect(getFileTypeIcon(null)).toBe('file');
  });
});

describe('Constants validation', () => {
  it('has correct photo categories', () => {
    expect(PHOTO_CATEGORIES.length).toBe(10);
    expect(PHOTO_CATEGORIES.every(c => c.value && c.label)).toBe(true);
  });

  it('has correct document categories', () => {
    expect(DOCUMENT_CATEGORIES.length).toBe(10);
    expect(DOCUMENT_CATEGORIES.every(c => c.value && c.label)).toBe(true);
  });

  it('has correct report sections', () => {
    expect(REPORT_SECTIONS.length).toBe(7);
    expect(REPORT_SECTIONS.every(s => s.id && s.label)).toBe(true);
  });
});