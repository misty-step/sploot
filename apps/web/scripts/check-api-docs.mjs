import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function section(source, heading, nextHeading) {
  const start = source.indexOf(heading);
  if (start < 0) throw new Error(`missing docs heading: ${heading}`);
  const end = nextHeading ? source.indexOf(nextHeading, start + heading.length) : source.length;
  if (end < 0) throw new Error(`missing docs heading: ${nextHeading}`);
  return source.slice(start, end);
}

function assertContains(text, fields, label) {
  for (const field of fields) {
    if (!text.includes(`"${field}"`)) throw new Error(`${label}: missing ${field}`);
  }
}

function assertAbsent(text, fields, label) {
  for (const field of fields) {
    if (text.includes(`"${field}"`)) throw new Error(`${label}: stale ${field}`);
  }
}

const AFFECTED_API_HEADINGS = [
  'POST /api/assets',
  'GET /api/assets',
  'GET /api/assets/{id}',
  'PATCH /api/assets/{id}',
  'GET /api/assets/{id}/similar',
  'POST /api/search',
  'POST /api/search/advanced',
  'POST /api/upload',
  'POST /api/upload/url',
  'POST /api/upload/check',
];

export async function checkApiDocs(webRoot) {
  const api = await readFile(resolve(webRoot, 'docs/API.md'), 'utf8');
  const publicApi = await readFile(resolve(webRoot, 'docs/PUBLIC_API.md'), 'utf8');

  for (const heading of AFFECTED_API_HEADINGS) {
    if (!api.includes(`#### ${heading}\n`)) {
      throw new Error(`API.md: affected route is not inventoried: ${heading}`);
    }
  }

  const assets = section(api, '#### GET /api/assets\n', '#### GET /api/assets/{id}\n');
  assertContains(assets, ['thumbnailUrl', 'pathname', 'filename', 'mime', 'createdAt'], 'GET /api/assets');
  assertAbsent(assets, ['mimeType'], 'GET /api/assets');

  const detail = section(api, '#### GET /api/assets/{id}\n', '#### PATCH /api/assets/{id}\n');
  assertContains(detail, ['thumbnailUrl', 'pathname', 'filename', 'mime', 'createdAt'], 'GET /api/assets/{id}');
  assertAbsent(detail, ['mimeType', 'hasEmbedding', 'updatedAt', 'embeddingVector'], 'GET /api/assets/{id}');

  const create = section(api, '#### POST /api/assets\n', '#### GET /api/assets\n');
  assertContains(create, ['thumbnailUrl', 'createdAt', 'embeddingStatus'], 'POST /api/assets');
  if (!create.includes('Success Response (201)') || !create.includes('same safe asset shape is returned with `200`')) {
    throw new Error('POST /api/assets: status contract drift');
  }

  const upload = section(api, '#### POST /api/upload\n', '#### GET /api/piles\n');
  assertContains(upload, ['id', 'blobUrl', 'thumbnailUrl', 'success', 'isDuplicate'], 'POST /api/upload');
  assertAbsent(upload, ['pathname', 'filename', 'mimeType', 'checksum', 'phash', 'nearDuplicate', 'needsEmbedding'], 'POST /api/upload');

  const patch = section(api, '#### PATCH /api/assets/{id}\n', '#### DELETE /api/assets/{id}\n');
  assertContains(patch, ['thumbnailUrl', 'pathname', 'filename', 'mime', 'message'], 'PATCH /api/assets/{id}');
  assertAbsent(patch, ['mimeType'], 'PATCH /api/assets/{id}');

  const similar = section(api, '#### GET /api/assets/{id}/similar\n', '#### DELETE /api/assets/{id}\n');
  assertContains(similar, ['thumbnailUrl', 'filename', 'similarity', 'relevance', 'tags'], 'GET /api/assets/{id}/similar');
  if (!similar.includes('source-unembedded') || !similar.includes('no-neighbors')) {
    throw new Error('GET /api/assets/{id}/similar: reason contract drift');
  }
  assertAbsent(similar, ['embeddingVector', 'image_embedding'], 'GET /api/assets/{id}/similar');

  const search = section(api, '#### POST /api/search\n', '#### GET /api/search\n');
  assertContains(search, ['thumbnailUrl', 'similarity', 'relevance', 'thresholdFallback'], 'POST /api/search');
  assertAbsent(search, ['pathname', 'filename', 'mime', 'createdAt', 'embeddingStatus', 'tags', 'mimeType', 'embedding'], 'POST /api/search');
  if (!search.includes('default: 0.12') || !search.includes('"threshold": 0.12')) {
    throw new Error('POST /api/search: stale similarity threshold default');
  }

  const advanced = section(api, '#### POST /api/search/advanced\n', '### Cache Management\n');
  assertContains(advanced, ['thumbnailUrl', 'similarity', 'relevance', 'pagination', 'seed', 'error'], 'POST /api/search/advanced');
  assertAbsent(advanced, ['pathname', 'filename', 'mime', 'createdAt', 'embeddingStatus', 'mimeType', 'updatedAt', 'embedding'], 'POST /api/search/advanced');
  if (!advanced.includes('default: 0.12')) {
    throw new Error('POST /api/search/advanced: stale similarity threshold default');
  }
  if (!advanced.includes('"similarity": 0.89') || !advanced.includes('"relevance": 89')) {
    throw new Error('POST /api/search/advanced: search example drift');
  }

  const publicSearch = section(publicApi, '## Search\n', '## Rate limits\n');
  assertContains(publicSearch, ['thumbnailUrl', 'similarity', 'relevance', 'requestedLimit', 'requestedThreshold'], 'PUBLIC_API search');
  assertAbsent(publicSearch, ['pathname', 'filename', 'mime', 'createdAt', 'embeddingStatus', 'mimeType', 'embedding', 'embeddingVector', 'image_embedding'], 'PUBLIC_API search');
  if (!publicSearch.includes('default 0.12') || !publicSearch.includes('"threshold": 0.12')) {
    throw new Error('PUBLIC_API search: stale similarity threshold default');
  }

  const publicUpload = section(publicApi, '## Save — upload bytes\n', '## Save — upload by URL\n');
  assertContains(publicUpload, ['id', 'blobUrl', 'thumbnailUrl'], 'PUBLIC_API upload');
  assertAbsent(publicUpload, ['pathname', 'filename', 'mime', 'size', 'checksum', 'phash', 'nearDuplicate', 'needsEmbedding'], 'PUBLIC_API upload');

  return { checked: ['API.md', 'PUBLIC_API.md'] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await checkApiDocs(resolve(import.meta.dirname, '..'));
    console.log('API documentation DTO inventory passed.');
  } catch (error) {
    console.error(`API documentation DTO inventory failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
