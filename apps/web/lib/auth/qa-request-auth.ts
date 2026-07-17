import * as qaLocalPwa from './qa-local';
import * as qaLocalGallery from './qa-gallery-local';

export async function resolveQaLocalRequestAuth(
  headers: Headers,
  env: Record<string, string | undefined>,
  host?: string,
) {
  if (env.SPLOOT_QA_EVIDENCE_MODE === 'enabled') {
    if (!qaLocalGallery.hasQaLocalAuthInput(headers)) return null;
    const requestContext = {
      ...qaLocalGallery.getQaProofRequestContext(headers),
      host: host || qaLocalGallery.getQaProofRequestContext(headers).host,
    };
    return qaLocalGallery.verifyQaLocalAuthHeaders(headers, env, requestContext);
  }

  return qaLocalPwa.resolveQaLocalRequestAuth(headers, env);
}
