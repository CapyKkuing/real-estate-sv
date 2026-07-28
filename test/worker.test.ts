import { describe, expect, it, vi } from "vitest"
import { createWorkerHandler, handleApiRequest, routeRequest } from "../src/worker"
import type { ApiDependencies } from "../src/worker"
import type { SnapshotDatabase, SnapshotStatement } from "../src/transaction-store"

const secret = "test-secret"

function apiRequest(query: string, method = "GET") {
  return new Request(`https://example.com/api/real-estate?${query}`, { method })
}

type DependencyOverrides = Omit<Partial<ApiDependencies>, "serviceKey" | "fetchUpstream">

function dependencies(
  fetchUpstream: ApiDependencies["fetchUpstream"],
  overrides: DependencyOverrides = {},
): ApiDependencies {
  return { serviceKey: secret, fetchUpstream, ...overrides }
}

function emptyDatabase(): SnapshotDatabase {
  return {
    prepare() {
      const statement: SnapshotStatement = {
        bind() {
          return statement
        },
        async run() {
          return { success: true }
        },
        async all() {
          return { results: [] }
        },
      }
      return statement
    },
  }
}

describe("handleApiRequest", () => {
  it("routes an apartment request to the fixed MOLIT endpoint with the secret", async () => {
    const fetchUpstream = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) =>
      Response.json({ response: { header: { resultCode: "000" } } }),
    )

    const response = await handleApiRequest(
      apiRequest("type=apt&lawdCd=11680&dealYmd=202606"),
      dependencies(fetchUpstream),
    )

    expect(response.status).toBe(200)
    expect(fetchUpstream).toHaveBeenCalledOnce()
    const upstreamUrl = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(upstreamUrl.hostname).toBe("apis.data.go.kr")
    expect(upstreamUrl.pathname).toBe(
      "/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
    )
    expect(upstreamUrl.searchParams.get("serviceKey")).toBe(secret)
    expect(upstreamUrl.searchParams.get("LAWD_CD")).toBe("11680")
    expect(upstreamUrl.searchParams.get("DEAL_YMD")).toBe("202606")
    expect(upstreamUrl.searchParams.get("_type")).toBe("json")
    expect(upstreamUrl.searchParams.get("numOfRows")).toBe("100")
  })

  it("routes a factory and warehouse request to the official MOLIT endpoint", async () => {
    const fetchUpstream = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) =>
      Response.json({ response: { header: { resultCode: "000" } } }),
    )

    const response = await handleApiRequest(
      apiRequest("type=fact&lawdCd=11680&dealYmd=202606"),
      dependencies(fetchUpstream),
    )

    expect(response.status).toBe(200)
    const upstreamUrl = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(upstreamUrl.pathname).toBe(
      "/1613000/RTMSDataSvcInduTrade/getRTMSDataSvcInduTrade",
    )
  })

  it("returns 429 without calling upstream when the client exceeds the rate limit", async () => {
    const fetchUpstream = vi.fn()
    const rateLimiter = {
      limit: vi.fn(async () => ({ success: false })),
    }

    const response = await handleApiRequest(
      new Request("https://example.com/api/real-estate?type=apt&lawdCd=11680&dealYmd=202606", {
        headers: { "CF-Connecting-IP": "203.0.113.10" },
      }),
      dependencies(fetchUpstream, { rateLimiter }),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("60")
    await expect(response.json()).resolves.toEqual({
      error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    })
    expect(rateLimiter.limit).toHaveBeenCalledWith({ key: "real-estate:203.0.113.10" })
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("returns 503 without calling upstream when the rate limiter fails", async () => {
    const fetchUpstream = vi.fn()
    const rateLimiter = {
      limit: vi.fn(async () => {
        throw new Error("rate limiter unavailable")
      }),
    }

    const response = await handleApiRequest(
      apiRequest("type=apt&lawdCd=11680&dealYmd=202606"),
      dependencies(fetchUpstream, { rateLimiter }),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "요청 제한 서비스를 사용할 수 없습니다.",
    })
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("sanitizes non-OK upstream responses while preserving their status", async () => {
    const fetchUpstream = vi.fn(async () =>
      new Response(`serviceKey=${secret}&error=upstream details`, { status: 503 }),
    )

    const response = await handleApiRequest(
      apiRequest("type=apt&lawdCd=11680&dealYmd=202606"),
      dependencies(fetchUpstream),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const body = await response.text()
    expect(body).toBe(JSON.stringify({ error: "국토부 API 요청이 실패했습니다." }))
    expect(body).not.toContain(secret)
  })

  it.each([
    "type=unknown&lawdCd=11680&dealYmd=202606",
    "type=apt&lawdCd=1168&dealYmd=202606",
    "type=apt&lawdCd=11680&dealYmd=202613",
    "type=apt&lawdCd=11680&dealYmd=not-a-month",
  ])("rejects invalid query parameters: %s", async (query) => {
    const fetchUpstream = vi.fn()

    const response = await handleApiRequest(apiRequest(query), dependencies(fetchUpstream))

    expect(response.status).toBe(400)
    expect(fetchUpstream).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: "요청 값을 확인해 주세요." })
  })

  it("rejects methods other than GET", async () => {
    const fetchUpstream = vi.fn()

    const response = await handleApiRequest(
      apiRequest("type=apt&lawdCd=11680&dealYmd=202606", "POST"),
      dependencies(fetchUpstream),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get("Allow")).toBe("GET")
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("returns a sanitized 502 response when the upstream transport fails", async () => {
    const fetchUpstream = vi.fn(async () => {
      throw new Error(`network failed with ${secret}`)
    })

    const response = await handleApiRequest(
      apiRequest("type=land&lawdCd=11680&dealYmd=202606"),
      dependencies(fetchUpstream),
    )

    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain(secret)
    expect(fetchUpstream).toHaveBeenCalledOnce()
  })
})

describe("routeRequest", () => {
  it("routes administrator status without exposing it to an unauthorized request", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn()
    const adminStatusLoader = vi.fn()

    const response = await routeRequest(
      new Request(
        "https://example.com/api/admin/data-status?type=apt&lawdCd=11680&dealYmd=202606",
      ),
      dependencies(fetchUpstream, {
        adminToken: "admin-secret",
        adminStatusLoader,
      }),
      fetchAsset,
    )

    expect(response.status).toBe(401)
    expect(adminStatusLoader).not.toHaveBeenCalled()
    expect(fetchUpstream).not.toHaveBeenCalled()
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it("routes five-year history status without calling MOLIT or static assets", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn()

    const response = await routeRequest(
      new Request(
        "https://example.com/api/real-estate/history?type=apt&lawdCd=11680&dealYmd=202606",
      ),
      dependencies(fetchUpstream, { database: emptyDatabase() }),
      fetchAsset,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      progress: { status: "collecting", totalCount: 60 },
    })
    expect(fetchUpstream).not.toHaveBeenCalled()
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it("routes ordinance requests to the Law Open Data adapter", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("lawSearch.do")) {
        return Response.json({ LawSearch: { law: [{ 자치법규명: "서울특별시 구로구 도시계획 조례", 자치법규ID: "1001", 시행일자: "20260101" }] } })
      }
      return Response.json({ ordinance: { 자치법규명: "서울특별시 구로구 도시계획 조례", 조문: [{ 조내용: "일반상업지역 건폐율 70퍼센트, 용적률 800퍼센트" }] } })
    })

    const response = await routeRequest(
      new Request("https://example.com/api/real-estate/ordinance?jurisdictionCode=11530&jurisdictionName=서울특별시%20구로구&zoneCode=UQA220&zoneName=일반상업지역"),
      dependencies(fetchUpstream, { lawApiOc: "test-oc" }),
      fetchAsset,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ kind: "found", regulation: { floorAreaRatioLimitPercent: 800 } })
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it("creates a handler with an injected upstream fetcher", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn(async () => Response.json({ ok: true }))
    const handler = createWorkerHandler({ fetchUpstream })

    const response = await handler(
      apiRequest("type=apt&lawdCd=11680&dealYmd=202606"),
      { serviceKey: secret, fetchAsset },
    )

    expect(response.status).toBe(200)
    expect(fetchUpstream).toHaveBeenCalledOnce()
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it("applies the injected rate limiter before upstream access", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn(async () => Response.json({ ok: true }))
    const rateLimiter = {
      limit: vi.fn(async () => ({ success: true })),
    }
    const handler = createWorkerHandler({ fetchUpstream, rateLimiter })

    const response = await handler(
      new Request("https://example.com/api/real-estate?type=apt&lawdCd=11680&dealYmd=202606", {
        headers: { "CF-Connecting-IP": "203.0.113.10" },
      }),
      { serviceKey: secret, fetchAsset },
    )

    expect(response.status).toBe(200)
    expect(rateLimiter.limit).toHaveBeenCalledWith({ key: "real-estate:203.0.113.10" })
    expect(fetchUpstream).toHaveBeenCalledOnce()
  })

  it("serves non-API requests from the static assets binding", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn()

    const response = await routeRequest(
      new Request("https://example.com/style.css"),
      dependencies(fetchUpstream),
      fetchAsset,
    )

    expect(await response.text()).toBe("asset")
    expect(fetchAsset).toHaveBeenCalledOnce()
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("routes only the real-estate API path to the upstream handler", async () => {
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const fetchUpstream = vi.fn(async () => Response.json({ ok: true }))

    const response = await routeRequest(
      apiRequest("type=apt&lawdCd=11680&dealYmd=202606"),
      dependencies(fetchUpstream),
      fetchAsset,
    )

    expect(response.status).toBe(200)
    expect(fetchUpstream).toHaveBeenCalledOnce()
    expect(fetchAsset).not.toHaveBeenCalled()
  })
})
