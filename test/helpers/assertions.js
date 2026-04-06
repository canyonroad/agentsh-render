import { expect } from 'vitest';

export function expectBlocked(result) {
  expect(result).toBeDefined();
  const r = result.result || result;
  expect(r.blocked).toBe(true);
  expect(r.success).toBe(false);
}

export function expectAllowed(result) {
  expect(result).toBeDefined();
  const r = result.result || result;
  expect(r.blocked).toBe(false);
  expect(r.success).toBe(true);
}

export function expectCommandOutput(result, expected) {
  expect(result).toBeDefined();
  const r = result.result || result;
  expect(r.success).toBe(true);
  expect(r.stdout).toContain(expected);
}
