export type AuthProvider = 'clerk' | 'qa-local' | 'personal-upload-token';
export type AuthSource = 'clerk-request' | 'qa-local' | 'personal-upload-token';
export type AuthCredentialKind = 'cookie-or-bearer' | 'qa-local' | 'personal-upload-token';
export type AuthSyncStatus = 'success' | 'failed' | 'skipped';

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

export type RequestAuthResult =
  | AuthenticatedResult
  | UnauthenticatedResult
  | ForbiddenAuthResult;

export interface AuthPolicy {
  allowClerk?: boolean;
  allowQaLocal?: boolean;
  requireUserSync?: boolean;
  allowPersonalUploadToken?: boolean;
  env?: Record<string, string | undefined>;
}
