# Implementation Plan: Phase 3.1 — Designer Integration & Data Consistency

## Overview
Integrate the Advanced Well Designer model with the legacy visualization model and PDF generator. Establish a clear adapter layer for conversion, prevent duplicate/conflicting data, and ensure backward compatibility with legacy-only wells.

## Architecture Decisions
- **Single Source of Truth**: The Designer model (`model.designer.components`) is the authoritative model for well construction. The legacy model (`model.pipes`, `screens`, `openHole`, `ground`, `mat`) remains for backward compatibility and PDF generation.
- **Adapter Pattern**: Create `src/designer/adapter.js` for bidirectional conversion between Designer and Legacy models. Conversion is explicit, one-directional (Designer → Legacy for PDF), and idempotent.
- **No Bidirectional Sync**: Never auto-sync. Legacy data is only read for migration/display. Designer edits never overwrite legacy fields unless explicitly converted.
- **PDF Uses Adapter**: PDF generator imports the adapter and uses Designer components when available, falling back to legacy. Duplicate drawings are prevented by tracking which depths are already rendered.

## Task List

### Phase 1: Adapter Layer (Foundation)
- [ ] Task 1: Create `src/designer/adapter.js` with Designer→Legacy conversion functions
- [ ] Task 2: Add Legacy→Designer migration helper for initial Designer load
- [ ] Task 3: Add unit tests for adapter conversions

### Phase 2: PDF Integration
- [ ] Task 4: Update `src/pdf.js` to import and use the adapter
- [ ] Task 5: Render Designer components in PDF (casing, screen, open hole, gravel pack, cement, markers)
- [ ] Task 6: Preserve legacy fallback for wells without Designer data
- [ ] Task 7: Prevent duplicate drawings when both models have overlapping data

### Phase 3: Designer Page Integration
- [ ] Task 8: Update `DesignerPage.jsx` to load Designer state from `data.model.designer` with Legacy→Designer migration fallback
- [ ] Task 9: Ensure Designer saves to `model.designer` without touching legacy `model` fields
- [ ] Task 10: Verify switching between wells preserves both models independently

### Phase 4: Optional Drag-to-Adjust-Depth
- [ ] Task 11: Evaluate hit-testing accuracy for drag operations
- [ ] Task 12: Implement drag-to-adjust-depth with validation, undo/redo, and autosave
- [ ] Task 13: Keep Properties Panel as precise editing method

### Phase 5: Verification & Testing
- [ ] Task 14: Run Phase 2 storage tests
- [ ] Task 15: Run PDF tests
- [ ] Task 16: Run Phase 3 Designer tests
- [ ] Task 17: Production build verification
- [ ] Task 18: Manual test scenarios (legacy well, new well, migrated well, multi-well switching)

### Checkpoints
- **Checkpoint 1 (After Tasks 1-3)**: Adapter works, conversions tested
- **Checkpoint 2 (After Tasks 4-7)**: PDF generates correctly for Designer and legacy wells
- **Checkpoint 3 (After Tasks 8-10)**: Designer page loads/saves correctly, multi-well works
- **Checkpoint 4 (After Tasks 11-13)**: Drag interaction works if implemented
- **Checkpoint 5 (After Tasks 14-18)**: All tests pass, build succeeds

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| PDF layout breaks with new components | High | Test each component type; maintain existing layout structure |
| Data loss during migration | High | Never overwrite legacy fields; adapter is read-only for legacy |
| Duplicate components in PDF | Medium | Track rendered depth ranges; skip legacy if Designer covers same interval |
| Drag interaction breaks validation | Medium | Run validation after drag; add to history; test edge cases |

## Open Questions
- Should gravel_pack and cement_grouting appear in PDF? (Yes, as annular zones)
- Should pump_position and water_level_marker appear in PDF? (Yes, as markers)
- Exact visual representation of new component types in PDF?