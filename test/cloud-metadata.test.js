import { describe, it } from 'vitest';
import { fetchDemo, findResult } from './helpers/sandbox.js';
import { expectBlocked } from './helpers/assertions.js';

describe('cloud metadata blocking', () => {
  it('AWS metadata is blocked', async () => {
    const results = await fetchDemo('cloud-metadata');
    expectBlocked(findResult(results, '169.254.169.254/latest/meta-data'));
  });

  it('GCP metadata is blocked', async () => {
    const results = await fetchDemo('cloud-metadata');
    expectBlocked(findResult(results, 'metadata.google.internal'));
  });

  it('Azure metadata is blocked', async () => {
    const results = await fetchDemo('cloud-metadata');
    expectBlocked(findResult(results, 'api-version'));
  });

  it('DigitalOcean metadata is blocked', async () => {
    const results = await fetchDemo('cloud-metadata');
    expectBlocked(findResult(results, '169.254.169.254/metadata/v1'));
  });

  it('Alibaba metadata is blocked', async () => {
    const results = await fetchDemo('cloud-metadata');
    expectBlocked(findResult(results, '100.100.100.200'));
  });

  it('Oracle metadata is blocked', async () => {
    const results = await fetchDemo('cloud-metadata');
    expectBlocked(findResult(results, 'opc/v2'));
  });
});
