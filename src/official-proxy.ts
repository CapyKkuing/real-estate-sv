const PROXY_HOSTS = new Set(["api.vworld.kr", "www.law.go.kr"])

type OfficialProxyOptions = {
  readonly proxyUrl?: string
  readonly token?: string
  readonly fetchUpstream?: typeof fetch
}

function isOfficialUrl(url: URL): boolean {
  return url.protocol === "https:" && PROXY_HOSTS.has(url.hostname)
}

function proxyError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

export function createOfficialProxyFetch({
  proxyUrl,
  token,
  fetchUpstream = fetch,
}: OfficialProxyOptions = {}): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const target = new URL(request.url)
    if (!isOfficialUrl(target)) return fetchUpstream(input, init)
    if (request.method !== "GET") return proxyError("공식 데이터 요청 방식이 올바르지 않습니다.", 405)
    if (!proxyUrl || !token) return proxyError("공식 데이터 중계 서버가 설정되지 않았습니다.", 503)

    let endpoint: URL
    try {
      endpoint = new URL("/v1/official-fetch", proxyUrl)
    } catch {
      return proxyError("공식 데이터 중계 서버 주소가 올바르지 않습니다.", 503)
    }

    return fetchUpstream(new Request(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: target.toString(),
        accept: request.headers.get("Accept") ?? "application/json",
      }),
    }))
  }
}
