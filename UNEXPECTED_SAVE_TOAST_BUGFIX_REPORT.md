# Unexpected "Gagal menyimpan data" Toast — Bug Fix Report (HTTP 400)

## 1. Actual Root Cause

Authenticated API requests were being made with legacy/offline-generated identifiers instead of backend UUIDs.

- Offline/legacy storage generates ids such as `well-179367347637-abc` and `proj-...`.
- In authenticated mode, `loadProjectsFromAPI()` copied the stale localStorage active well id directly into React state:
  `setActiveWellIdState(lsGetActiveWellId())`.
- That generated id is not a valid UUID, so every API call using it (`GET /api/v1/wells/{id}`, `PUT /api/v1/wells/{id}`, and module upserts) failed with HTTP 400 "Invalid well ID".
- Multiple mounted pages (`DesignerPage`, `GeologyPage`, `MonitoringPage`, `DocumentationPage`) each called `loadActiveWellData()` with the same invalid id, producing repeated 400 requests.
- The failed save path then triggered the toast "Gagal menyimpan data. Coba lagi."

This is not an initialization race or a snake_case/camelCase conversion issue. The previous fixes did not address stale cross-mode identifiers.

## 2. Evidence

- Request names in Chrome DevTools began with `well-179367347637-...`, matching the generated id format in `src/models/project.js` (`well-${Date.now()}-${...}`).
- Backend `WellHandler.UpdateWell` and module handlers call `uuid.Parse(c.Param("id"))`; an invalid id returns HTTP 400 before any validation or database access.
- `src/context/ProjectContext.jsx` previously set `activeWellId` from `lsGetActiveWellId()` in API mode.
- `lsSetActiveWellId` is not used by normal authenticated flows, so localStorage active well ids could only be stale legacy/offline values.

## 3. Files Changed

- `src/utils/ids.js` (new): `isValidBackendId()` UUID validator.
- `src/utils/ids.test.js` (new): regression tests for the validator.
- `src/context/ProjectContext.jsx`:
  - Import `isValidBackendId`.
  - In `loadProjectsFromAPI()`, stop copying stale localStorage well ids; reset active well to `null` and clear stale localStorage UI state.
  - Guard `saveActiveWellData()`, `loadActiveWellData()`, and `getWellData()` against invalid backend ids.
- `src/App.jsx`:
  - Import `isValidBackendId`.
  - Guard the autosave effect so it never runs with an invalid authenticated well id.
- `UNEXPECTED_SAVE_TOAST_BUGFIX_REPORT.md`: this report.

## 4. Explanation of the Fix

- Authenticated mode no longer trusts localStorage for the active well id.
- Any generated/offline id is rejected before an API request is attempted.
- Invalid ids reset the active well to `null`, preventing retry loops and repeated 400 responses.
- Backend validation and security are unchanged.
- The toast is still shown for genuine save failures.

## 5. Tests Added or Modified

- `src/utils/ids.test.js`: valid UUIDs accepted; generated offline ids and invalid values rejected.
- Existing frontend tests remain passing (79 tests).
- Backend `go vet ./...` and `go test ./...` pass.

## 6. Test and Build Results

- Frontend: `npm test` — 5 test files, 79 tests passed.
- Frontend build: `npm run build` — succeeded.
- Backend: `go vet ./...` — no issues.
- Backend: `go test ./...` — all packages ok.

## 7. Browser Verification

Performed against local dev server (`http://localhost:5173`) with backend (`http://localhost:8080`):

- Logged in as `admin@local`.
- Injected a stale localStorage active well id (`well-179367347637-abc`).
- Reloaded and checked Network: 0 HTTP 400 requests.
- Repeated refresh: 0 HTTP 400 requests.
- Full legitimate edit/save persistence was not exercised in-browser; code path remains unchanged for valid UUID well ids and is covered by existing save flow.

## 8. Remaining Risks or Limitations

- Users with stale localStorage project/well ids lose the previously selected active well after refresh and must reselect it. This is expected because authenticated selection was never persisted.
- The frontend still autosaves on model/well/activity changes for valid wells; this is intended behavior.
- If a backend record is deleted while selected, the next load/save will fail and show the toast as intended.

## 9. Manual Verification Steps

1. Clear or inject stale `borewell-projects:v1` activeWellId.
2. Open the application and log in.
3. Wait for project and well data to load.
4. Confirm no HTTP 400 requests in Network.
5. Refresh and confirm again.
6. Create/select a valid well, edit data, and save.
7. Refresh and verify persistence.