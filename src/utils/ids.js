// Backend (Go/Postgres) identifiers are UUIDs. Legacy/offline storage may
// contain generated ids such as "well-179367347637-abc", which are not valid
// backend identifiers and must never be sent to the API.
export function isValidBackendId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}