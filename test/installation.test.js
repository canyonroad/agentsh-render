import { describe, it, expect } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';

describe('installation', () => {
  it('agentsh binary is installed and responds', async () => {
    const results = await fetchDemo('status');
    const version = findResult(results, 'agentsh --version');
    expect(version.result.success).toBe(true);
    expect(version.result.stdout).toMatch(/agentsh/i);
    expect(version.result.stdout).toContain('0.18.3');
  });

  it('agentsh detect runs successfully', async () => {
    const results = await fetchDemo('status');
    const detect = findResult(results, 'agentsh detect');
    expect(detect.result.success).toBe(true);
    const output = detect.result.stdout + detect.result.stderr;
    expect(output).toContain('Protection Score');
  });

  it('reports kernel version', async () => {
    const results = await fetchDemo('status');
    const uname = findResult(results, 'uname -r');
    expect(uname.result.success).toBe(true);
    expect(uname.result.stdout).toMatch(/\d+\.\d+/);
  });
});
