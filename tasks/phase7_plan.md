# Implementation Plan: Phase 7 — Data Management, Backup & Restore

## Overview
Implement comprehensive data management for the Borewell Engineering Visualizer including backup/restore, import/export, storage health monitoring, and data integrity checking. All operations remain local-first with no backend dependencies.

## Architecture Decisions
- Use ZIP format for backups containing manifest JSON + binary assets (IndexedDB files)
- Backup format versioned with schema validation
- Safety backup created before any restore operation
- Two restore modes: Full Replace and Merge with conflict detection
- Storage health uses browser APIs (navigator.storage.estimate, localStorage size estimation)
- Data integrity checker reports Errors/Warnings/Info without auto-fixing

## Task List

### Phase 1: Storage Audit & Core Backup Infrastructure
- [ ] **Task 1**: Create storage audit utility to enumerate all LocalStorage keys and IndexedDB stores
- [ ] **Task 2**: Create backup format schema and validation (ZIP with manifest.json + assets/)
- [ ] **Task 3**: Implement backup engine - collect all data from LocalStorage and IndexedDB
- [ ] **Task 4**: Implement backup download (trigger file save)

### Phase 2: Restore Engine
- [ ] **Task 5**: Implement backup validation (format, version, structure)
- [ ] **Task 6**: Implement Full Replace restore with safety backup
- [ ] **Task 7**: Implement Merge restore with conflict detection
- [ ] **Task 8**: Implement restore rollback on failure

### Phase 3: Import/Export Features
- [ ] **Task 9**: Export Projects (JSON)
- [ ] **Task 10**: Export Selected Well (JSON)
- [ ] **Task 11**: Export Groundwater Monitoring CSV
- [ ] **Task 12**: Export Geological Log CSV
- [ ] **Task 13**: Export Documentation Metadata
- [ ] **Task 14**: Import validation and preview

### Phase 4: Storage Health & Data Integrity
- [ ] **Task 15**: Implement Storage Health Monitor (LocalStorage + IndexedDB usage)
- [ ] **Task 16**: Implement Data Integrity Checker (broken refs, duplicates, orphaned data)
- [ ] **Task 17**: Add repair preview for safe fixes

### Phase 5: UI - Data Management Page
- [ ] **Task 18**: Create DataManagementPage component with tabs
- [ ] **Task 19**: Backup & Restore tab UI
- [ ] **Task 20**: Import & Export tab UI
- [ ] **Task 21**: Storage Health tab UI
- [ ] **Task 22**: Data Integrity tab UI
- [ ] **Task 23**: Add navigation menu item and integrate with App.jsx

### Phase 6: Testing & Verification
- [ ] **Task 24**: Write Phase 7 verification tests
- [ ] **Task 25**: Run regression tests for Phases 2-6
- [ ] **Task 26**: Production build verification

## Checkpoints

### Checkpoint: Foundation (After Tasks 1-4)
- [ ] Backup creates valid ZIP with all data
- [ ] Backup downloads correctly
- [ ] Manifest validates against schema

### Checkpoint: Restore (After Tasks 5-8)
- [ ] Full Replace restores all data correctly
- [ ] Merge detects conflicts properly
- [ ] Failed restore rolls back to safety backup

### Checkpoint: Import/Export (After Tasks 9-14)
- [ ] All export formats generate valid files
- [ ] Import validates and previews correctly

### Checkpoint: Health & Integrity (After Tasks 15-17)
- [ ] Storage health shows accurate estimates
- [ ] Integrity checker finds known issues

### Checkpoint: UI Complete (After Tasks 18-23)
- [ ] Data Management page accessible from nav
- [ ] All tabs functional with loading/error states

### Checkpoint: Final (After Tasks 24-26)
- [ ] All Phase 7 tests pass
- [ ] All regression tests pass
- [ ] Production build succeeds

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Large IndexedDB files exceed memory during backup | High | Stream files in chunks; use Blob for ZIP creation |
| Restore corrupts existing data | High | Safety backup mandatory before restore; verify before commit |
| Merge logic creates duplicate/broken refs | Medium | Explicit conflict UI; no silent overwrites |
| Browser quota exceeded during restore | Medium | Check estimate before restore; warn user |
| Legacy data migration edge cases | Low | Test with various legacy formats |

## Open Questions
- Should backup history be stored locally (in localStorage) or only as downloaded files?
- Maximum practical backup size for browser ZIP creation?