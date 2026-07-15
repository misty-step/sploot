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
    if (!response.ok) return null
    return parsePublicEnrollmentState(await response.json())
  } catch {
    return null
  }
}
