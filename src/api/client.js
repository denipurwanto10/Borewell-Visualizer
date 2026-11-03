// Centralized API client for Borewell Engineering Visualizer FS3
// Uses AuthContext for access token (memory) and HttpOnly cookies for refresh.

const API_BASE = '/api/v1';

// Response envelope types
function isJsonResponse(res) {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json');
}

async function parseBody(res) {
  if (isJsonResponse(res)) {
    return res.json();
  }
  const text = await res.text();
  return text ? { _raw: text } : null;
}

function errorFromResponse(res, body) {
  const detail = body && body.detail ? body.detail : `HTTP ${res.status}`;
  const errors = body && body.errors ? body.errors : null;
  const err = new Error(detail);
  err.status = res.status;
  err.type = body && body.type ? body.type : null;
  err.title = body && body.title ? body.title : null;
  err.errors = errors;
  return err;
}

let refreshInFlight = null;
let refreshResolveList = [];

async function waitForRefresh() {
  return new Promise((resolve) => {
    refreshResolveList.push(resolve);
  });
}

function resolveRefreshWaiters(success) {
  const list = refreshResolveList;
  refreshResolveList = [];
  for (const resolve of list) {
    resolve(success);
  }
}

// Fetch with auth + automatic refresh on 401
export async function apiRequest(path, options = {}) {
  const token = window.__borewell_access_token || null;

  const headers = {
    ...(options.headers || {}),
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include', // send HttpOnly refresh cookie
  });

  // Successful response (no auth issue)
  if (res.ok) {
    return res;
  }

  // 401 -> attempt refresh once
  if (res.status === 401 && !options._retried) {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            window.__borewell_access_token = data.access_token;
            resolveRefreshWaiters(true);
          } else {
            window.__borewell_access_token = null;
            resolveRefreshWaiters(false);
          }
        } catch {
          window.__borewell_access_token = null;
          resolveRefreshWaiters(false);
        } finally {
          refreshInFlight = null;
        }
      })();
    }

    await waitForRefresh();

    if (window.__borewell_access_token) {
      // Retry the original request with new token
      const retryOpts = { ...options, _retried: true };
      if (retryOpts.headers) {
        retryOpts.headers.Authorization = `Bearer ${window.__borewell_access_token}`;
      }
      return apiRequest(path, retryOpts);
    }

    // Refresh failed - auth state is invalid
    throw errorFromResponse(res, await parseBody(res).catch(() => null));
  }

  const body = await parseBody(res);
  throw errorFromResponse(res, body);
}

// Helper to convert query params
function buildQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  }
  const qs = search.toString();
  return qs ? '?' + qs : '';
}

// ============ PROJECTS ============

export const projectAPI = {
  list: async (params = {}) => {
    const res = await apiRequest('/projects' + buildQuery(params));
    return await res.json();
  },
  get: async (id) => {
    const res = await apiRequest(`/projects/${id}`);
    return await res.json();
  },
  create: async (data) => {
    const res = await apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  update: async (id, data) => {
    const res = await apiRequest(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (id) => {
    const res = await apiRequest(`/projects/${id}`, { method: 'DELETE' });
    return res;
  },
  archive: async (id) => {
    const res = await apiRequest(`/projects/${id}/archive`, { method: 'POST' });
    return await res.json();
  },
  restore: async (id) => {
    const res = await apiRequest(`/projects/${id}/restore`, { method: 'POST' });
    return await res.json();
  },
  duplicate: async (id) => {
    const res = await apiRequest(`/projects/${id}/duplicate`, { method: 'POST' });
    return await res.json();
  },
};

// ============ WELLS ============

export const wellAPI = {
  list: async (projectId, params = {}) => {
    const res = await apiRequest(`/projects/${projectId}/wells` + buildQuery(params));
    return await res.json();
  },  get: async (id) => {
    const res = await apiRequest(`/wells/${id}`);
    return await res.json();
  },
  create: async (projectId, data) => {
    const res = await apiRequest(`/projects/${projectId}/wells`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  update: async (id, data) => {
    const res = await apiRequest(`/wells/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (id) => {
    const res = await apiRequest(`/wells/${id}`, { method: 'DELETE' });
    return res;
  },
};

// ============ DESIGNER ============

export const designerAPI = {
  get: async (wellId) => {
    const res = await apiRequest(`/wells/${wellId}/designer`);
    return await res.json();
  },
  upsert: async (wellId, data) => {
    const res = await apiRequest(`/wells/${wellId}/designer`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (wellId) => {
    const res = await apiRequest(`/wells/${wellId}/designer`, { method: 'DELETE' });
    return res;
  },
};

// ============ GEOLOGY ============

export const geologyAPI = {
  get: async (wellId) => {
    const res = await apiRequest(`/wells/${wellId}/geology`);
    return await res.json();
  },
  upsert: async (wellId, data) => {
    const res = await apiRequest(`/wells/${wellId}/geology`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (wellId) => {
    const res = await apiRequest(`/wells/${wellId}/geology`, { method: 'DELETE' });
    return res;
  },
};

// ============ MONITORING ============

export const monitoringAPI = {
  get: async (wellId) => {
    const res = await apiRequest(`/wells/${wellId}/monitoring`);
    return await res.json();
  },
  upsert: async (wellId, data) => {
    const res = await apiRequest(`/wells/${wellId}/monitoring`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (wellId) => {
    const res = await apiRequest(`/wells/${wellId}/monitoring`, { method: 'DELETE' });
    return res;
  },
};

// ============ DOCUMENTATION: PHOTOS ============

export const photoAPI = {
  list: async (contextType, contextId, params = {}) => {
    // contextType: 'well' | 'project'
    const path = contextType === 'well'
      ? `/wells/${contextId}/photos`
      : `/projects/${contextId}/photos`;
    const res = await apiRequest(path + buildQuery(params));
    return await res.json();
  },
  get: async (photoId) => {
    const res = await apiRequest(`/photos/${photoId}`);
    return await res.json();
  },
  upload: async (contextType, contextId, formData) => {
    // contextType: 'well' | 'project'
    const path = contextType === 'well'
      ? `/wells/${contextId}/photos`
      : `/projects/${contextId}/photos`;
    const res = await apiRequest(path, {
      method: 'POST',
      body: formData, // FormData, no Content-Type header (browser sets boundary)
    });
    return await res.json();
  },
  update: async (photoId, data) => {
    const res = await apiRequest(`/photos/${photoId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (photoId) => {
    const res = await apiRequest(`/photos/${photoId}`, { method: 'DELETE' });
    return res;
  },
};

// ============ DOCUMENTATION: DOCUMENTS ============

export const documentAPI = {
  list: async (contextType, contextId, params = {}) => {
    // contextType: 'well' | 'project'
    const path = contextType === 'well'
      ? `/wells/${contextId}/documents`
      : `/projects/${contextId}/documents`;
    const res = await apiRequest(path + buildQuery(params));
    return await res.json();
  },
  get: async (documentId) => {
    const res = await apiRequest(`/documents/${documentId}`);
    return await res.json();
  },
  upload: async (contextType, contextId, formData) => {
    // contextType: 'well' | 'project'
    const path = contextType === 'well'
      ? `/wells/${contextId}/documents`
      : `/projects/${contextId}/documents`;
    const res = await apiRequest(path, {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  },
  update: async (documentId, data) => {
    const res = await apiRequest(`/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return await res.json();
  },
  delete: async (documentId) => {
    const res = await apiRequest(`/documents/${documentId}`, { method: 'DELETE' });
    return res;
  },
};

// ============ FILE DOWNLOAD ============

export const fileAPI = {
  downloadUrl: (fileId) => `/api/v1/files/${fileId}`,
  get: async (fileId) => {
    const res = await apiRequest(`/files/${fileId}`);
    return res; // Returns Response for streaming/blob handling
  },
  getBlobUrl: async (fileId) => {
    const res = await apiRequest(`/files/${fileId}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

// ============ BACKUP & RESTORE ============

export const backupAPI = {
  create: async () => {
    const res = await apiRequest('/backup', { method: 'GET' });
    return await res.json();
  },
  restore: async (backupJson, mode = 'merge') => {
    // backupJson: string (JSON text)
    // mode: 'replace' | 'merge'
    const formData = new FormData();
    formData.append('backup', new Blob([backupJson], { type: 'application/json' }), 'backup.json');
    formData.append('mode', mode);
    const res = await apiRequest('/backup/restore', {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  },
};

// ============ MIGRATION ============

export const migrationAPI = {
  preview: async (legacyData) => {
    const res = await apiRequest('/migration/preview', {
      method: 'POST',
      body: JSON.stringify(legacyData),
    });
    return await res.json();
  },
  import: async (legacyData, files, options = {}) => {
    const formData = new FormData();
    formData.append('data', JSON.stringify({ options }));
    formData.append('legacy', JSON.stringify(legacyData));
    
    // Append files
    for (const [key, fileList] of Object.entries(files)) {
      for (const file of fileList) {
        formData.append('files', file);
      }
    }
    
    const res = await apiRequest('/migration/import', {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  },
};
