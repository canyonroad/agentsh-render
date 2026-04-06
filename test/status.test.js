import { describe, it, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';

describe('agentsh status', () => {
  it('detect shows protection score', async () => {
    const results = await fetchDemo('status');
    const detect = findResult(results, 'agentsh detect');
    const output = detect.result.stdout + detect.result.stderr;
    expect(output).toContain('Protection Score');
  });

  it('detect shows seccomp support', async () => {
    const results = await fetchDemo('status');
    const detect = findResult(results, 'agentsh detect');
    const output = detect.result.stdout + detect.result.stderr;
    expect(output).toMatch(/seccomp/i);
  });

  it('detect shows file protection', async () => {
    const results = await fetchDemo('status');
    const detect = findResult(results, 'agentsh detect');
    const output = detect.result.stdout + detect.result.stderr;
    expect(output).toContain('FILE PROTECTION');
  });

  it('detect shows command control', async () => {
    const results = await fetchDemo('status');
    const detect = findResult(results, 'agentsh detect');
    const output = detect.result.stdout + detect.result.stderr;
    expect(output).toContain('COMMAND CONTROL');
  });

  it('detect shows network section', async () => {
    const results = await fetchDemo('status');
    const detect = findResult(results, 'agentsh detect');
    const output = detect.result.stdout + detect.result.stderr;
    expect(output).toContain('NETWORK');
  });
});
