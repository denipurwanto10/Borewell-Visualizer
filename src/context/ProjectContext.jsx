import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  initializeStorage,
  getAllProjects as lsGetAllProjects,
  getProjectById as lsGetProjectById,
  createProjectRecord as lsCreateProjectRecord,
  updateProjectRecord as lsUpdateProjectRecord,
  deleteProjectRecord as lsDeleteProjectRecord,
  archiveProjectRecord as lsArchiveProjectRecord,
  restoreProjectRecord as lsRestoreProjectRecord,
  duplicateProjectRecord as lsDuplicateProjectRecord,
  getActiveProjectId as lsGetActiveProjectId,
  setActiveProjectId as lsSetActiveProjectId,
  getActiveWellId as lsGetActiveWellId,
  setActiveWellId as lsSetActiveWellId,
  getWellsForProject as lsGetWellsForProject,
  getWellData as lsGetWellData,
  saveWellData as lsSaveWellData,
  createWellRecord as lsCreateWellRecord,
  updateWellRecord as lsUpdateWellRecord,
  deleteWellRecord as lsDeleteWellRecord,
  duplicateWellRecord as lsDuplicateWellRecord,
  getProjectStats as lsGetProjectStats,
} from '../storage/projectStorage';
import { validateProject, validateWell, PROJECT_STATUSES, WELL_TYPES, WELL_STATUSES } from '../models/project';
import { INITIAL_WELL, EMPTY_MODEL, makeEmptyActivity } from '../model';
import { useAuth } from './AuthContext';
import {
  getWellDocumentation,
  getProjectDocumentation,
  addWellPhoto,
  addWellDocument,
  deletePhoto as lsDeletePhoto,
  deleteDocument as lsDeleteDocument,
  updatePhoto as lsUpdatePhoto,
  updateDocument as lsUpdateDocument,
} from '../storage/documentationStorage';
import {
  projectAPI,
  wellAPI,
  designerAPI,
  geologyAPI,
  monitoringAPI,
  photoAPI,
  documentAPI,
  fileAPI,
  backupAPI,
} from '../api/client';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectIdState] = useState(null);
  const [activeWellId, setActiveWellIdState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationResult, setMigrationResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);

  const notify = useCallback((message, type = 'info') => {
    setToast({ id: Date.now(), message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Initialize: run localStorage migration (existing behavior) then load from API if authenticated
  useEffect(() => {
    const result = initializeStorage();
    setMigrationResult(result);

    if (isAuthenticated) {
      loadProjectsFromAPI();
    } else {
      refreshProjectsFromLS();
      setLoading(false);
    }
  }, [isAuthenticated]);

  // --- LocalStorage mode helpers ---

  const refreshProjectsFromLS = useCallback(() => {
    const allProjects = lsGetAllProjects();
    setProjects(allProjects);
    setActiveProjectIdState(lsGetActiveProjectId());
    setActiveWellIdState(lsGetActiveWellId());
  }, []);

  // --- API mode helpers ---

  const loadProjectsFromAPI = useCallback(async () => {
    setApiLoading(true);
    try {
      const res = await projectAPI.list({ page_size: 100 });
      const data = res.data || [];
      // Normalize API project shape to match frontend expectations
      const normalized = data.map(p => ({
        id: p.id,
        projectCode: p.project_code,
        projectName: p.project_name,
        clientName: p.client_name,
        contractorName: p.contractor_name || '',
        location: p.location || '',
        province: p.province || '',
        district: p.district || '',
        village: p.village || '',
        latitude: p.latitude || '',
        longitude: p.longitude || '',
        description: p.description || '',
        startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : '',
        endDate: p.end_date ? new Date(p.end_date).toISOString().slice(0, 10) : '',
        status: p.status || 'planning',
        createdAt: p.created_at || new Date().toISOString(),
        updatedAt: p.updated_at || new Date().toISOString(),
        archivedAt: p.archived_at || null,
        wellCount: p.well_count || 0,
      }));
      setProjects(normalized);
      // Set active project from localStorage (UI state) if it exists in API list
      const lsActive = lsGetActiveProjectId();
      if (lsActive && normalized.find(p => p.id === lsActive)) {
        setActiveProjectIdState(lsActive);
      } else if (normalized.length > 0) {
        setActiveProjectIdState(normalized[0].id);
      }
      const lsActiveWell = lsGetActiveWellId();
      setActiveWellIdState(lsActiveWell);
    } catch (err) {
      console.error('Failed to load projects from API:', err);
      // Fallback to localStorage
      refreshProjectsFromLS();
    } finally {
      setApiLoading(false);
      setLoading(false);
    }
  }, [refreshProjectsFromLS]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId) || null, [projects, activeProjectId]);

  const activeWell = useMemo(() => {
    if (!activeWellId) return null;
    if (isAuthenticated) {
      // API mode: well data is fetched on demand via wellAPI.get
      return null; // will be loaded lazily
    }
    return lsGetWellData(activeWellId);
  }, [activeWellId, isAuthenticated]);

  // --- Project CRUD ---

  const createProject = useCallback(async (projectData) => {
    const errors = validateProject(projectData);
    if (errors) return { success: false, errors };

    if (isAuthenticated) {
      try {
        const res = await projectAPI.create({
          project_code: projectData.projectCode,
          project_name: projectData.projectName,
          client_name: projectData.clientName,
          contractor_name: projectData.contractorName || '',
          location: projectData.location || '',
          province: projectData.province || '',
          district: projectData.district || '',
          village: projectData.village || '',
          latitude: projectData.latitude || '',
          longitude: projectData.longitude || '',
          description: projectData.description || '',
          start_date: projectData.startDate || '',
          end_date: projectData.endDate || '',
          status: projectData.status || 'planning',
        });
        const p = res.data;
        const normalized = {
          id: p.id,
          projectCode: p.project_code,
          projectName: p.project_name,
          clientName: p.client_name,
          contractorName: p.contractor_name || '',
          location: p.location || '',
          province: p.province || '',
          district: p.district || '',
          village: p.village || '',
          latitude: p.latitude || '',
          longitude: p.longitude || '',
          description: p.description || '',
          startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : '',
          endDate: p.end_date ? new Date(p.end_date).toISOString().slice(0, 10) : '',
          status: p.status || 'planning',
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at || new Date().toISOString(),
          archivedAt: p.archived_at || null,
          wellCount: 0,
        };
        setProjects(prev => [...prev, normalized]);
        notify('Proyek berhasil dibuat', 'success');
        return { success: true, project: normalized };
      } catch (err) {
        return { success: false, errors: { general: err.message || 'Gagal membuat proyek' } };
      }
    } else {
      const project = lsCreateProjectRecord(projectData);
      refreshProjectsFromLS();
      notify('Proyek berhasil dibuat', 'success');
      return { success: true, project };
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const updateProject = useCallback(async (id, updates) => {
    if (isAuthenticated) {
      try {
        const apiUpdates = {};
        if (updates.projectCode !== undefined) apiUpdates.project_code = updates.projectCode;
        if (updates.projectName !== undefined) apiUpdates.project_name = updates.projectName;
        if (updates.clientName !== undefined) apiUpdates.client_name = updates.clientName;
        if (updates.contractorName !== undefined) apiUpdates.contractor_name = updates.contractorName;
        if (updates.location !== undefined) apiUpdates.location = updates.location;
        if (updates.province !== undefined) apiUpdates.province = updates.province;
        if (updates.district !== undefined) apiUpdates.district = updates.district;
        if (updates.village !== undefined) apiUpdates.village = updates.village;
        if (updates.latitude !== undefined) apiUpdates.latitude = updates.latitude;
        if (updates.longitude !== undefined) apiUpdates.longitude = updates.longitude;
        if (updates.description !== undefined) apiUpdates.description = updates.description;
        if (updates.startDate !== undefined) apiUpdates.start_date = updates.startDate;
        if (updates.endDate !== undefined) apiUpdates.end_date = updates.endDate;
        if (updates.status !== undefined) apiUpdates.status = updates.status;

        const res = await projectAPI.update(id, apiUpdates);
        const p = res.data;
        const normalized = {
          id: p.id,
          projectCode: p.project_code,
          projectName: p.project_name,
          clientName: p.client_name,
          contractorName: p.contractor_name || '',
          location: p.location || '',
          province: p.province || '',
          district: p.district || '',
          village: p.village || '',
          latitude: p.latitude || '',
          longitude: p.longitude || '',
          description: p.description || '',
          startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : '',
          endDate: p.end_date ? new Date(p.end_date).toISOString().slice(0, 10) : '',
          status: p.status || 'planning',
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at || new Date().toISOString(),
          archivedAt: p.archived_at || null,
          wellCount: p.well_count || 0,
        };
        setProjects(prev => prev.map(p => p.id === id ? normalized : p));
        notify('Proyek berhasil diperbarui', 'success');
        return { success: true, project: normalized };
      } catch (err) {
        return { success: false, errors: { general: err.message || 'Gagal memperbarui proyek' } };
      }
    } else {
      const project = lsGetProjectById(id);
      if (!project) return { success: false, errors: { general: 'Proyek tidak ditemukan' } };
      const merged = { ...project, ...updates };
      const errors = validateProject(merged);
      if (errors) return { success: false, errors };
      const updated = lsUpdateProjectRecord(id, updates);
      refreshProjectsFromLS();
      notify('Proyek berhasil diperbarui', 'success');
      return { success: true, project: updated };
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const deleteProject = useCallback(async (id, confirmFn) => {
    const project = projects.find(p => p.id === id) || lsGetProjectById(id);
    if (!project) return { success: false };
    const ok = await confirmFn({
      title: 'Hapus proyek?',
      message: `Proyek "${project.projectName}" dan semua sumur di dalamnya akan dihapus permanen.`,
      confirmLabel: 'Hapus permanen',
    });
    if (!ok) return { success: false, cancelled: true };

    if (isAuthenticated) {
      try {
        await projectAPI.delete(id);
        setProjects(prev => prev.filter(p => p.id !== id));
        notify('Proyek dihapus', 'success');
        return { success: true };
      } catch (err) {
        return { success: false, errors: { general: err.message || 'Gagal menghapus proyek' } };
      }
    } else {
      lsDeleteProjectRecord(id);
      refreshProjectsFromLS();
      notify('Proyek dihapus', 'success');
      return { success: true };
    }
  }, [projects, isAuthenticated, refreshProjectsFromLS, notify]);

  const archiveProject = useCallback(async (id) => {
    if (isAuthenticated) {
      try {
        await projectAPI.archive(id);
        setProjects(prev => prev.map(p => p.id === id ? { ...p, status: 'archived' } : p));
        notify('Proyek diarsipkan', 'success');
      } catch (err) {
        notify('Gagal mengarsipkan proyek', 'error');
      }
    } else {
      lsArchiveProjectRecord(id);
      refreshProjectsFromLS();
      notify('Proyek diarsipkan', 'success');
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const restoreProject = useCallback(async (id) => {
    if (isAuthenticated) {
      try {
        await projectAPI.restore(id);
        setProjects(prev => prev.map(p => p.id === id ? { ...p, status: 'planning' } : p));
        notify('Proyek dipulihkan', 'success');
      } catch (err) {
        notify('Gagal memulihkan proyek', 'error');
      }
    } else {
      lsRestoreProjectRecord(id);
      refreshProjectsFromLS();
      notify('Proyek dipulihkan', 'success');
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const duplicateProject = useCallback(async (id) => {
    if (isAuthenticated) {
      try {
        const res = await projectAPI.duplicate(id);
        const p = res.data;
        const normalized = {
          id: p.id,
          projectCode: p.project_code,
          projectName: p.project_name,
          clientName: p.client_name,
          contractorName: p.contractor_name || '',
          location: p.location || '',
          province: p.province || '',
          district: p.district || '',
          village: p.village || '',
          latitude: p.latitude || '',
          longitude: p.longitude || '',
          description: p.description || '',
          startDate: '',
          endDate: '',
          status: 'planning',
          createdAt: p.created_at || new Date().toISOString(),
          updatedAt: p.updated_at || new Date().toISOString(),
          archivedAt: null,
          wellCount: 0,
        };
        setProjects(prev => [...prev, normalized]);
        notify('Proyek diduplikasi', 'success');
        return normalized;
      } catch (err) {
        notify('Gagal menduplikasi proyek', 'error');
        return null;
      }
    } else {
      const newProject = lsDuplicateProjectRecord(id);
      refreshProjectsFromLS();
      notify('Proyek diduplikasi', 'success');
      return newProject;
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  // --- Well CRUD ---

  const selectProject = useCallback((id) => {
    setActiveProjectIdState(id);
    setActiveWellIdState(null);
    notify('Proyek aktif diubah', 'info');
  }, [notify]);

  const selectWell = useCallback((wellId) => {
    setActiveWellIdState(wellId);
    notify('Sumur aktif diubah', 'info');
  }, [notify]);

  const createWell = useCallback(async (wellData) => {
    if (!activeProjectId) return { success: false, errors: { general: 'Tidak ada proyek aktif' } };

    const existingWells = isAuthenticated
      ? (await wellAPI.list(activeProjectId, { page_size: 100 })).data?.map(w => ({ wellCode: w.well_code, id: w.id, projectId: activeProjectId })) || []
      : lsGetWellsForProject(activeProjectId);

    const errors = validateWell(wellData, existingWells);
    if (errors) return { success: false, errors };

    if (isAuthenticated) {
      try {
        const res = await wellAPI.create(activeProjectId, {
          well_code: wellData.wellCode,
          well_name: wellData.wellName,
          well_type: wellData.wellType,
          location: wellData.location || '',
          latitude: wellData.latitude || '',
          longitude: wellData.longitude || '',
          planned_depth: wellData.plannedDepth ? Number(wellData.plannedDepth) : null,
          actual_depth: wellData.actualDepth ? Number(wellData.actualDepth) : null,
          drilling_date: wellData.drillingDate || '',
          completion_date: wellData.completionDate || '',
          status: wellData.status || 'planned',
          description: wellData.description || '',
        });
        const w = res.data;
        notify('Sumur berhasil dibuat', 'success');
        return { success: true, well: w };
      } catch (err) {
        return { success: false, errors: { general: err.message || 'Gagal membuat sumur' } };
      }
    } else {
      const well = lsCreateWellRecord(activeProjectId, wellData);
      refreshProjectsFromLS();
      notify('Sumur berhasil dibuat', 'success');
      return { success: true, well };
    }
  }, [activeProjectId, isAuthenticated, refreshProjectsFromLS, notify]);

  const updateWell = useCallback(async (wellId, updates) => {
    if (isAuthenticated) {
      try {
        const apiUpdates = {};
        if (updates.wellCode !== undefined) apiUpdates.well_code = updates.wellCode;
        if (updates.wellName !== undefined) apiUpdates.well_name = updates.wellName;
        if (updates.wellType !== undefined) apiUpdates.well_type = updates.wellType;
        if (updates.location !== undefined) apiUpdates.location = updates.location;
        if (updates.latitude !== undefined) apiUpdates.latitude = updates.latitude;
        if (updates.longitude !== undefined) apiUpdates.longitude = updates.longitude;
        if (updates.plannedDepth !== undefined) apiUpdates.planned_depth = updates.plannedDepth ? Number(updates.plannedDepth) : null;
        if (updates.actualDepth !== undefined) apiUpdates.actual_depth = updates.actualDepth ? Number(updates.actualDepth) : null;
        if (updates.drillingDate !== undefined) apiUpdates.drilling_date = updates.drillingDate;
        if (updates.completionDate !== undefined) apiUpdates.completion_date = updates.completionDate;
        if (updates.status !== undefined) apiUpdates.status = updates.status;
        if (updates.description !== undefined) apiUpdates.description = updates.description;

        const res = await wellAPI.update(wellId, apiUpdates);
        notify('Sumur berhasil diperbarui', 'success');
        return { success: true, well: res.data };
      } catch (err) {
        return { success: false, errors: { general: err.message || 'Gagal memperbarui sumur' } };
      }
    } else {
      const wellData = lsGetWellData(wellId);
      if (!wellData) return { success: false, errors: { general: 'Sumur tidak ditemukan' } };
      const projectId = wellData.well.projectId;
      const existingWells = lsGetWellsForProject(projectId);
      const merged = { ...wellData.well, ...updates };
      const errors = validateWell(merged, existingWells);
      if (errors) return { success: false, errors };
      const updated = lsUpdateWellRecord(wellId, updates);
      refreshProjectsFromLS();
      notify('Sumur berhasil diperbarui', 'success');
      return { success: true, well: updated };
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const deleteWell = useCallback(async (wellId, confirmFn) => {
    const wellData = isAuthenticated ? null : lsGetWellData(wellId);
    if (!isAuthenticated && !wellData) return { success: false };
    const name = wellData ? wellData.well.wellName : 'Sumur';
    const ok = await confirmFn({
      title: 'Hapus sumur?',
      message: `Sumur "${name}" dan semua datanya akan dihapus permanen.`,
      confirmLabel: 'Hapus permanen',
    });
    if (!ok) return { success: false, cancelled: true };

    if (isAuthenticated) {
      try {
        await wellAPI.delete(wellId);
        notify('Sumur dihapus', 'success');
        return { success: true };
      } catch (err) {
        return { success: false, errors: { general: err.message || 'Gagal menghapus sumur' } };
      }
    } else {
      lsDeleteWellRecord(wellId);
      refreshProjectsFromLS();
      notify('Sumur dihapus', 'success');
      return { success: true };
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const duplicateWell = useCallback(async (wellId) => {
    if (isAuthenticated) {
      try {
        const well = await wellAPI.get(wellId);
        const w = well.data;
        const res = await wellAPI.create(w.project_id, {
          well_code: `${w.well_code}-COPY`,
          well_name: `${w.well_name} (Salinan)`,
          well_type: w.well_type,
          location: w.location || '',
          latitude: w.latitude || '',
          longitude: w.longitude || '',
          planned_depth: w.planned_depth ? Number(w.planned_depth) : null,
          actual_depth: w.actual_depth ? Number(w.actual_depth) : null,
          drilling_date: w.drilling_date || '',
          completion_date: w.completion_date || '',
          status: 'planned',
          description: w.description || '',
        });
        notify('Sumur diduplikasi', 'success');
        return res.data;
      } catch (err) {
        notify('Gagal menduplikasi sumur', 'error');
        return null;
      }
    } else {
      const newWell = lsDuplicateWellRecord(wellId);
      refreshProjectsFromLS();
      notify('Sumur diduplikasi', 'success');
      return newWell;
    }
  }, [isAuthenticated, refreshProjectsFromLS, notify]);

  const getWellsForProject = useCallback((projectId) => {
    if (isAuthenticated) {
      // Return empty; wells loaded via API on demand in ProjectDetailPage
      return [];
    }
    return lsGetWellsForProject(projectId);
  }, [isAuthenticated]);

  const getWellData = useCallback(async (wellId) => {
    if (isAuthenticated) {
      try {
        const res = await wellAPI.get(wellId);
        return res.data;
      } catch (err) {
        return null;
      }
    }
    return lsGetWellData(wellId);
  }, [isAuthenticated]);

  // --- Module data (Designer, Geology, Monitoring) ---

  const saveActiveWellData = useCallback(async ({ well, model, activity }) => {
    if (!activeWellId) return { success: false };

    if (isAuthenticated) {
      try {
        // Save well record updates
        if (well) {
          await wellAPI.update(activeWellId, {
            well_name: well.wellName,
            well_type: well.wellType,
            location: well.location,
            latitude: well.latitude,
            longitude: well.longitude,
            planned_depth: well.plannedDepth ? Number(well.plannedDepth) : null,
            actual_depth: well.actualDepth ? Number(well.actualDepth) : null,
            drilling_date: well.drillingDate,
            completion_date: well.completionDate,
            status: well.status,
            description: well.description,
          });
        }

        // Save designer state
        if (model && model.designer) {
          await designerAPI.upsert(activeWellId, {
            version: model.designer.version || 1,
            components: model.designer.components || [],
            config: model.designer.config || {},
          });
        }

        // Save geology log
        if (model && model.geologicalLog) {
          await geologyAPI.upsert(activeWellId, {
            version: model.geologicalLog.version || 1,
            layers: model.geologicalLog.layers || [],
          });
        }

        // Save monitoring data
        if (model && model.groundwaterMonitoring) {
          await monitoringAPI.upsert(activeWellId, {
            version: model.groundwaterMonitoring.version || 1,
            measurements: model.groundwaterMonitoring.measurements || [],
          });
        }

        notify('Data berhasil disimpan', 'success');
        return { success: true };
      } catch (err) {
        notify('Gagal menyimpan data. Coba lagi.', 'error');
        return { success: false, error: err.message };
      }
    } else {
      const ok = lsSaveWellData(activeWellId, { well, model, activity });
      refreshProjectsFromLS();
      if (!ok) notify('Gagal menyimpan data sumur. Coba lagi dengan file lebih kecil.', 'error');
      return { success: ok };
    }
  }, [activeWellId, isAuthenticated, refreshProjectsFromLS, notify]);

  const loadActiveWellData = useCallback(async () => {
    if (!activeWellId) return null;
    if (isAuthenticated) {
      try {
        const wellRes = await wellAPI.get(activeWellId);
        const designerRes = await designerAPI.get(activeWellId).catch(() => ({ data: { version: 1, components: [], config: {} } }));
        const geologyRes = await geologyAPI.get(activeWellId).catch(() => ({ data: { version: 1, layers: [] } }));
        const monitoringRes = await monitoringAPI.get(activeWellId).catch(() => ({ data: { version: 1, measurements: [] } }));

        return {
          well: wellRes.data,
          model: {
            designer: designerRes.data || { version: 1, components: [], config: {} },
            geologicalLog: geologyRes.data || { version: 1, layers: [] },
            groundwaterMonitoring: monitoringRes.data || { version: 1, measurements: [] },
            pipes: [],
            screens: [],
            ground: null,
            mat: null,
          },
          activity: makeEmptyActivity(),
        };
      } catch (err) {
        console.error('Failed to load well data from API:', err);
        return null;
      }
    }
    return lsGetWellData(activeWellId);
  }, [activeWellId, isAuthenticated]);

  // --- Documentation: Photos & Documents (dual-write: API when authenticated, localStorage fallback) ---

  const getPhotos = useCallback(async (contextType, contextId) => {
    if (isAuthenticated) {
      try {
        const res = await photoAPI.list(contextType, contextId, { page_size: 100 });
        return (res.data || []).map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          documentedAt: p.documented_at,
          fileRef: p.download_url,
          fileName: p.file_name,
          fileType: p.file_type,
          fileSize: p.file_size,
          width: p.width,
          height: p.height,
          createdAt: p.created_at,
          updatedAt: p.updatedAt,
          projectId: p.project_id,
          wellId: p.well_id,
        }));
      } catch (err) {
        console.error('Failed to load photos from API:', err);
        return [];
      }
    }
    const docs = contextType === 'well'
      ? getWellDocumentation(contextId)
      : getProjectDocumentation(contextId);
    return docs.photos || [];
  }, [isAuthenticated]);

  const uploadPhoto = useCallback(async (contextType, contextId, file, metadata) => {
    if (isAuthenticated) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', metadata.name || file.name.replace(/\.[^/.]+$/, ''));
        formData.append('category', metadata.category || 'other');
        formData.append('description', metadata.description || '');
        formData.append('documented_at', metadata.documentedAt || new Date().toISOString());
        const res = await photoAPI.upload(contextType, contextId, formData);
        const p = res.data;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          documentedAt: p.documented_at,
          fileRef: p.download_url,
          fileName: p.file_name,
          fileType: p.file_type,
          fileSize: p.file_size,
        };
      } catch (err) {
        throw new Error(err.message || 'Gagal mengunggah foto');
      }
    }
    const wellData = lsGetWellData(contextId);
    const projectId = wellData?.well?.projectId || activeProjectId || '';
    return addWellPhoto(contextId, projectId, {
      name: metadata.name || file.name.replace(/\.[^/.]+$/, ''),
      category: metadata.category || 'other',
      description: metadata.description || '',
      documentedAt: metadata.documentedAt || new Date().toISOString(),
      fileRef: null, // set by caller
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  }, [isAuthenticated, activeProjectId]);

  const getDocuments = useCallback(async (contextType, contextId) => {
    if (isAuthenticated) {
      try {
        const res = await documentAPI.list(contextType, contextId, { page_size: 100 });
        return (res.data || []).map(d => ({
          id: d.id,
          title: d.title,
          category: d.category,
          description: d.description,
          documentDate: d.document_date,
          fileRef: d.download_url,
          fileName: d.file_name,
          fileType: d.file_type,
          fileSize: d.file_size,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          projectId: d.project_id,
          wellId: d.well_id,
        }));
      } catch (err) {
        console.error('Failed to load documents from API:', err);
        return [];
      }
    }
    const docs = contextType === 'well'
      ? getWellDocumentation(contextId)
      : getProjectDocumentation(contextId);
    return docs.documents || [];
  }, [isAuthenticated]);

  const uploadDocument = useCallback(async (contextType, contextId, file, metadata) => {
    if (isAuthenticated) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', metadata.title || file.name.replace(/\.[^/.]+$/, ''));
        formData.append('category', metadata.category || 'other');
        formData.append('description', metadata.description || '');
        formData.append('document_date', metadata.documentDate || new Date().toISOString().split('T')[0]);
        const res = await documentAPI.upload(contextType, contextId, formData);
        const d = res.data;
        return {
          id: d.id,
          title: d.title,
          category: d.category,
          description: d.description,
          documentDate: d.document_date,
          fileRef: d.download_url,
          fileName: d.file_name,
          fileType: d.file_type,
          fileSize: d.file_size,
        };
      } catch (err) {
        throw new Error(err.message || 'Gagal mengunggah dokumen');
      }
    }
    const wellData = lsGetWellData(contextId);
    const projectId = wellData?.well?.projectId || activeProjectId || '';
    return addWellDocument(contextId, projectId, {
      title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
      category: metadata.category || 'other',
      description: metadata.description || '',
      documentDate: metadata.documentDate || new Date().toISOString().split('T')[0],
      fileRef: null, // set by caller
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  }, [isAuthenticated, activeProjectId]);

  const deletePhotoAPI = useCallback(async (photoId) => {
    if (isAuthenticated) {
      try {
        await photoAPI.delete(photoId);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return lsDeletePhoto('well', photoId, activeWellId || '');
  }, [isAuthenticated, activeWellId]);

  const deleteDocumentAPI = useCallback(async (documentId) => {
    if (isAuthenticated) {
      try {
        await documentAPI.delete(documentId);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return lsDeleteDocument('well', documentId, activeWellId || '');
  }, [isAuthenticated, activeWellId]);

  const updatePhotoAPI = useCallback(async (photoId, data) => {
    if (isAuthenticated) {
      try {
        await photoAPI.update(photoId, data);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return lsUpdatePhoto('well', photoId, { ...data, wellId: activeWellId || '' });
  }, [isAuthenticated, activeWellId]);

  const updateDocumentAPI = useCallback(async (documentId, data) => {
    if (isAuthenticated) {
      try {
        await documentAPI.update(documentId, data);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return lsUpdateDocument('well', documentId, { ...data, wellId: activeWellId || '' });
  }, [isAuthenticated, activeWellId]);

  const stats = useMemo(() => {
    if (isAuthenticated) {
      return {
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status !== 'archived' && p.status !== 'completed').length,
        totalWells: projects.reduce((sum, p) => sum + (p.wellCount || 0), 0),
        completedWells: 0,
        recentProjects: projects.slice(0, 5),
        recentWells: [],
      };
    }
    return lsGetProjectStats();
  }, [projects, isAuthenticated]);

  const value = {
    projects,
    activeProjectId,
    activeWellId,
    activeProject,
    activeWell,
    loading: loading || apiLoading,
    migrationResult,
    toast,
    setToast,
    notify,
    isAuthenticated,
    refreshProjects: isAuthenticated ? loadProjectsFromAPI : refreshProjectsFromLS,
    createProject,
    updateProject,
    deleteProject,
    archiveProject,
    restoreProject,
    duplicateProject,
    selectProject,
    selectWell,
    createWell,
    updateWell,
    deleteWell,
    duplicateWell,
    saveActiveWellData,
    loadActiveWellData,
    getWellsForProject,
    getWellData,
    getPhotos,
    uploadPhoto,
    getDocuments,
    uploadDocument,
    deletePhoto: deletePhotoAPI,
    deleteDocument: deleteDocumentAPI,
    updatePhoto: updatePhotoAPI,
    updateDocument: updateDocumentAPI,
    stats,
    PROJECT_STATUSES,
    WELL_TYPES,
    WELL_STATUSES,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
