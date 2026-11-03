import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const API_BASE = '/api/v1';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getAccessToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    // Access token is kept in memory only, not in storage
    return window.__borewell_access_token || null;
  }, []);

  const setAccessToken = useCallback((token) => {
    if (typeof window === 'undefined') return;
    window.__borewell_access_token = token;
  }, []);

  const clearAccessToken = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.__borewell_access_token = null;
  }, []);

  const apiRequest = useCallback(async (path, options = {}) => {
    const token = getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include', // send HttpOnly cookies
    });

    return res;
  }, [getAccessToken]);

  const register = useCallback(async ({ email, password, passwordConfirmation, fullName }) => {
    setError(null);
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, password_confirmation: passwordConfirmation, full_name: fullName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || 'Registration failed');
    }

    const data = await res.json();
    return data.data;
  }, [apiRequest]);

  const login = useCallback(async ({ email, password }) => {
    setError(null);
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || 'Login failed');
    }

    const data = await res.json();
    setAccessToken(data.access_token);
    setUser(data.user);
    return data;
  }, [apiRequest, setAccessToken, setUser]);

  const logout = useCallback(async () => {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAccessToken();
    setUser(null);
  }, [apiRequest, clearAccessToken, setUser]);

  const refresh = useCallback(async () => {
    const res = await apiRequest('/auth/refresh', { method: 'POST' });
    if (!res.ok) {
      // Hanya 401/403 yang berarti session tidak valid. HTTP 500 atau error
      // jaringan tidak secara otomatis di-invalidasikan sebagai session.
      if (res.status === 401 || res.status === 403) {
        clearAccessToken();
        setUser(null);
      }
      throw new Error(res.status === 401 || res.status === 403
        ? 'Session expired'
        : `Refresh failed (${res.status})`);
    }
    const data = await res.json();
    setAccessToken(data.access_token);
    return data;
  }, [apiRequest, setAccessToken, setUser, clearAccessToken]);

  const me = useCallback(async () => {
    try {
      const res = await apiRequest('/auth/me');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // 401/403 = belum terautentikasi atau sesi tidak valid, BUKAN kegagalan teknis.
          // Jika belum ada access token (mis. setelah reload browser), coba refresh
          // dulu menggunakan HttpOnly cookie sebelum menyatakan sesi tidak valid.
          if (!getAccessToken()) {
            try {
              await refresh();
              const retry = await apiRequest('/auth/me');
              if (retry.ok) {
                const data = await retry.json();
                setUser(data.data);
                setError(null);
                return data.data;
              }
            } catch {
              // Refresh gagal: sesi benar-benar tidak valid.
            }
          }
          clearAccessToken();
          setUser(null);
          setError(null);
          return null;
        }
        // HTTP 500 / error jaringan: kegagalan teknis, bukan indikasi session tidak valid.
        // Access token dipertahankan dan tidak secara otomatis di-invalidasi.
        setError(res.status === 0 ? 'Koneksi jaringan gagal.' : `Gagal memuat sesi (${res.status}).`);
        return null;
      }
      setError(null);
      const data = await res.json();
      setUser(data.data);
      return data.data;
    } catch (err) {
      // fetch melempar (mis. tidak ada jaringan): kegagalan teknis, bukan unauthenticated.
      setError('Koneksi jaringan gagal. Coba lagi nanti.');
      return null;
    }
  }, [apiRequest, setUser, clearAccessToken, getAccessToken, refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
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