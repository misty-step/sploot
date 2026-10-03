/**
 * Published save/search defaults the MCP server tells agents about.
 * packages/common/fixtures/mcp-client.json is the shared check that these
 * match the Go library; this module does not read that file at runtime.
 */

export const SEARCH_DEFAULT_THRESHOLD = 0.12;
export const SEARCH_DEFAULT_LIMIT = 30;

export const PRIVATE_MEDIA_NOTE =
  'blobUrl values starting with /media/ are private references on this Sploot instance. A personal access token cannot download them.';

export const SEARCH_TOOL_DESCRIPTION =
  'Semantic text-to-image search over the personal Sploot meme library. ' +
  'Describe what is in the image in plain words (for example, "distracted boyfriend reaction" or "cat looking judgmental"). ' +
  'This is not a tag or filename lookup. ' +
  `The server default similarity floor is ${SEARCH_DEFAULT_THRESHOLD}, and the server default page size is ${SEARCH_DEFAULT_LIMIT}. ` +
  'A real miss returns zero results. ' +
  'Pass nextCursor as cursor and repeat the same query, limit, threshold, favoriteOnly, and tagId to read the next page. ' +
  PRIVATE_MEDIA_NOTE;

export const SAVE_TOOL_DESCRIPTION =
  'Save an image to the personal Sploot meme library by public URL or by raw base64 bytes. ' +
  'Optional tag names are stored for both kinds of save. ' +
  'A duplicate receipt with isDuplicate true means that exact image is already in the library. ' +
  'Any other conflict, busy response, or unreadable body is an error. ' +
  PRIVATE_MEDIA_NOTE;

export const SEARCH_THRESHOLD_DESCRIPTION =
  `Minimum similarity score from 0 to 1. The server default is ${SEARCH_DEFAULT_THRESHOLD}. Results below it are omitted.`;

export const SEARCH_LIMIT_DESCRIPTION =
  `Maximum number of results in this page. The server default is ${SEARCH_DEFAULT_LIMIT}.`;

export const SEARCH_CURSOR_DESCRIPTION =
  'Opaque nextCursor from the previous page. Repeat the same query, limit, threshold, favoriteOnly, and tagId.';

export const SEARCH_FAVORITE_DESCRIPTION = 'When true, only favorited assets are eligible.';

export const SEARCH_TAG_ID_MAX_LENGTH = 128;

export const SEARCH_TAG_DESCRIPTION =
  `Restrict results to assets carrying this tag id. The server accepts at most ${SEARCH_TAG_ID_MAX_LENGTH} characters.`;

export const SEARCH_OFFSET_DESCRIPTION =
  'Legacy offset for the first 500 results. Do not combine it with cursor.';
