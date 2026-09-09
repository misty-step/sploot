export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out'

/** Public metadata only. Device codes and bearer credentials never cross messages. */
export interface AuthState {
  status: AuthStatus
  instanceUrl: string
  userId?: string
  email?: string
  sessionId?: string
  expiresAt?: number
  pending?: { userCode: string; verificationUriComplete: string; expiresAt: number }
  error?: string
}

export const AUTH_MESSAGES = {
  STATE_CHANGED: 'AUTH_STATE_CHANGED',
  REQUEST_STATE: 'AUTH_REQUEST_STATE',
  SET_INSTANCE: 'AUTH_SET_INSTANCE',
  CONNECT: 'AUTH_CONNECT',
  OPEN_VERIFICATION: 'AUTH_OPEN_VERIFICATION',
  CANCEL: 'AUTH_CANCEL',
  DISCONNECT: 'AUTH_DISCONNECT',
  RUN_DIAGNOSTICS: 'RUN_AUTH_DIAGNOSTICS',
} as const

export interface AuthResponse {
  state?: AuthState
  error?: string
}
