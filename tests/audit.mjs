// Audit script - run with Node.js, localStorage mocked.
import * as storage from 'file:///C:/Website/visualisasi_pipa/src/storage/projectStorage.js';
import * as docStorage from 'file:///C:/Website/visualisasi_pipa/src/storage/documentationStorage.js';
import * as backupStorage from 'file:///C:/Website/visualisasi_pipa/src/storage/backupStorage.js';

// ---------- localStorage mock ----------
const store = new Map();
globalThis.localStorage = {
  getItem(k) { return store.get(k) ?? null; },
  setItem(k, v) { store.set(k, String(v)); return true; },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
  get length() { return store.size; },
  key(i) { const keys = [...store.keys()]; return keys[i] ?? null; },
};

// ---------- indexedDB mock ----------
class MockObjectStore {
  constructor() {
    this.data = new Map();
  }
  put(record) { this.data.set(record.id, record); }
  get(id) { return this.data.get(id) ?? null; }
  delete(id) { this.data.delete(id); }
  getAll() { return [...this.data.values()]; }
}

class MockTransaction {
  constructor(stores) {
    this.stores = stores;
    this.oncomplete = null;
    this.onerror = null;
    setTimeout(() => this.oncomplete?.(), 0);
  }
  objectStore(name) { return this.stores[name]; }
}

class MockDB {
  constructor() {
    this.stores = { photos: new MockObjectStore(), documents: new MockObjectStore() };
    this.objectStoreNames = new Set(['photos', 'documents']);
  }
  transaction(names, mode) { return new MockTransaction(this.stores); }
}

let mockDB = null;
globalThis.indexedDB = {
  open(name, version) {
    const request = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: null,
    };
    mockDB = new MockDB();
    if (request.onupgradeneeded) request.onupgradeneeded({ target: { result: mockDB } });
    request.result = mockDB;
    if (request.onsuccess) request.onsuccess({ target: { result: mockDB } });
    return request;
  },
  deleteDatabase(name) {
    mockDB = null;
    return { onsuccess: null, onerror: null };
  },
};

// Initialize storage
console.log('\n=== INITIALIZING STORAGE ===');
const migResult = storage.initializeStorage();
console.log('Migration result:', JSON.stringify(migResult, null, 2));

// Run audit
console.log('\n=== STORAGE AUDIT ===');
const audit = backupStorage.auditStorage();
console.log(JSON.stringify(audit, null, 2));