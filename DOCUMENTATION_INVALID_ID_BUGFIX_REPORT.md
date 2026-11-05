# Documentation Invalid ID Bugfix Report

## Confirmed Root Cause

`ProjectDocumentationPage` called the documentation endpoints directly with
`activeProjectId`:

- `GET /api/v1/projects/:id/photos`
- `GET /api/v1/projects/:id/documents`

When `activeProjectId` was not a backend UUID (for example a stale/generated
offline id or a non-UUID carried over during auth transitions), the backend
`contextIDs` helper failed UUID parsing and returned HTTP 400 with
`"Invalid ID"`. The frontend surfaced this as
`"Gagal memuat dokumentasi: Invalid ID"`.

The backend validation itself is correct and was not weakened. The fix prevents
invalid identifiers from being sent and routes loading through the same
normalized ProjectContext helpers used by the well-level documentation page.

## Evidence

- Backend origin: `backend/internal/handler/documentation.go` `contextIDs`
  returns the error that becomes `"Invalid ID"` for non-UUID `:id` values.
- Frontend origin: `src/components/ProjectDocumentationPage.jsx`
  `loadDocumentation` called `photoAPI.list('project', activeProjectId)` and
  `documentAPI.list('project', activeProjectId)` directly.
- `ProjectContext.getPhotos`/`getDocuments` already map API responses to the
  frontend shape and handle auth/offline fallbacks, but ProjectDocumentationPage
  bypassed them.

## Files Changed

- `src/components/ProjectDocumentationPage.jsx`
  - Added `isValidBackendId` guard before documentation requests.
  - Switched loading to `getPhotos`/`getDocuments` from `ProjectContext`.
  - Added guards to upload handlers.
- `src/context/ProjectContext.jsx`
  - Guarded `getPhotos`, `getDocuments`, `uploadPhoto`, and `uploadDocument`
    against non-backend IDs.
- `backend/tests/fs3/fs3_test.go`
  - Added `TestDocumentationAPI` covering valid ID, invalid ID, cross-project
    access, admin access, and unauthenticated rejection.

## Fix Explanation

- Invalid/non-UUID project IDs no longer trigger backend requests; the UI
  resets to empty arrays instead of showing `"Invalid ID"`.
- Documentation loading now uses the normalized context helpers, ensuring
  correct field mapping (`file_type`, `download_url`, etc.) and consistent
  authorization/offline behavior.
- Backend UUID validation remains unchanged.

## Tests and Verification

- Frontend: `npm test` — 5 test files, 79 tests passed.
- Frontend build: `npm run build` — successful.
- Backend: `go vet ./...` — no issues; `go build ./...` — successful.
- Browser verification performed:
  - Logged in as admin.
  - Opened the project documentation page.
  - Existing documentation request returned HTTP 200.
  - Page refresh and re-navigation succeeded.
  - No `"Gagal memuat dokumentasi: Invalid ID"` toast appeared.

## Remaining Risks

- Backend integration tests (`go test ./tests/fs3/`) require the test
  PostgreSQL instance on port 5433; it was not available in this environment,
  so those tests were not executed here. The added test compiles and follows
  existing harness patterns.
- Offline-to-authenticated transitions with stale generated IDs are mitigated
  by guards, but full end-to-end coverage of that transition would require
  additional browser scenarios.