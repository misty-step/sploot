import { getQaProofRequestContext, hasQaLocalAuthInput, verifyQaLocalAuthHeaders } from './qa-local';

export async function resolveQaLocalRequestAuth(
  headers: Headers,
  env: Record<string, string | undefined>,
  host?: string,
) {
  if (!hasQaLocalAuthInput(headers)) return null;
  const requestContext = {
    ...getQaProofRequestContext(headers),
    host: host || getQaProofRequestContext(headers).host,
  };
  return verifyQaLocalAuthHeaders(headers, env, requestContext);
}
