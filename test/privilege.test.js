import { describe, it } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked } from './helpers/assertions.js';

describe('privilege escalation', () => {
  it('sudo is blocked', async () => {
    const results = await fetchDemo('privilege-escalation');
    expectBlocked(findResult(results, 'sudo'));
  });

  it('su is blocked', async () => {
    const results = await fetchDemo('privilege-escalation');
    expectBlocked(findResult(results, 'su -'));
  });

  it('reading /etc/shadow is blocked', async () => {
    const results = await fetchDemo('privilege-escalation');
    expectBlocked(findResult(results, '/etc/shadow'));
  });

  it('writing /etc/sudoers is blocked', async () => {
    const results = await fetchDemo('privilege-escalation');
    expectBlocked(findResult(results, '/etc/sudoers'));
  });

  it('chroot is blocked', async () => {
    const results = await fetchDemo('privilege-escalation');
    expectBlocked(findResult(results, 'chroot'));
  });

  it('nsenter is blocked', async () => {
    const results = await fetchDemo('privilege-escalation');
    expectBlocked(findResult(results, 'nsenter'));
  });
});
