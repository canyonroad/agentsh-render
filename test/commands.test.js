import { describe, it, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked, expectAllowed } from './helpers/assertions.js';

describe('command blocking', () => {
  it('sudo is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'sudo'));
  });

  it('su is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'su -c'));
  });

  it('ssh is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'ssh'));
  });

  it('scp is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'scp'));
  });

  it('nc is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'nc -h'));
  });

  it('nmap is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'nmap'));
  });

  it('mount is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'mount'));
  });

  it('pkill is blocked', async () => {
    const results = await fetchDemo('commands');
    expectBlocked(findResult(results, 'pkill'));
  });

  it('echo is allowed', async () => {
    const results = await fetchDemo('commands');
    expectAllowed(findResult(results, 'echo'));
  });
});
