export function assert(condition, name) {
  if (condition) { console.log(`  PASS: ${name}`); return true; }
  console.log(`  FAIL: ${name}`);
  return false;
}
export function describe(name, fn) { console.log(`\n=== ${name} ===`); fn(); }
export function it(name, fn) { fn(); }
