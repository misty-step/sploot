import { describe, expect, it } from 'vitest';
import { checkApiDocs } from '../../scripts/check-api-docs.mjs';

describe('API documentation DTO inventory', () => {
  it('matches the live canonical route field names', async () => {
    await expect(checkApiDocs(process.cwd())).resolves.toEqual({
      checked: ['API.md', 'PUBLIC_API.md'],
    });
  });
});
