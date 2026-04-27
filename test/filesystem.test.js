import { describe, it, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('filesystem protection', () => {
  it('writing to /workspace is allowed', async () => {
    const results = await fetchDemo('filesystem');
    expectAllowed(findResult(results, 'write /workspace'));
  });

  it('reading from /workspace is allowed', async () => {
    const results = await fetchDemo('filesystem');
    const r = findResult(results, 'cat /workspace');
    expectAllowed(r);
    expect(r.result.stdout).toContain('testdata');
  });

  it('reading /etc/hostname is allowed', async () => {
    const results = await fetchDemo('filesystem');
    const r = findResult(results, 'cat /etc/hostname');
    expectAllowed(r);
    expect(r.result.stdout).toBeTruthy();
  });

  it('writing to /etc is blocked', async () => {
    const results = await fetchDemo('filesystem');
    expectBlocked(findResult(results, 'write /etc'));
  });

  it('writing to /usr is blocked', async () => {
    const results = await fetchDemo('filesystem');
    expectBlocked(findResult(results, '/usr/bin'));
  });

  it('mkdir in /etc is blocked', async () => {
    const results = await fetchDemo('filesystem');
    expectBlocked(findResult(results, 'mkdir /etc'));
  });

  it('cp to /etc is blocked', async () => {
    const results = await fetchDemo('filesystem');
    expectBlocked(findResult(results, 'cp /etc'));
  });

  it('symlink escape to /etc/shadow is blocked', async () => {
    const results = await fetchDemo('filesystem');
    expectBlocked(findResult(results, 'shadow-link'));
  });
});
