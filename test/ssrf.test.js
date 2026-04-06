import { describe, it } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('SSRF prevention', () => {
  it('10.0.0.1 is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '10.0.0.1'));
  });

  it('10.255.255.255 is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '10.255.255.255'));
  });

  it('172.16.0.1 is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '172.16.0.1'));
  });

  it('172.31.255.255 is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '172.31.255.255'));
  });

  it('192.168.0.1 is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '192.168.0.1'));
  });

  it('192.168.255.255 is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '192.168.255.255'));
  });

  it('169.254.0.1 link-local is blocked', async () => {
    const results = await fetchDemo('ssrf');
    expectBlocked(findResult(results, '169.254.0.1'));
  });

  it('localhost (127.0.0.1) is allowed', async () => {
    const results = await fetchDemo('ssrf');
    expectAllowed(findResult(results, '127.0.0.1'));
  });

  it('external HTTPS (npm registry) is allowed', async () => {
    const results = await fetchDemo('ssrf');
    expectAllowed(findResult(results, 'registry.npmjs.org'));
  });
});
