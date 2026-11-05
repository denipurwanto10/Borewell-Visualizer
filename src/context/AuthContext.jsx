import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  apiRequest,
  getAccessToken as _getAccessToken,
  setAccessToken as _setAccessToken,
  clearAccessToken as _clearAccessToken,
  refreshAccessToken,
} from '../api/client';

const API_BASE = '/api/v1';

// Module-level guard to prevent duplicate initialization (e.g. React StrictMode).
let authInitPromise = null;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Delegate to shared client helpers so refresh coordination is unified.
  const getAccessToken = useCallback(() => _getAccessToken(), []);
  const setAccessToken = useCallback((token) => _setAccessToken(token), []);
  const clearAccessToken = useCallback(() => _clearAccessToken(), []);

  const register = useCallback(async ({ email, password, passwordConfirmation, fullName }) => {
    setError(null);
    try {
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, password_confirmation: passwordConfirmation, full_name: fullName }),
      });
      const data = await res.json();
      return data.data;
    } catch (err) {
      throw new Error(err?.message || 'Registration failed');
    }
  }, [apiRequest]);

  const login = useCallback(async ({ email, password }) => {
    setError(null);
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      setAccessToken(data.access_token);
      setUser(data.user);
      return data;
    } catch (err) {
      throw new Error(err?.message || 'Login failed');
    }
  }, [apiRequest, setAccessToken, setUser]);

  const logout = useCallback(async () => {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAccessToken();
    setUser(null);
  }, [apiRequest, clearAccessToken, setUser]);

  const refresh = useCallback(async () => {
    try {
      const token = await refreshAccessToken();
      setAccessToken(token);
      return { access_token: token };
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        clearAccessToken();
        setUser(null);
      }
      throw new Error(err?.status === 401 || err?.status === 403
        ? 'Session expired'
        : `Refresh failed (${err?.status ?? ''})`);
    }
  }, [setAccessToken, setUser, clearAccessToken]);

  const me = useCallback(async () => {
    try {
      // Restore session without a transient 401: refresh first when there is no
      // in-memory access token, then fetch /auth/me with the valid token.
      if (!getAccessToken()) {
        try {
          await refreshAccessToken();
        } catch (err) {
          clearAccessToken();
          setUser(null);
          setError(null);
          return null;
        }
      }
      const res = await apiRequest('/auth/me');
      const data = await res.json();
      setUser(data.data);
      setError(null);
      return data.data;
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        clearAccessToken();
        setUser(null);
        setError(null);
        return null;
      }
      setError(err?.message ? `Gagal memuat sesi (${err.status ?? ''}).` : 'Koneksi jaringan gagal. Coba lagi nanti.');
      return null;
    }
  }, [apiRequest, setUser, clearAccessToken, getAccessToken, refreshAccessToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!authInitPromise) {
          authInitPromise = me().catch(() => null);
        }
        await authInitPromise;
      } catch (err) {
        // No valid session
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

  const value = {
    user,
    loading,
    error,
    setError,
    register,
    login,
    logout,
    refresh,
    me,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}