import { describe, expect, it, vi } from 'vitest'
import { loadMapProvider } from '../site/map-loader.js'

function createScriptDocument(onAppend = () => {}) {
  return {
    lastScript: undefined,
    createElement: vi.fn(() => ({})),
    head: {
      appendChild(script) {
        this.owner.lastScript = script
        onAppend()
        script.onload?.()
      },
      owner: undefined,
    },
  }
}

describe('map loader', () => {
  it('loads Kakao with services and waits for maps.load', async () => {
    const load = vi.fn(callback => callback())
    const window = { kakao: { maps: { load } } }
    const document = createScriptDocument(() => window.kakao)
    document.head.owner = document
    const result = await loadMapProvider({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({ provider: 'kakao', javascriptKey: 'configured-test-key' }),
      })),
      document,
      window,
    })

    expect(document.lastScript.src).toContain('libraries=services')
    expect(document.lastScript.src).toContain('autoload=false')
    expect(load).toHaveBeenCalledOnce()
    expect(result.provider).toBe('kakao')
  })

  it('returns OpenFreeMap when config or script loading fails', async () => {
    const document = createScriptDocument()
    document.head.owner = document
    const result = await loadMapProvider({
      fetchImpl: vi.fn(async () => ({ ok: false })),
      document,
      window: {},
    })
    expect(result.provider).toBe('openfreemap')
  })
})
