import { getQaProofRequestContext, verifyQaLocalAuthHeaders } from './qa-gallery-local';

export async function verifyQaEvidence(headers: Headers, host?: string) {
  const requestContext = {
    ...getQaProofRequestContext(headers),
    ...(host ? { host } : {}),
  };
  return verifyQaLocalAuthHeaders(headers, process.env, requestContext);
}
