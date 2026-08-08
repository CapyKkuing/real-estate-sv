import { describe, expect, it } from "vitest"
import { createOfficialProxyFetch } from "../src/official-proxy"

describe("official API proxy fetch", () => {
  it("sends the law API through the authenticated proxy", async () => {
    let proxiedRequest: Request | undefined
    const fetchUpstream: typeof fetch = async (input, init) => {
      proxiedRequest = new Request(input, init)
      return Response.json({ ok: true })
    }
    const proxyFetch = createOfficialProxyFetch({
      proxyUrl: "https://official-proxy.example.com",
      token: "proxy-token",
      fetchUpstream,
    })

    const response = await proxyFetch(
      "https://www.law.go.kr/DRF/lawSearch.do?OC=provider-key",
      { headers: { Accept: "application/json", "User-Agent": "real-estate-sv/1.0" } },
    )

    expect(response.status).toBe(200)
    expect(proxiedRequest).toBeInstanceOf(Request)
    if (!proxiedRequest) throw new Error("proxy request was not sent")
    expect(new URL(proxiedRequest.url)).toMatchObject({
      origin: "https://official-proxy.example.com",
      pathname: "/v1/official-fetch",
    })
    expect(proxiedRequest.headers.get("Authorization")).toBe("Bearer proxy-token")
    await expect(proxiedRequest.json()).resolves.toEqual({
      url: "https://www.law.go.kr/DRF/lawSearch.do?OC=provider-key",
      accept: "application/json",
    })
  })

  it("calls VWorld directly without proxy configuration", async () => {
    let directRequest: Request | undefined
    const fetchUpstream: typeof fetch = async (input, init) => {
      directRequest = new Request(input, init)
      return new Response("direct")
    }
    const proxyFetch = createOfficialProxyFetch({ fetchUpstream })

    const response = await proxyFetch(
      "https://api.vworld.kr/ned/data/getLandUseAttr?key=provider-key&domain=example.com&pnu=1126010200100830008",
      { headers: { Accept: "application/json" } },
    )

    expect(await response.text()).toBe("direct")
    expect(directRequest?.url).toBe("https://api.vworld.kr/ned/data/getLandUseAttr?key=provider-key&domain=example.com&pnu=1126010200100830008")
  })

  it("does not proxy non-official destinations", async () => {
    let directInput: RequestInfo | URL | undefined
    let directInit: RequestInit | undefined
    const fetchUpstream: typeof fetch = async (input, init) => {
      directInput = input
      directInit = init
      return new Response("direct")
    }
    const proxyFetch = createOfficialProxyFetch({
      proxyUrl: "https://official-proxy.example.com",
      token: "proxy-token",
      fetchUpstream,
    })

    const response = await proxyFetch("https://example.com/data")

    expect(await response.text()).toBe("direct")
    expect(directInput).toBe("https://example.com/data")
    expect(directInit).toBeUndefined()
  })

  it("calls the public data portal directly without proxy configuration", async () => {
    let directRequest: Request | undefined
    const fetchUpstream: typeof fetch = async (input, init) => {
      directRequest = new Request(input, init)
      return new Response("direct")
    }
    const proxyFetch = createOfficialProxyFetch({ fetchUpstream })

    const response = await proxyFetch("https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev?serviceKey=provider-key")

    expect(await response.text()).toBe("direct")
    expect(directRequest).toBeInstanceOf(Request)
    expect(directRequest?.url).toContain("https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev")
  })

  it("does not make an official request when proxy configuration is missing", async () => {
    const fetchUpstream: typeof fetch = async () => {
      throw new Error("unexpected upstream request")
    }
    const proxyFetch = createOfficialProxyFetch({ fetchUpstream })

    const response = await proxyFetch("https://www.law.go.kr/DRF/lawSearch.do?OC=provider-key")

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: "공식 데이터 중계 서버가 설정되지 않았습니다." })
  })

  it("does not proxy non-GET requests to the law provider", async () => {
    const fetchUpstream: typeof fetch = async () => {
      throw new Error("unexpected upstream request")
    }
    const proxyFetch = createOfficialProxyFetch({
      proxyUrl: "https://official-proxy.example.com",
      token: "proxy-token",
      fetchUpstream,
    })

    const response = await proxyFetch("https://www.law.go.kr/DRF/lawSearch.do", {
      method: "POST",
    })

    expect(response.status).toBe(405)
  })
})
