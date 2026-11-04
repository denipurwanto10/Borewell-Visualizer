# Unexpected "Gagal menyimpan data" Toast — Bug Fix Report

## Summary
Fixed a bug where the error toast "Gagal menyimpan data. Coba lagi." appeared unexpectedly on:
- Page refresh (while authenticated)
- Immediately after successful login
- Without any user-initiated save action

## Root Cause

**File:** `src/App.jsx` — autosave effect (lines 132–145)

The autosave `useEffect` had dependencies `[model, well, activity, saveActiveWellData]` and a guard `if (activeWellId)`. On initial page load:

1. **App mounts** with initial state: `model=EMPTY_MODEL`, `well=INITIAL_WELL`, `activity=makeEmptyActivity()`
2. **ProjectContext** loads projects from API and sets `activeWellId` from localStorage (previous session)
3. **Autosave effect runs on first render** because `model`/`well`/`activity` are in its dependency array
4. Since `activeWellId` is already truthy (from localStorage), the effect calls `saveActiveWellData()` with **empty/default data**
5. This sends empty data to multiple APIs:
   - `wellAPI.update()` — well record
   - `designerAPI.upsert()` — designer components/config
   - `geologyAPI.upsert()` — geological layers
   - `monitoringAPI.upsert()` — monitoring measurements
6. Backend rejects empty/invalid payloads → 4xx errors → toast "Gagal menyimpan data. Coba lagi."

**Key issue:** The effect fired *before* `loadActiveWellData()` could hydrate real data from the API.

## Fix Applied

**File:** `src/App.jsx`

1. **Added hydration state** — `wellHydrated` boolean tracking whether initial well data has loaded from the API.
2. **Guarded autosave** — Effect now requires `activeWellId && wellHydrated` before persisting.
3. **Fixed async loading** — `loadActiveWellData()` is async; now properly `await`ed with cleanup to handle well switching.
4. **Reset hydration on well change** — When `activeWellId` changes, `wellHydrated` resets to `false` until new data loads.

### Changes

| Location | Change |
|----------|--------|
| Line 99 | Added `const [wellHydrated, setWellHydrated] = useState(false);` |
| Line 110 | `setWellHydrated(true)` after data loads in `loadWellData` |
| Lines 123–138 | Load effect: reset hydration, await `loadActiveWellData()`, cleanup on unmount/well change |
| Lines 140–154 | Autosave effect: added `wellHydrated` guard and dependency |

## Verification

### Build
```bash
npm run build
# ✓ built in 41.57s
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
- `src/App.jsx` — Added hydration guard and fixed async loading in autosave lifecycle

## Remaining Limitations
- The autosave still runs on every `model`/`well`/`activity` change after hydration. This is intentional for real-time persistence.
- If the API returns 401/403 during autosave, the global auth interceptor handles token refresh; repeated failures will eventually log the user out.
- No deduplication of rapid successive saves — acceptable for current UX.