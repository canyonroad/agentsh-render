import { describe, it, expect } from 'vitest';
import { fetchDemo } from './helpers/sandbox.js';

describe('DLP configuration', () => {
  it('DLP endpoint returns results', async () => {
    const data = await fetchDemo('dlp');
    expect(data).toBeDefined();
    expect(data.results || data).toBeTruthy();
  });

  it('DLP endpoint includes description', async () => {
    const data = await fetchDemo('dlp');
    expect(data.description).toContain('DLP');
  });

  it('DLP endpoint includes note about API proxy', async () => {
    const data = await fetchDemo('dlp');
    expect(data.note).toContain('proxy');
  });

  it('commands execute with test secrets', async () => {
    const data = await fetchDemo('dlp');
    const results = data.results || data;
    expect(results.length).toBeGreaterThanOrEqual(3);
  });
});
