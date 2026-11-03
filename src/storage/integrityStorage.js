// Phase 7 — Data Integrity Checker
// Validates relationships, detects anomalies, reports issues without auto-fixing

import {
  getAllProjects,
  getProjectById,
  getWellsForProject,
  getWellData,
} from './projectStorage.js';
import {
  getProjectDocumentation,
  getWellDocumentation,
  getProjectDocsData,
  getWellDocsData,
  retrieveFile,
} from './documentationStorage.js';

// Helper to get all localStorage keys (works with both real and mocked)
function getAllLocalStorageKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
  } catch {
    try {
      keys.push(...Object.keys(localStorage));
    } catch {}
  }
  return keys;
}

const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

function createIssue(severity, category, message, details = {}) {
  return {
    id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    severity,
    category,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

export function checkDataIntegrity() {
  const issues = [];
  const stats = {
    projectsChecked: 0,
    wellsChecked: 0,
    photosChecked: 0,
    documentsChecked: 0,
    errors: 0,
    warnings: 0,
    info: 0,
  };

  // ==================== PROJECT CHECKS ====================
  const projects = getAllProjects();
  stats.projectsChecked = projects.length;

  const projectIds = new Set(projects.map(p => p.id));
  const projectCodes = new Map();

  for (const project of projects) {
    // Duplicate project IDs
    if (projectIds.has(project.id)) {
      issues.push(createIssue(SEVERITY.ERROR, 'project', `Duplicate project ID: ${project.id}`, { projectId: project.id }));
      stats.errors++;
    }

    // Duplicate project codes
    const codeKey = project.projectCode.toLowerCase();
    if (projectCodes.has(codeKey)) {
      issues.push(createIssue(SEVERITY.ERROR, 'project', `Duplicate project code: ${project.projectCode}`, {
        projectId: project.id,
        existingId: projectCodes.get(codeKey),
      }));
      stats.errors++;
    }
    projectCodes.set(codeKey, project.id);

    // Missing required fields
    if (!project.projectCode?.trim()) {
      issues.push(createIssue(SEVERITY.ERROR, 'project', 'Project missing projectCode', { projectId: project.id }));
      stats.errors++;
    }
    if (!project.projectName?.trim()) {
      issues.push(createIssue(SEVERITY.ERROR, 'project', 'Project missing projectName', { projectId: project.id }));
      stats.errors++;
    }
    if (!project.clientName?.trim()) {
      issues.push(createIssue(SEVERITY.ERROR, 'project', 'Project missing clientName', { projectId: project.id }));
      stats.errors++;
    }

    // Invalid status
    const validStatuses = ['planning', 'in_progress', 'completed', 'on_hold', 'archived'];
    if (!validStatuses.includes(project.status)) {
      issues.push(createIssue(SEVERITY.WARNING, 'project', `Invalid project status: ${project.status}`, { projectId: project.id, status: project.status }));
      stats.warnings++;
    }

    // Project without wells
    if (!project.wells || project.wells.length === 0) {
      issues.push(createIssue(SEVERITY.INFO, 'project', `Project has no wells: ${project.projectName}`, { projectId: project.id }));
      stats.info++;
    }

    // Check wells reference valid project
    if (project.wells) {
      for (const wellId of project.wells) {
        if (!wellId) {
          issues.push(createIssue(SEVERITY.ERROR, 'project', 'Project wells array contains null/undefined', { projectId: project.id }));
          stats.errors++;
        }
      }
    }
  }

  // ==================== WELL CHECKS ====================
  const allWells = [];
  const wellIds = new Set();
  const wellCodesByProject = new Map(); // projectId -> Map<wellCodeLower, wellId>

  for (const project of projects) {
    const wells = getWellsForProject(project.id);
    for (const well of wells) {
      allWells.push({ projectId: project.id, well });
      wellIds.add(well.id);

      const codeKey = `${project.id}:${well.wellCode.toLowerCase()}`;
      if (!wellCodesByProject.has(project.id)) wellCodesByProject.set(project.id, new Map());
      const projectWellCodes = wellCodesByProject.get(project.id);
      if (projectWellCodes.has(codeKey)) {
        issues.push(createIssue(SEVERITY.ERROR, 'well', `Duplicate well code in project: ${well.wellCode}`, {
          wellId: well.id,
          projectId: project.id,
          existingId: projectWellCodes.get(codeKey),
        }));
        stats.errors++;
      }
      projectWellCodes.set(codeKey, well.id);
    }
  }
  stats.wellsChecked = allWells.length;

  for (const { projectId, well } of allWells) {
    const wellData = getWellData(well.id);
    if (!wellData) {
      issues.push(createIssue(SEVERITY.ERROR, 'well', `Well metadata exists but data missing: ${well.wellName}`, { wellId: well.id, projectId }));
      stats.errors++;
      continue;
    }

    // Well references valid project
    if (!projectIds.has(well.projectId)) {
      issues.push(createIssue(SEVERITY.ERROR, 'well', `Well references non-existent project`, { wellId: well.id, projectId: well.projectId }));
      stats.errors++;
    } else if (well.projectId !== projectId) {
      issues.push(createIssue(SEVERITY.ERROR, 'well', `Well projectId mismatch with parent project`, { wellId: well.id, expectedProjectId: projectId, actualProjectId: well.projectId }));
      stats.errors++;
    }

    // Duplicate well ID
    if (wellIds.has(well.id)) {
      // Already counted above
    }

    // Missing required fields
    if (!well.wellCode?.trim()) {
      issues.push(createIssue(SEVERITY.ERROR, 'well', 'Well missing wellCode', { wellId: well.id }));
      stats.errors++;
    }
    if (!well.wellName?.trim()) {
      issues.push(createIssue(SEVERITY.ERROR, 'well', 'Well missing wellName', { wellId: well.id }));
      stats.errors++;
    }

    // Invalid well type
    const validWellTypes = ['production', 'monitoring', 'exploration', 'test', 'other'];
    if (!validWellTypes.includes(well.wellType)) {
      issues.push(createIssue(SEVERITY.WARNING, 'well', `Invalid well type: ${well.wellType}`, { wellId: well.id }));
      stats.warnings++;
    }

    // Invalid well status
    const validWellStatuses = ['planned', 'drilling', 'completed', 'on_hold', 'abandoned'];
    if (!validWellStatuses.includes(well.status)) {
      issues.push(createIssue(SEVERITY.WARNING, 'well', `Invalid well status: ${well.status}`, { wellId: well.id }));
      stats.warnings++;
    }

    // Check model data integrity
    const model = wellData.model || {};
    if (model.pipes) {
      const pipeDepths = new Set();
      for (const pipe of model.pipes) {
        if (!pipe.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'model', 'Pipe missing ID', { wellId: well.id }));
          stats.warnings++;
        }
        if (pipe.start >= pipe.end) {
          issues.push(createIssue(SEVERITY.WARNING, 'model', `Pipe has invalid depth range: ${pipe.start}-${pipe.end}`, { wellId: well.id, pipeId: pipe.id }));
          stats.warnings++;
        }
        const depthKey = `${pipe.start}-${pipe.end}-${pipe.diameter}`;
        if (pipeDepths.has(depthKey)) {
          issues.push(createIssue(SEVERITY.INFO, 'model', 'Potential duplicate pipe', { wellId: well.id, pipe }));
          stats.info++;
        }
        pipeDepths.add(depthKey);
      }
    }

    if (model.screens) {
      for (const screen of model.screens) {
        if (!screen.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'model', 'Screen missing ID', { wellId: well.id }));
          stats.warnings++;
        }
        if (screen.depth < 0 || screen.size <= 0) {
          issues.push(createIssue(SEVERITY.WARNING, 'model', `Screen has invalid depth/size: ${screen.depth}/${screen.size}`, { wellId: well.id, screenId: screen.id }));
          stats.warnings++;
        }
      }
    }

    // Check geological log
    const geology = model.geologicalLog;
    if (geology?.layers) {
      for (const layer of geology.layers) {
        if (!layer.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'geology', 'Layer missing ID', { wellId: well.id }));
          stats.warnings++;
        }
        if (layer.endDepth <= layer.startDepth) {
          issues.push(createIssue(SEVERITY.WARNING, 'geology', `Layer has invalid depth range: ${layer.startDepth}-${layer.endDepth}`, { wellId: well.id, layerId: layer.id }));
          stats.warnings++;
        }
        // Check for overlapping layers
        for (const other of geology.layers) {
          if (other.id !== layer.id) {
            const overlap = layer.startDepth < other.endDepth && layer.endDepth > other.startDepth;
            if (overlap) {
              issues.push(createIssue(SEVERITY.WARNING, 'geology', `Overlapping layers: ${layer.name} & ${other.name}`, { wellId: well.id, layer1: layer.id, layer2: other.id }));
              stats.warnings++;
            }
          }
        }
      }
    }

    // Check groundwater monitoring
    const monitoring = model.groundwaterMonitoring;
    if (monitoring?.measurements) {
      const measurementIds = new Set();
      for (const m of monitoring.measurements) {
        if (!m.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'monitoring', 'Measurement missing ID', { wellId: well.id }));
          stats.warnings++;
        } else if (measurementIds.has(m.id)) {
          issues.push(createIssue(SEVERITY.ERROR, 'monitoring', `Duplicate measurement ID: ${m.id}`, { wellId: well.id }));
          stats.errors++;
        }
        measurementIds.add(m.id);

        if (!m.measuredAt || isNaN(Date.parse(m.measuredAt))) {
          issues.push(createIssue(SEVERITY.ERROR, 'monitoring', `Measurement has invalid timestamp: ${m.measuredAt}`, { wellId: well.id, measurementId: m.id }));
          stats.errors++;
        }

        if (!Number.isFinite(m.waterLevelDepth)) {
          issues.push(createIssue(SEVERITY.WARNING, 'monitoring', `Measurement has invalid water level depth`, { wellId: well.id, measurementId: m.id }));
          stats.warnings++;
        }
      }
    }

    // Check designer components
    const designer = model.designer;
    if (designer?.components) {
      const compIds = new Set();
      for (const comp of designer.components) {
        if (!comp.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'designer', 'Component missing ID', { wellId: well.id }));
          stats.warnings++;
        } else if (compIds.has(comp.id)) {
          issues.push(createIssue(SEVERITY.ERROR, 'designer', `Duplicate component ID: ${comp.id}`, { wellId: well.id }));
          stats.errors++;
        }
        compIds.add(comp.id);

        if (!Number.isFinite(comp.startDepth)) {
          issues.push(createIssue(SEVERITY.WARNING, 'designer', `Component has invalid startDepth`, { wellId: well.id, componentId: comp.id }));
          stats.warnings++;
        }
        if (comp.endDepth !== undefined && comp.endDepth < comp.startDepth) {
          issues.push(createIssue(SEVERITY.WARNING, 'designer', `Component has endDepth < startDepth`, { wellId: well.id, componentId: comp.id }));
          stats.warnings++;
        }
      }
    }
  }

  // ==================== DOCUMENTATION CHECKS ====================
  // Project documentation
  const allProjectDocs = getProjectDocsData();
  for (const [projectId, docs] of Object.entries(allProjectDocs)) {
    if (!projectIds.has(projectId)) {
      issues.push(createIssue(SEVERITY.WARNING, 'documentation', `Project documentation for non-existent project`, { projectId }));
      stats.warnings++;
    }

    if (docs.photos) {
      stats.photosChecked += docs.photos.length;
      const photoIds = new Set();
      for (const photo of docs.photos) {
        if (!photo.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', 'Photo missing ID', { projectId }));
          stats.warnings++;
        } else if (photoIds.has(photo.id)) {
          issues.push(createIssue(SEVERITY.ERROR, 'documentation', `Duplicate photo ID: ${photo.id}`, { projectId }));
          stats.errors++;
        }
        photoIds.add(photo.id);

        if (!photo.fileRef) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', `Photo missing fileRef: ${photo.name}`, { projectId, photoId: photo.id }));
          stats.warnings++;
        } else if (photo.fileRef.startsWith('indexeddb:')) {
          // Will be checked in IndexedDB section
        }
      }
    }

    if (docs.documents) {
      stats.documentsChecked += docs.documents.length;
      const docIds = new Set();
      for (const doc of docs.documents) {
        if (!doc.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', 'Document missing ID', { projectId }));
          stats.warnings++;
        } else if (docIds.has(doc.id)) {
          issues.push(createIssue(SEVERITY.ERROR, 'documentation', `Duplicate document ID: ${doc.id}`, { projectId }));
          stats.errors++;
        }
        docIds.add(doc.id);

        if (!doc.fileRef) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', `Document missing fileRef: ${doc.title}`, { projectId, documentId: doc.id }));
          stats.warnings++;
        }
      }
    }
  }

  // Well documentation
  const allWellDocsKeys = getAllLocalStorageKeys().filter(k => k.startsWith('borewell-well-docs-'));
  for (const key of allWellDocsKeys) {
    const wellId = key.replace('borewell-well-docs-', '').replace(':v1', '');
    const docs = getWellDocumentation(wellId);

    if (!wellIds.has(wellId)) {
      issues.push(createIssue(SEVERITY.WARNING, 'documentation', `Well documentation for non-existent well`, { wellId }));
      stats.warnings++;
    }

    if (docs.photos) {
      stats.photosChecked += docs.photos.length;
      const photoIds = new Set();
      for (const photo of docs.photos) {
        if (!photo.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', 'Photo missing ID', { wellId }));
          stats.warnings++;
        } else if (photoIds.has(photo.id)) {
          issues.push(createIssue(SEVERITY.ERROR, 'documentation', `Duplicate photo ID: ${photo.id}`, { wellId }));
          stats.errors++;
        }
        photoIds.add(photo.id);

        if (!photo.fileRef) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', `Photo missing fileRef: ${photo.name}`, { wellId, photoId: photo.id }));
          stats.warnings++;
        }
      }
    }

    if (docs.documents) {
      stats.documentsChecked += docs.documents.length;
      const docIds = new Set();
      for (const doc of docs.documents) {
        if (!doc.id) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', 'Document missing ID', { wellId }));
          stats.warnings++;
        } else if (docIds.has(doc.id)) {
          issues.push(createIssue(SEVERITY.ERROR, 'documentation', `Duplicate document ID: ${doc.id}`, { wellId }));
          stats.errors++;
        }
        docIds.add(doc.id);

        if (!doc.fileRef) {
          issues.push(createIssue(SEVERITY.WARNING, 'documentation', `Document missing fileRef: ${doc.title}`, { wellId, documentId: doc.id }));
          stats.warnings++;
        }
      }
    }
  }

  // ==================== INDEXEDDB CHECKS ====================
  // Check for orphaned IndexedDB files (files without metadata references)
  // This is async - we'll return a promise for this part
  const indexedDBCheck = checkIndexedDBIntegrity();

  return {
    issues,
    stats,
    indexedDBCheck, // Promise
    summary: {
      totalIssues: issues.length,
      errors: stats.errors,
      warnings: stats.warnings,
      info: stats.info,
    },
  };
}

async function checkIndexedDBIntegrity() {
  const issues = [];
  try {
    const db = await openDocsDB();
    if (!db) return { issues, checked: false, reason: 'IndexedDB not available' };

    // Collect all referenced file IDs from metadata
    const referencedPhotoIds = new Set();
    const referencedDocIds = new Set();

    const allProjectDocs = getProjectDocsData();
    for (const docs of Object.values(allProjectDocs)) {
      for (const photo of docs.photos || []) {
        if (photo.fileRef?.startsWith('indexeddb:photo:')) {
          referencedPhotoIds.add(photo.fileRef.split(':')[2]);
        }
      }
      for (const doc of docs.documents || []) {
        if (doc.fileRef?.startsWith('indexeddb:document:')) {
          referencedDocIds.add(doc.fileRef.split(':')[2]);
        }
      }
    }

    const allWellDocsKeys = Object.keys(localStorage).filter(k => k.startsWith('borewell-well-docs-'));
    for (const key of allWellDocsKeys) {
      const wellId = key.replace('borewell-well-docs-', '').replace(':v1', '');
      const docs = getWellDocumentation(wellId);
      for (const photo of docs.photos || []) {
        if (photo.fileRef?.startsWith('indexeddb:photo:')) {
          referencedPhotoIds.add(photo.fileRef.split(':')[2]);
        }
      }
      for (const doc of docs.documents || []) {
        if (doc.fileRef?.startsWith('indexeddb:document:')) {
          referencedDocIds.add(doc.fileRef.split(':')[2]);
        }
      }
    }

    // Check photos store
    const photos = await getAllFromStore(db, 'photos');
    for (const photo of photos) {
      if (!referencedPhotoIds.has(photo.id)) {
        issues.push(createIssue(SEVERITY.INFO, 'indexeddb', `Orphaned photo in IndexedDB: ${photo.fileName}`, { id: photo.id, fileName: photo.fileName, fileSize: photo.fileSize }));
      }
      // Check if dataUrl exists
      if (!photo.dataUrl) {
        issues.push(createIssue(SEVERITY.ERROR, 'indexeddb', `Photo missing dataUrl: ${photo.id}`, { id: photo.id }));
      }
    }

    // Check documents store
    const documents = await getAllFromStore(db, 'documents');
    for (const doc of documents) {
      if (!referencedDocIds.has(doc.id)) {
        issues.push(createIssue(SEVERITY.INFO, 'indexeddb', `Orphaned document in IndexedDB: ${doc.fileName}`, { id: doc.id, fileName: doc.fileName, fileSize: doc.fileSize }));
      }
      if (!doc.dataUrl) {
        issues.push(createIssue(SEVERITY.ERROR, 'indexeddb', `Document missing dataUrl: ${doc.id}`, { id: doc.id }));
      }
    }

    // Check for referenced but missing files
    for (const id of referencedPhotoIds) {
      const found = photos.find(p => p.id === id);
      if (!found) {
        issues.push(createIssue(SEVERITY.ERROR, 'indexeddb', `Referenced photo not found in IndexedDB`, { id }));
      }
    }
    for (const id of referencedDocIds) {
      const found = documents.find(d => d.id === id);
      if (!found) {
        issues.push(createIssue(SEVERITY.ERROR, 'indexeddb', `Referenced document not found in IndexedDB`, { id }));
      }
    }

    return { issues, checked: true, photoCount: photos.length, documentCount: documents.length };
  } catch (e) {
    return { issues, checked: false, error: e.message };
  }
}

function openDocsDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open('BorewellDocsDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

// ==================== SAFE REPAIR PREVIEW ====================

export function generateRepairPreview(issues) {
  const repairs = [];

  for (const issue of issues) {
    if (issue.severity !== SEVERITY.ERROR && issue.severity !== SEVERITY.WARNING) continue;

    switch (issue.category) {
      case 'project':
        if (issue.message.includes('Duplicate project ID')) {
          repairs.push({
            issueId: issue.id,
            action: 'remove_duplicate_project',
            description: `Remove duplicate project ${issue.details.projectId}`,
            destructive: true,
            preview: 'Will keep the first occurrence, remove subsequent duplicates',
          });
        }
        break;

      case 'well':
        if (issue.message.includes('Duplicate well code')) {
          repairs.push({
            issueId: issue.id,
            action: 'rename_duplicate_well',
            description: `Rename well ${issue.details.wellId} to resolve code conflict`,
            destructive: false,
            preview: 'Will append "-DUP" to wellCode of the duplicate',
          });
        }
        if (issue.message.includes('references non-existent project')) {
          repairs.push({
            issueId: issue.id,
            action: 'remove_orphaned_well',
            description: `Remove well ${issue.details.wellId} that references deleted project`,
            destructive: true,
            preview: 'Will delete the well and its data',
          });
        }
        break;

      case 'documentation':
        if (issue.message.includes('missing fileRef')) {
          repairs.push({
            issueId: issue.id,
            action: 'remove_orphaned_metadata',
            description: `Remove documentation record ${issue.details.photoId || issue.details.documentId} with missing file`,
            destructive: true,
            preview: 'Will delete the metadata record only',
          });
        }
        break;

      case 'indexeddb':
        if (issue.message.includes('Orphaned')) {
          repairs.push({
            issueId: issue.id,
            action: 'remove_orphaned_file',
            description: `Remove orphaned file ${issue.details.id} from IndexedDB`,
            destructive: true,
            preview: 'Will delete the binary file from IndexedDB',
          });
        }
        if (issue.message.includes('Referenced') && issue.message.includes('not found')) {
          repairs.push({
            issueId: issue.id,
            action: 'remove_broken_reference',
            description: `Remove broken reference to missing file ${issue.details.id}`,
            destructive: false,
            preview: 'Will clear the fileRef in metadata',
          });
        }
        break;

      case 'model':
      case 'geology':
      case 'monitoring':
      case 'designer':
        repairs.push({
          issueId: issue.id,
          action: 'manual_review',
          description: `Review ${issue.category} issue: ${issue.message}`,
          destructive: false,
          preview: 'Requires manual intervention - data may be valid but unusual',
        });
        break;
    }
  }

  return repairs;
}

// ==================== EXECUTE REPAIR (with confirmation) ====================

export async function executeRepair(repairAction, issueDetails) {
  const results = { success: false, message: '', changes: [] };

  try {
    switch (repairAction) {
      case 'remove_duplicate_project': {
        // Keep first, remove others - needs specific implementation
        results.message = 'Not implemented - requires specific duplicate IDs';
        break;
      }
      case 'rename_duplicate_well': {
        const wellId = issueDetails.wellId;
        const wellData = getWellData(wellId);
        if (wellData) {
          const newCode = wellData.well.wellCode + '-DUP';
          const updated = { ...wellData.well, wellCode: newCode };
          localStorage.setItem(`borewell-well-${wellId}:v1`, JSON.stringify({ ...wellData, well: updated }));
          results.success = true;
          results.message = `Renamed well code to ${newCode}`;
          results.changes.push({ type: 'well', id: wellId, field: 'wellCode', old: wellData.well.wellCode, new: newCode });
        }
        break;
      }
      case 'remove_orphaned_well': {
        const wellId = issueDetails.wellId;
        // Remove from project
        const projects = getAllProjects();
        for (const project of projects) {
          if (project.wells?.includes(wellId)) {
            project.wells = project.wells.filter(id => id !== wellId);
            localStorage.setItem(`borewell-project-${project.id}:v1`, JSON.stringify(project));
          }
        }
        // Remove well data
        localStorage.removeItem(`borewell-well-${wellId}:v1`);
        localStorage.removeItem(`borewell-well-docs-${wellId}:v1`);
        results.success = true;
        results.message = `Removed orphaned well ${wellId}`;
        results.changes.push({ type: 'well', id: wellId, action: 'deleted' });
        break;
      }
      case 'remove_orphaned_metadata': {
        const photoId = issueDetails.photoId;
        const documentId = issueDetails.documentId;
        if (photoId) {
          // Find and remove from project or well docs
          // This is complex - would need to search all docs
          results.message = 'Not fully implemented - needs scope';
        }
        break;
      }
      case 'remove_orphaned_file': {
        const db = await openDocsDB();
        if (db) {
          const id = issueDetails.id;
          await deleteFileFromDB(db, 'photos', id);
          await deleteFileFromDB(db, 'documents', id);
          results.success = true;
          results.message = `Removed orphaned file ${id}`;
          results.changes.push({ type: 'indexeddb', id, action: 'deleted' });
        }
        break;
      }
      case 'remove_broken_reference': {
        // Clear fileRef in metadata - complex, needs search
        results.message = 'Not fully implemented - needs scope';
        break;
      }
      default:
        results.message = `Unknown repair action: ${repairAction}`;
    }
  } catch (e) {
    results.message = `Repair failed: ${e.message}`;
  }

  return results;
}

function deleteFileFromDB(db, storeName, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export { SEVERITY };