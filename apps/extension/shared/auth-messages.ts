export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out'

export interface AuthState {
  status: AuthStatus
  userId?: string | null
  sessionId?: string | null
  expiresAt?: number | null
}

export const AUTH_MESSAGES = {
  STATE_UPDATE: 'AUTH_STATE_UPDATE',
  REQUEST_STATE: 'AUTH_REQUEST_STATE',
  RUN_DIAGNOSTICS: 'RUN_AUTH_DIAGNOSTICS',
} as const

export interface AuthStateUpdateMessage {
  type: typeof AUTH_MESSAGES.STATE_UPDATE
  payload: AuthState
}

export interface AuthStateRequestMessage {
  type: typeof AUTH_MESSAGES.REQUEST_STATE
}

export interface AuthDiagnosticsRequestMessage {
  type: typeof AUTH_MESSAGES.RUN_DIAGNOSTICS
}

export type AuthMessage =
  | AuthStateUpdateMessage
  | AuthStateRequestMessage
  | AuthDiagnosticsRequestMessage
