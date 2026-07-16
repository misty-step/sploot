import { isSplootEnrollmentPublicState, type SplootEnrollmentPublicState } from '@sploot/common'

export function parsePublicEnrollmentState(payload: unknown): SplootEnrollmentPublicState | null {
  return isSplootEnrollmentPublicState(payload) ? payload : null
}

export async function loadPublicEnrollmentState(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<SplootEnrollmentPublicState | null> {
  try {
    const response = await fetcher(url, { cache: 'no-store' })
    const state = parsePublicEnrollmentState(await response.json())
    if (!state) return null
    // A non-ok read (503 database-unavailable) still carries the honest
    // paused/unknown body; only an 'open' claim requires a healthy response.
    if (!response.ok && state.status === 'open') return null
    return state
  } catch {
    return null
  }
}
