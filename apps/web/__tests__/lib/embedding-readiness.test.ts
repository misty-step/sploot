import { describe, expect, it } from 'vitest';
import { embeddingReadinessLabel } from '@/lib/embedding-readiness';

describe('meme detail embedding readiness UI', () => {
  it.each([
    ['ready', 'embedding ready'],
    ['pending', 'embedding pending'],
    ['processing', 'embedding processing'],
    ['failed', 'embedding failed'],
    ['unavailable', 'embedding unavailable'],
  ] as const)('renders %s from the public embeddingStatus', (status, label) => {
    expect(embeddingReadinessLabel(status)).toBe(label);
  });

  it('defaults missing status to pending and never needs internal embedding data', () => {
    expect(embeddingReadinessLabel(undefined)).toBe('embedding pending');
  });
});
