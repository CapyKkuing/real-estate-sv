import { describe, expect, it } from 'vitest'
import { handleMapConfigRequest } from '../src/map-config'

describe('map config', () => {
  it('returns only the browser-required Kakao setting', async () => {
    const response = handleMapConfigRequest(
      new Request('https://example.test/api/map-config'),
      'configured-test-key',
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      provider: 'kakao',
      javascriptKey: 'configured-test-key',
    })
  })

  it('falls back without exposing another binding', async () => {
    const response = handleMapConfigRequest(
      new Request('https://example.test/api/map-config'),
      undefined,
    )
    expect(await response.json()).toEqual({ provider: 'openfreemap' })
  })

  it('rejects non-GET methods', () => {
    const response = handleMapConfigRequest(
      new Request('https://example.test/api/map-config', { method: 'POST' }),
      'configured-test-key',
    )
    expect(response.status).toBe(405)
  })
})
