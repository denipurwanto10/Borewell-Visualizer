# End-to-End Verification Plan — Navigation & Backend

## Overview
Verify all navigation fixes work with a running backend. Fix test timing issues and update final report.

## Current State
- Navigation implementation: ✅ Complete (hash sync, row clicks, ActionMenu isolation)
- Frontend tests: ✅ 86 passing
- Backend unit tests: ✅ All passing
- Backend `.env` exists but PostgreSQL not running
- Docker installed but daemon not running
- Playwright tests: ⚠️ Some timing issues, backend-dependent tests BLOCKED

## Task Breakdown

### Phase 1: Backend Infrastructure
- [ ] Task 1: Start Docker Desktop and PostgreSQL
- [ ] Task 2: Verify PostgreSQL healthcheck passes
- [ ] Task 3: Run database migrations
- [ ] Task 4: Start backend server and verify health endpoints
- [ ] Task 5: Bootstrap admin user if needed

### Phase 2: Frontend Test Fixes
- [ ] Task 6: Fix "Project creation" test - add wait for projects page load
- [ ] Task 7: Verify all Playwright tests pass with backend running

### Phase 3: Navigation Regression Verification
- [ ] Task 8: Test all sidebar navigation items
- [ ] Task 9: Test mobile tab bar navigation
- [ ] Task 10: Test Quick Actions on Dashboard
- [ ] Task 11: Test Project row click navigation
- [ ] Task 12: Test Well row click navigation
- [ ] Task 13: Test ActionMenu doesn't trigger row navigation
- [ ] Task 14: Test Browser Back/Forward
- [ ] Task 15: Test Page refresh preservation
- [ ] Task 16: Test Direct URL hash access
- [ ] Task 17: Test Keyboard accessibility on tables

### Phase 4: Backend API Verification
- [ ] Task 18: Test authentication endpoints
- [ ] Task 19: Test project CRUD endpoints
- [ ] Task 20: Test well CRUD endpoints
- [ ] Task 21: Test module endpoints (designer, geology, monitoring)
- [ ] Task 22: Test file upload endpoints
- [ ] Task 23: Monitor backend logs during tests

### Phase 5: Final Report
- [ ] Task 24: Update FUNCTIONAL_NAVIGATION_FIX_REPORT.md with verified results
- [ ] Task 25: Separate code fixes from test results
- [ ] Task 26: Document blocked/failed tests with reasons
- [ ] Task 27: Document backend status and risks

## Dependencies
- Phase 1 must complete before Phase 2-4
- Phase 2 can run in parallel with Phase 3-4 after Phase 1
- Phase 5 requires all previous phases

## Verification Criteria
- All 13 sidebar routes + project detail load correctly
- Back/forward/refresh work for all routes
- Project creation completes end-to-end
- Well creation completes end-to-end
- Module pages load with active well
- Backend health/ready endpoints return 200
- No 400/401/409 errors in normal operation

## Risks
- Docker daemon not running (user must start Docker Desktop)
- PostgreSQL connection failures
- Backend goroutine leaks under test load (monitor)
- Playwright test timing flakiness