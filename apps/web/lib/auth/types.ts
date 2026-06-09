export type AuthProvider = 'clerk' | 'qa-local';
export type AuthSource = 'clerk-request' | 'qa-local';
export type AuthCredentialKind = 'cookie-or-bearer' | 'qa-local';
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
  env?: Record<string, string | undefined>;
}
