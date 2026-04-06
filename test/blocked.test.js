import { describe, it } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked } from './helpers/assertions.js';

describe('blocked commands', () => {
  it('nc is blocked', async () => {
    const results = await fetchDemo('blocked');
    const r = findResult(results, 'nc');
    expectBlocked(r);
  });

  it('nmap is blocked', async () => {
    const results = await fetchDemo('blocked');
    const r = findResult(results, 'nmap');
    expectBlocked(r);
  });

  it('cloud metadata is blocked', async () => {
    const results = await fetchDemo('blocked');
    const r = findResult(results, '169.254.169.254');
    expectBlocked(r);
  });
});
