import { describe, it } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('network filtering', () => {
  it('evil.com is blocked', async () => {
    const results = await fetchDemo('network');
    expectBlocked(findResult(results, 'evil.com'));
  });

  it('private network 10.0.0.1 is blocked', async () => {
    const results = await fetchDemo('network');
    expectBlocked(findResult(results, '10.0.0.1'));
  });

  it('metadata service is blocked', async () => {
    const results = await fetchDemo('network');
    expectBlocked(findResult(results, '169.254.169.254'));
  });

  it('localhost is allowed', async () => {
    const results = await fetchDemo('network');
    expectAllowed(findResult(results, '127.0.0.1'));
  });

  it('npm registry is allowed', async () => {
    const results = await fetchDemo('network');
    expectAllowed(findResult(results, 'registry.npmjs.org'));
  });
});
