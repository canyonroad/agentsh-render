import { describe, it, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectAllowed } from './helpers/assertions.js';

describe('development tools', () => {
  it('python3 is available', async () => {
    const results = await fetchDemo('devtools');
    const r = findResult(results, 'python3');
    expectAllowed(r);
    expect(r.result.stdout).toContain('Python');
  });

  it('node is available', async () => {
    const results = await fetchDemo('devtools');
    const r = findResult(results, 'node');
    expectAllowed(r);
    expect(r.result.stdout).toMatch(/v\d+/);
  });

  it('git is available', async () => {
    const results = await fetchDemo('devtools');
    const r = findResult(results, 'git');
    expectAllowed(r);
    expect(r.result.stdout).toContain('git version');
  });

  it('curl is available', async () => {
    const results = await fetchDemo('devtools');
    const r = findResult(results, 'curl --version');
    expectAllowed(r);
    expect(r.result.stdout).toContain('curl');
  });

  it('pip3 is available', async () => {
    const results = await fetchDemo('devtools');
    const r = findResult(results, 'pip3');
    expectAllowed(r);
    expect(r.result.stdout).toContain('pip');
  });

  it('shell pipes work', async () => {
    const results = await fetchDemo('devtools');
    const r = findResult(results, 'grep hello');
    expectAllowed(r);
    expect(r.result.stdout).toContain('hello');
  });
});
