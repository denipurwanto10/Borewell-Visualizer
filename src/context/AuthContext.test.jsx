// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { StrictMode } from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.jsx';

function makeRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function Consumer() {
  const { loading, isAuthenticated, user } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{isAuthenticated ? `authed:${user?.email}` : 'anon'}</div>;
}

describe('AuthContext initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof window !== 'undefined') window.__borewell_access_token = null;
    global.fetch = vi.fn();
  });

  it('initializes session via refresh then /auth/me (single me)', async () => {
    let refreshCalls = 0;
    let meCalls = 0;
    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        return makeRes(200, { access_token: 'tok' });
      }
      if (String(url).includes('/auth/me')) {
        meCalls += 1;
        const auth = opts?.headers?.Authorization;
        if (auth === 'Bearer tok') return makeRes(200, { data: { id: '1', email: 'a@b.com', role: 'user', status: 'approved' } });
        return makeRes(401, { detail: 'unauthorized' });
      }
      return makeRes(404, {});
    });

    render(
      <StrictMode>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByText(/authed:a@b.com/)).toBeTruthy());
    expect(refreshCalls).toBe(1);
    expect(meCalls).toBeGreaterThanOrEqual(1);
  });

  it('transitions to unauthenticated on failed refresh', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) return makeRes(401, { detail: 'expired' });
      if (String(url).includes('/auth/me')) return makeRes(401, { detail: 'unauthorized' });
      return makeRes(404, {});
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('anon')).toBeTruthy());
  });
});