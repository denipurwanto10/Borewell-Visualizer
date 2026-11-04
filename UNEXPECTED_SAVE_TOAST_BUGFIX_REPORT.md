# Unexpected "Gagal menyimpan data" Toast — Bug Fix Report

## Summary
Fixed a bug where the error toast "Gagal menyimpan data. Coba lagi." appeared unexpectedly on:
- Page refresh (while authenticated)
- Immediately after successful login
- Without any user-initiated save action

## Root Causes (Two Issues)

### Issue 1: Autosave Race Condition (Fixed in commit `e7c0db0`)
**File:** `src/App.jsx` — autosave effect

The autosave `useEffect` fired on initial render with empty/default data before `loadActiveWellData()` could hydrate real data from the API.

### Issue 2: Snake_case / camelCase Mismatch (Fixed in this commit)
**File:** `src/context/ProjectContext.jsx` — `loadActiveWellData()` function

The `loadActiveWellData()` function returned raw API data (snake_case: `well_name`, `well_type`, `planned_depth`, etc.) but `saveActiveWellData()` expects camelCase (`wellName`, `wellType`, `plannedDepth`, etc.). When autosave ran after hydration, it sent `undefined` values for all well fields, causing the backend to reject the request with a 400 validation error.

### Issue 3: Un-awaited Async Calls in Page Components
**Files:** `src/components/DesignerPage.jsx`, `src/components/GeologyPage.jsx`, `src/components/MonitoringPage.jsx`

These pages called `loadActiveWellData()` without `await`, receiving a Promise instead of resolved data. This prevented proper data loading (though didn't directly cause the toast).

## Fix Applied

### 1. Hydration Guard (commit `e7c0db0`)
**File:** `src/App.jsx`
- Added `wellHydrated` state to track when initial well data has loaded
- Guarded autosave with `activeWellId && wellHydrated`
- Fixed async loading with proper `await` and cleanup

### 2. Well Data Normalization (this commit)
**File:** `src/context/ProjectContext.jsx`
- Added normalization in `loadActiveWellData()` to convert API snake_case to frontend camelCase
- Maps: `well_code` → `wellCode`, `well_name` → `wellName`, `well_type` → `wellType`, `planned_depth` → `plannedDepth`, etc.

### 3. Fixed Async/Await in Page Components (this commit)
**Files:** `src/components/DesignerPage.jsx`, `src/components/GeologyPage.jsx`, `src/components/MonitoringPage.jsx`
- Changed load effects to properly `await loadActiveWellData()`
- Added cleanup functions to handle well switching

## Verification

### Build
```bash
npm run build
# ✓ built in 29.60s
```

### Frontend Tests (Vitest)
```bash
npm test
# 4 test files, 76 tests passed
```

### Backend Tests (Go)
```bash
go test ./...
# All packages ok
```

### Static Analysis
```bash
go vet ./...
# No issues
```

## Regression Test Scenarios

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| Open login page | No toast | No toast |
| Successful login | ❌ Toast appeared | ✅ No toast |
| Refresh while authenticated | ❌ Toast appeared | ✅ No toast |
| Initial project hydration | ❌ Premature save | ✅ No premature save |
| Initial well hydration | ❌ Premature save | ✅ No premature save |
| Change selected project | ❌ Stale-project save possible | ✅ Hydration resets |
| Change selected well | ❌ Stale-well save possible | ✅ Hydration resets |
| Actual successful save | ✅ Works | ✅ Works |
| Actual failed save | ✅ Error shown | ✅ Error shown |
| Expired session | ✅ Auth handles | ✅ Auth handles |
| Logout | ✅ No background save | ✅ No background save |

## Files Changed
- `src/App.jsx` — Added hydration guard and fixed async loading in autosave lifecycle (commit `e7c0db0`)
- `src/context/ProjectContext.jsx` — Normalize well data from API snake_case to camelCase
- `src/components/DesignerPage.jsx` — Properly await `loadActiveWellData()` with cleanup
- `src/components/GeologyPage.jsx` — Properly await `loadActiveWellData()` with cleanup
- `src/components/MonitoringPage.jsx` — Properly await `loadActiveWellData()` with cleanup

## Remaining Limitations
- The autosave still runs on every `model`/`well`/`activity` change after hydration. This is intentional for real-time persistence.
- If the API returns 401/403 during autosave, the global auth interceptor handles token refresh; repeated failures will eventually log the user out.
- No deduplication of rapid successive saves — acceptable for current UX.