# Authentication Refresh Race Condition Fix Report

## Confirmed root cause

The frontend had two independent authentication HTTP paths that did not share refresh state:

1. `src/api/client.js` maintained its own `refreshInFlight` / `refreshResolveList` queue, but only API calls routed through `client.js` participated.
2. `src/contexts/AuthContext.jsx` issued `/auth/me` and `/auth/refresh` through a separate `fetch` wrapper and performed its own refresh retry. These calls did not coordinate with `client.js`.

Consequences observed in the Network log:
- Two simultaneous `/auth/me` requests both returned 401.
- Each path triggered its own `/auth/refresh` request with the same HttpOnly refresh cookie.
- Backend refresh-token rotation invalidated the concurrent refresh: one succeeded (200), the other failed (401).
- The projects request was dispatched with a stale access token captured before refresh completed, yielding a 401 even after authentication succeeded.

Additional contributing factor: React StrictMode double-invoked `AuthProvider` initialization, producing duplicate `/auth/me` requests on mount.

## Request sequence

Before:
1. `GET /auth/me` -> 401
2. `GET /auth/me` -> 401
3. `POST /auth/refresh` -> 401
4. `POST /auth/refresh` -> 200
5. `GET /auth/me` -> 200
6. `GET /projects?page_size=100` -> 401

After (page refresh while authenticated):
1. `POST /auth/refresh` -> 200
2. `GET /auth/me` -> 200
3. `GET /projects?page_size=100` -> 200
4. `GET /projects/{id}/photos?page_size=100` -> 200
5. `GET /projects/{id}/documents?page_size=100` -> 200

No transient `/auth/me` 401 remains because initialization now refreshes before fetching `/auth/me` when no in-memory access token exists.

## Files modified

- `src/api/client.js` — unified single-flight refresh, token helpers, proactive refresh wait, retry-once logic, recursive-refresh prevention.
- `src/contexts/AuthContext.jsx` — uses shared client helpers; initialization refreshes before `/auth/me`; module-level guard against duplicate init.
- `src/context/ProjectContext.jsx` — waits for auth initialization before loading projects/documentation.
- `src/api/client.test.js` — regression tests for refresh coordination.
- `src/context/AuthContext.test.jsx` — regression tests for initialization and failed refresh.

## Refresh coordination implementation

- `getAccessToken`, `setAccessToken`, `clearAccessToken` are shared (memory-only).
- `refreshAccessToken()` stores one in-flight promise in `refreshPromise`; concurrent callers receive the same promise.
- `apiRequest()` awaits an in-flight refresh before sending a request, preventing stale-token use.
- On 401, it calls `refreshAccessToken()` once, then retries the original request with the new token and `_retried: true`.
- `_retried` prevents infinite retry loops; a second 401 is propagated.
- `/auth/refresh`, `/auth/login`, and `/auth/register` never trigger recursive refresh.
- Refresh failure clears the access token and propagates an error with the original status.
- Token updates are applied before the shared promise resolves, so waiting requests resume with the new token.

## Regression tests and results

- `src/api/client.test.js`: 5 tests, all passing.
  - Single refresh for concurrent 401s.
  - Failed refresh clears token and rejects without retry.
  - `/auth/refresh` does not recursively trigger refresh.
  - Retry only once even if retry still 401.
  - Refreshed token propagated to waiting requests.
- `src/context/AuthContext.test.jsx`: 2 tests, all passing.
  - Initialization refreshes then fetches `/auth/me` once.
  - Failed refresh transitions to unauthenticated.
- Full suite: 86 tests passing (`npm test`).
- Build: `npm run build` succeeds.

## Browser verification evidence

- Unauthenticated load: one `GET /auth/me` -> 401 and one `POST /auth/refresh` -> 401, then login form renders.
- Login with `admin@local`: `POST /auth/login` -> 200; `GET /projects?page_size=100` -> 200.
- Page refresh while authenticated: `POST /auth/refresh` -> 200, `GET /auth/me` -> 200, `GET /projects?page_size=100` -> 200, documentation requests -> 200.
- Logout: `POST /auth/logout` -> 200.
- No transient 401 for `/projects` or documentation requests after page refresh.

## Remaining limitations

- The initial unauthenticated page load still issues one `/auth/refresh` that returns 401 when no session cookie exists; this is expected and not retried.
- Refresh-token reuse detection on the backend can still revoke a session family if a refresh token is genuinely reused by a different client; frontend coordination prevents same-client races only.
- Browser verification used the dev server and a single admin account; multi-user concurrency was not exercised in the browser.
