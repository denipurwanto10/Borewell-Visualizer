import { describe, it, expect } from 'vitest';
import { isValidBackendId } from './ids';

describe('isValidBackendId', () => {
  it('accepts UUIDs', () => {
    expect(isValidBackendId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidBackendId('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('rejects generated offline ids', () => {
    expect(isValidBackendId('well-179367347637-abc')).toBe(false);
    expect(isValidBackendId('proj-123-xyz')).toBe(false);
  });

  it('rejects non-string and empty values', () => {
    expect(isValidBackendId(null)).toBe(false);
    expect(isValidBackendId(undefined)).toBe(false);
    expect(isValidBackendId('')).toBe(false);
    expect(isValidBackendId(123)).toBe(false);
  });
});