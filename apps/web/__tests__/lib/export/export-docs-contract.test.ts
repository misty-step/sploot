import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET, TAG } from '@sploot/common';
import { EXPORT_EGRESS_FACTOR, EXPORT_EGRESS_SLACK_BYTES, EXPORT_EGRESS_METADATA_PER_ASSET_BYTES, EXPORT_EGRESS_WINDOW_FACTOR } from '@/lib/export/export-policy';

const docs = resolve(process.cwd(), 'docs');

describe('export documentation contract', () => {
  it('keeps the documented allowance formula and bounds aligned with policy', async () => {
    const exportDoc = await readFile(resolve(docs, 'EXPORT.md'), 'utf8');
    const apiDoc = await readFile(resolve(docs, 'API.md'), 'utf8');
    const formula = '`' + EXPORT_EGRESS_FACTOR + ' × (totalOriginalBytes + ' + EXPORT_EGRESS_METADATA_PER_ASSET_BYTES.toLocaleString('en-US') + ' × totalAssets + measuredManifestMetadataBytes) + ' + EXPORT_EGRESS_SLACK_BYTES / (1024 * 1024) + ' MB`';
    expect(exportDoc).toContain(formula);
    expect(exportDoc).toContain('at most `' + EXPORT_EGRESS_WINDOW_FACTOR + ' ×` one export allowance');
    expect(apiDoc).toContain('at most ' + TAG.maxRequestItems + ' tag IDs and ' + TAG.maxRequestItems + ' tag names');
    expect(exportDoc).toContain('at most ' + TAG.maxNameLength + ' characters');
    expect(exportDoc).toContain('at most ' + ASSET.maxIdLength + ' characters');
  });
});
