import { describe, it, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectAllowed, expectCommandOutput } from './helpers/assertions.js';

describe('allowed commands', () => {
  it('whoami succeeds', async () => {
    const results = await fetchDemo('allowed');
    const r = findResult(results, 'whoami');
    expectAllowed(r);
    expect(r.result.stdout).toBeTruthy();
  });

  it('pwd returns workspace', async () => {
    const results = await fetchDemo('allowed');
    const r = findResult(results, 'pwd');
    expectAllowed(r);
    expect(r.result.stdout).toContain('/workspace');
  });

  it('ls /workspace succeeds', async () => {
    const results = await fetchDemo('allowed');
    const r = findResult(results, 'ls /workspace');
    expectAllowed(r);
  });

  it('echo works', async () => {
    const results = await fetchDemo('allowed');
    const r = findResult(results, 'echo');
    expectCommandOutput(r, 'hello world');
  });
});
