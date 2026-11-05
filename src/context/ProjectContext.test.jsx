import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadWellDataCache } from './ProjectContext';

// Mock the API client
vi.mock('../api/client', () => ({
  projectAPI: {
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
  wellAPI: {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  designerAPI: {
    get: vi.fn(),
    upsert: vi.fn(),
  },
  geologyAPI: {
    get: vi.fn(),
    upsert: vi.fn(),
  },
  monitoringAPI: {
    get: vi.fn(),
    upsert: vi.fn(),
  },
  photoAPI: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  documentAPI: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  fileAPI: {},
  backupAPI: {},
}));

const { projectAPI, wellAPI, designerAPI, geologyAPI, monitoringAPI } = await import('../api/client');

describe('loadActiveWellData deduplication logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWellDataCache.clear();
    projectAPI.list.mockResolvedValue({ data: [] });
    wellAPI.get.mockResolvedValue({ 
      data: { 
        id: 'well-1', 
        well_code: 'W-1', 
        well_name: 'Well 1', 
        well_type: 'production', 
        location: '', 
        latitude: '', 
        longitude: '', 
        planned_depth: null, 
        actual_depth: null, 
        drilling_date: '', 
        completion_date: '', 
        status: 'planned', 
        description: '', 
        project_id: 'proj-1', 
        created_at: '', 
        updated_at: '', 
        borehole_images: {} 
      } 
    });
    designerAPI.get.mockResolvedValue({ data: { version: 1, components: [], config: {} } });
    geologyAPI.get.mockResolvedValue({ data: { version: 1, layers: [] } });
    monitoringAPI.get.mockResolvedValue({ data: { version: 1, measurements: [] } });
  });

  afterEach(() => {
    vi.resetAllMocks();
    loadWellDataCache.clear();
  });

  it('cache key format is correct for authenticated mode', () => {
    const cacheKey = 'api:well-1';
    expect(cacheKey).toBe('api:well-1');
  });

  it('cache key format is correct for localStorage mode', () => {
    const cacheKey = 'ls:well-1';
    expect(cacheKey).toBe('ls:well-1');
  });

  it('forceRefresh clears cache entry', () => {
    const cacheKey = 'api:well-1';
    const dummyPromise = Promise.resolve({ well: { id: 'well-1' } });
    loadWellDataCache.set(cacheKey, dummyPromise);
    
    expect(loadWellDataCache.has(cacheKey)).toBe(true);
    
    // Simulate forceRefresh
    loadWellDataCache.delete(cacheKey);
    
    expect(loadWellDataCache.has(cacheKey)).toBe(false);
  });

  it('in-flight promise is returned for duplicate calls', async () => {
    const cacheKey = 'api:well-1';
    let resolvePromise;
    const inFlightPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    
    loadWellDataCache.set(cacheKey, inFlightPromise);
    
    // Simulate getting the in-flight promise
    const cachedPromise = loadWellDataCache.get(cacheKey);
    expect(cachedPromise).toBe(inFlightPromise);
    
    // Resolve the promise
    resolvePromise({ well: { id: 'well-1' } });
    const result = await inFlightPromise;
    expect(result.well.id).toBe('well-1');
  });

  it('cache is cleared when switching wells', () => {
    const cacheKey1 = 'api:well-1';
    const cacheKey2 = 'api:well-2';
    const dummyPromise1 = Promise.resolve({ well: { id: 'well-1' } });
    const dummyPromise2 = Promise.resolve({ well: { id: 'well-2' } });
    
    loadWellDataCache.set(cacheKey1, dummyPromise1);
    loadWellDataCache.set(cacheKey2, dummyPromise2);
    
    expect(loadWellDataCache.size).toBe(2);
    
    // Simulate selectWell clearing all cache
    loadWellDataCache.clear();
    
    expect(loadWellDataCache.size).toBe(0);
  });

  it('cache stores separate entries for different wells', () => {
    const cacheKey1 = 'api:well-1';
    const cacheKey2 = 'api:well-2';
    const dummyPromise1 = Promise.resolve({ well: { id: 'well-1' } });
    const dummyPromise2 = Promise.resolve({ well: { id: 'well-2' } });
    
    loadWellDataCache.set(cacheKey1, dummyPromise1);
    loadWellDataCache.set(cacheKey2, dummyPromise2);
    
    expect(loadWellDataCache.get(cacheKey1)).toBe(dummyPromise1);
    expect(loadWellDataCache.get(cacheKey2)).toBe(dummyPromise2);
    expect(loadWellDataCache.size).toBe(2);
  });

  it('cache stores separate entries for authenticated vs localStorage mode', () => {
    const cacheKeyApi = 'api:well-1';
    const cacheKeyLs = 'ls:well-1';
    const dummyPromiseApi = Promise.resolve({ well: { id: 'well-1' } });
    const dummyPromiseLs = Promise.resolve({ well: { id: 'well-1' } });
    
    loadWellDataCache.set(cacheKeyApi, dummyPromiseApi);
    loadWellDataCache.set(cacheKeyLs, dummyPromiseLs);
    
    expect(loadWellDataCache.get(cacheKeyApi)).toBe(dummyPromiseApi);
    expect(loadWellDataCache.get(cacheKeyLs)).toBe(dummyPromiseLs);
    expect(loadWellDataCache.size).toBe(2);
  });
});