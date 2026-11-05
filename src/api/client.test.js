// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

function makeRes(status, body, headers = { 'content-type': 'application/json' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('client refresh coordination', () => {
  let mod;

  beforeEach(async () => {
    vi.resetModules();
    if (typeof window !== 'undefined') window.__borewell_access_token = null;
    global.fetch = vi.fn();
    mod = await import('./client.js');
  });

  it('uses single refresh for concurrent 401s and retries with new token', async () => {
    mod.setAccessToken('old');
    let refreshCalls = 0;
    let projectCalls = 0;
    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        return makeRes(200, { access_token: 'new' });
      }
      projectCalls += 1;
      const auth = opts?.headers?.Authorization;
      if (auth === 'Bearer old') return makeRes(401, { detail: 'unauthorized' });
      if (auth === 'Bearer new') return makeRes(200, { data: [] });
      return makeRes(401, { detail: 'unauthorized' });
    });

    const [r1, r2] = await Promise.all([
      mod.apiRequest('/projects'),
      mod.apiRequest('/projects'),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(projectCalls).toBeGreaterThanOrEqual(2);
  });

  it('failed refresh clears token and rejects without retry', async () => {
    mod.setAccessToken('old');
    let projectCalls = 0;
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) return makeRes(401, { detail: 'expired' });
      projectCalls += 1;
      return makeRes(401, { detail: 'unauthorized' });
    });

    await expect(mod.apiRequest('/projects')).rejects.toBeTruthy();
    expect(mod.getAccessToken()).toBeNull();
    expect(projectCalls).toBe(1);
  });

  it('does not refresh recursively for /auth/refresh', async () => {
    let fetchCalls = 0;
    global.fetch = vi.fn(async () => {
      fetchCalls += 1;
      return makeRes(401, { detail: 'expired' });
    });

    await expect(mod.apiRequest('/auth/refresh', { method: 'POST' })).rejects.toBeTruthy();
    expect(fetchCalls).toBe(1);
  });

  it('retries only once even if retry still 401', async () => {
    mod.setAccessToken('old');
    let projectCalls = 0;
    let refreshCalls = 0;
    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        return makeRes(200, { access_token: 'new' });
      }
      projectCalls += 1;
      return makeRes(401, { detail: 'unauthorized' });
    });

    await expect(mod.apiRequest('/projects')).rejects.toBeTruthy();
    expect(refreshCalls).toBe(1);
    expect(projectCalls).toBe(2);
  });

  it('propagates refreshed token to waiting requests', async () => {
    mod.setAccessToken('old');
    let refreshCalls = 0;
    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        // simulate delay
        await new Promise((r) => setTimeout(r, 10));
        return makeRes(200, { access_token: 'new' });
      }
      const auth = opts?.headers?.Authorization;
      if (auth === 'Bearer new') return makeRes(200, { ok: true });
      return makeRes(401, { detail: 'unauthorized' });
    });

    // Start a request that will trigger refresh
    const p1 = mod.apiRequest('/projects');
    // Allow refresh to be in flight
    await new Promise((r) => setTimeout(r, 0));
    const p2 = mod.apiRequest('/projects');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(mod.getAccessToken()).toBe('new');
  });
});