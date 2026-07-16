import { describe, expect, it } from 'vitest'
import { loadPublicEnrollmentState, parsePublicEnrollmentState } from '../shared/enrollment-state'

describe('public enrollment popup seam', () => {
  it('accepts only the safe public state shape', () => {
    expect(parsePublicEnrollmentState({ status: 'open', mode: 'ga', configuration: 'valid' })).toEqual({
      status: 'open',
      mode: 'ga',
      configuration: 'valid',
    })
  })

  it('fails closed for malformed, nested, and diagnostic payloads', () => {
    expect(parsePublicEnrollmentState({ status: 'open', mode: 'ga' })).toBeNull()
    expect(parsePublicEnrollmentState({ publicState: { status: 'open', mode: 'ga', configuration: 'valid' } })).toBeNull()
    expect(parsePublicEnrollmentState({ status: 'open', mode: 'ga', configuration: 'valid', accountCount: 1 })).toBeNull()
    expect(parsePublicEnrollmentState({ status: 'paused', mode: 'closed', configuration: 'invalid' })).toEqual({
      status: 'paused',
      mode: 'closed',
      configuration: 'invalid',
    })
  })

  it.each([
    { status: 'open', mode: 'closed', configuration: 'valid' },
    { status: 'open', mode: 'ga', configuration: 'invalid' },
    { status: 'paused', mode: 'capped', configuration: 'invalid' },
    { status: 'paused', mode: 'closed', configuration: 'invalid', extra: true },
    { status: 'unknown', mode: 'closed', configuration: 'valid' },
    { status: 'unknown', mode: 'ga', configuration: 'invalid' },
    { status: 'unknown', mode: 'closed', configuration: 'invalid' },
  ])('fails closed for impossible public state %#', (payload) => {
    expect(parsePublicEnrollmentState(payload)).toBeNull()
  })

  it('accepts the distinct unknown state for a database-unavailable read', () => {
    expect(parsePublicEnrollmentState({ status: 'unknown', mode: 'capped', configuration: 'valid' })).toEqual({
      status: 'unknown',
      mode: 'capped',
      configuration: 'valid',
    })
    expect(parsePublicEnrollmentState({ status: 'unknown', mode: 'ga', configuration: 'valid' })).toEqual({
      status: 'unknown',
      mode: 'ga',
      configuration: 'valid',
    })
  })

  it('keeps the unavailable read distinct instead of discarding or mislabeling it', async () => {
    // A 503 carrying the honest unknown state is preserved, not dropped.
    const unavailable = await loadPublicEnrollmentState('/api/health/enrollment', async () => new Response(JSON.stringify({
      status: 'unknown',
      mode: 'ga',
      configuration: 'valid',
    }), { status: 503, headers: { 'content-type': 'application/json' } }))
    expect(unavailable).toEqual({ status: 'unknown', mode: 'ga', configuration: 'valid' })

    // A non-ok response may never smuggle in an open state.
    const smuggledOpen = await loadPublicEnrollmentState('/api/health/enrollment', async () => new Response(JSON.stringify({
      status: 'open',
      mode: 'ga',
      configuration: 'valid',
    }), { status: 503, headers: { 'content-type': 'application/json' } }))
    expect(smuggledOpen).toBeNull()

    const emptyUnavailable = await loadPublicEnrollmentState('/api/health/enrollment', async () => new Response('', { status: 503 }))
    expect(emptyUnavailable).toBeNull()

    const networkFailure = await loadPublicEnrollmentState('/api/health/enrollment', async () => {
      throw new Error('offline')
    })
    expect(networkFailure).toBeNull()
  })

  it('synchronizes a validated paused state instead of retaining stale open state', async () => {
    const paused = await loadPublicEnrollmentState('/api/health/enrollment', async () => new Response(JSON.stringify({
      status: 'paused',
      mode: 'capped',
      configuration: 'valid',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    expect(paused).toEqual({ status: 'paused', mode: 'capped', configuration: 'valid' })
  })
})
