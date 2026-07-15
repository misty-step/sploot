export type AuthProvider = 'clerk' | 'qa-local' | 'upload-token';
export type AuthSource = 'clerk-request' | 'qa-local' | 'upload-token';
export type AuthCredentialKind = 'cookie-or-bearer' | 'qa-local' | 'upload-token';
export type AuthSyncStatus = 'success' | 'failed' | 'skipped';
export type AuthFailureCode =
  | 'identity_missing'
  | 'identity_mismatch'
  | 'sync_unavailable'
  | 'sync_conflict';

export interface AuthenticatedPrincipal {
  userId: string;
  provider: AuthProvider;
  providerSubject: string;
  source: AuthSource;
  credentialKind: AuthCredentialKind;
  sessionId?: string | null;
  email?: string;
}

export interface AuthenticatedResult {
  status: 'authenticated';
  principal: AuthenticatedPrincipal;
  syncStatus: AuthSyncStatus;
  syncError?: string;
}

export interface UnauthenticatedResult {
  status: 'unauthenticated';
  reason: string;
}

export interface ForbiddenAuthResult {
  status: 'forbidden';
  reason: string;
}

export interface AuthBoundaryFailureResult {
  status: 'boundary-failure';
  code: AuthFailureCode;
  httpStatus: 401 | 409 | 503;
  retryable: boolean;
  reason: string;
}

export type RequestAuthResult =
  | AuthenticatedResult
  | UnauthenticatedResult
  | ForbiddenAuthResult
  | AuthBoundaryFailureResult;

export interface AuthPolicy {
  allowClerk?: boolean;
  allowQaLocal?: boolean;
  /**
   * Accept a personal upload token (`Authorization: Bearer splt_…`).
   * Defaults false — only the upload routes opt in, which is what makes the
   * token upload-only. See lib/auth/upload-token.ts.
   */
  allowUploadToken?: boolean;
  requireUserSync?: boolean;
  /** Browser-navigation policy used by the authenticated share target. */
  unauthenticated?: 'json' | 'sign-in-redirect';
  env?: Record<string, string | undefined>;
}
