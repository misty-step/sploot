import { describe, expect, it } from 'vitest'
import { normalizeHttpHostPermission } from './host-permission'

describe('normalizeHttpHostPermission', () => {
  it.each([
    'file:///tmp/sploot',
    'ftp://example.com',
    'chrome://extensions',
    'chrome-extension://abc/popup.html',
    'data:text/html,hello',
    'view-source:https://example.com',
  ])('rejects unsupported scheme %s', rawHost => {
    expect(() => normalizeHttpHostPermission(rawHost, 'host')).toThrow('must use http or https')
  })

  it('normalizes a bare HTTP(S) origin', () => {
    expect(normalizeHttpHostPermission('https://www.sploot.app/', 'host'))
      .toBe('https://www.sploot.app/*')
  })

  it('rejects credentials and paths', () => {
    expect(() => normalizeHttpHostPermission('https://user:pass@example.com', 'host'))
      .toThrow('must be an origin')
    expect(() => normalizeHttpHostPermission('https://example.com/path', 'host'))
      .toThrow('must be an origin')
  })
})
