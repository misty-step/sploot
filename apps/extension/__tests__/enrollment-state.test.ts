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
  ])('fails closed for impossible public state %#', (payload) => {
    expect(parsePublicEnrollmentState(payload)).toBeNull()
  })

  it('fails closed for unavailable and network-failed public reads', async () => {
    const unavailable = await loadPublicEnrollmentState('/api/health/enrollment', async () => new Response('', { status: 503 }))
    expect(unavailable).toBeNull()

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
