import { describe, expect, it } from 'vitest';
import { analyzeTypeScriptSource, inspectAssetGridInventory, inspectRouteSource } from '../../scripts/check-asset-grid-dto.mjs';

describe('asset grid AST inventory', () => {
  it('does not count mapper names in comments or strings', () => {
    const analysis = analyzeTypeScriptSource(`
      // normalizeAssetToGridDto(fake)
      const text = 'normalizeAssetToGridDto(fake)';
      export const value = { text };
    `);
    expect(analysis.calls.get('normalizeAssetToGridDto')).toBeUndefined();
  });

  it('counts executable mapper calls and response nodes', () => {
    const analysis = analyzeTypeScriptSource(`
      import { normalizeAssetToGridDto } from '@/lib/asset-grid-dto';
      const asset = normalizeAssetToGridDto(row);
      return NextResponse.json({ asset });
    `);
    expect(analysis.importedNames.has('normalizeAssetToGridDto')).toBe(true);
    expect(analysis.calls.get('normalizeAssetToGridDto')).toBe(1);
    expect(analysis.responseCalls).toBe(1);
  });

  it('fails closed for a planted public raw response', () => {
    const result = inspectRouteSource(`
      import { NextResponse } from 'next/server';
      const asset = { id: 'x', embedding: { dim: 768 } };
      export function GET() { return NextResponse.json(asset); }
    `, 'app/api/planted/route.ts', 'public');
    expect(result.failures.join('\n')).toMatch(/raw\/untyped|private field embedding/);
  });

  it('audits the live route/query call graph', async () => {
    const result = await inspectAssetGridInventory(process.cwd());
    expect(result.failures).toEqual([]);
  });
});
