function appendKakaoScript({ document, javascriptKey }) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(javascriptKey)}&autoload=false&libraries=services`
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export async function loadMapProvider({ fetchImpl = fetch, document, window }) {
  try {
    const response = await fetchImpl('/api/map-config', { cache: 'no-store' })
    if (!response.ok) throw new Error('map-config')
    const config = await response.json()
    if (config.provider !== 'kakao' || !config.javascriptKey) throw new Error('map-config')

    await appendKakaoScript({ document, javascriptKey: config.javascriptKey })
    await new Promise(resolve => window.kakao.maps.load(resolve))
    return { provider: 'kakao', kakao: window.kakao }
  } catch {
    return { provider: 'openfreemap', reason: 'kakao-unavailable' }
  }
}
