import { describe, expect, it, vi } from "vitest"
import { handlePnuRequest, resolvePnuFromLegalDongPayload } from "../src/pnu-response"
import { routeRequest } from "../src/worker"

const legalDongPayload = {
  StanReginCd: [
    { head: [{ totalCount: 1 }, { result: { resultCode: "INFO-0" } }] },
    { row: [{ region_cd: "1153010200", locatadd_nm: "서울특별시 구로구 구로동" }] },
  ],
}

describe("official legal-dong PNU response", () => {
  it("builds a PNU from an exact official address and lot number", () => {
    expect(resolvePnuFromLegalDongPayload(legalDongPayload, "서울특별시 구로구 구로동", "12-3")).toEqual({
      kind: "matched",
      pnu: "1153010200100120003",
      legalDongCode: "1153010200",
      lotNumber: "12-3",
    })
  })

  it("rejects an ambiguous or missing official address match", () => {
    expect(resolvePnuFromLegalDongPayload({ StanReginCd: [{}, { row: [] }] }, "서울특별시 구로구 구로동", "12")).toEqual({
      kind: "unmatched",
      reason: "legal-dong-not-found",
    })
  })

  it("routes a valid request through the official legal-dong API", async () => {
    const fetchUpstream = vi.fn(async (_input: RequestInfo | URL) => Response.json(legalDongPayload))
    const response = await handlePnuRequest(
      new Request("https://example.com/api/real-estate/pnu?address=서울특별시%20구로구%20구로동&jibun=산%2012-3"),
      { serviceKey: "secret", fetchUpstream },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ kind: "matched", pnu: "1153010200200120003" })
    const upstreamUrl = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(upstreamUrl.searchParams.get("locatadd_nm")).toBe("서울특별시 구로구 구로동")
    expect(upstreamUrl.searchParams.get("serviceKey")).toBe("secret")
  })

  it("rejects a masked lot number without calling the official API", async () => {
    const fetchUpstream = vi.fn()
    const response = await handlePnuRequest(
      new Request("https://example.com/api/real-estate/pnu?address=서울특별시%20구로구%20구로동&jibun=12-*"),
      { serviceKey: "secret", fetchUpstream },
    )

    expect(response.status).toBe(400)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("routes PNU lookup without serving a static asset", async () => {
    const fetchUpstream = vi.fn(async (_input: RequestInfo | URL) => Response.json(legalDongPayload))
    const fetchAsset = vi.fn(async () => new Response("asset"))
    const response = await routeRequest(
      new Request("https://example.com/api/real-estate/pnu?address=서울특별시%20구로구%20구로동&jibun=12-3"),
      { serviceKey: "secret", fetchUpstream },
      fetchAsset,
    )

    expect(response.status).toBe(200)
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it("rate limits official-code lookups before calling upstream", async () => {
    const fetchUpstream = vi.fn()
    const response = await handlePnuRequest(
      new Request("https://example.com/api/real-estate/pnu?address=서울특별시%20구로구%20구로동&jibun=12-3"),
      { serviceKey: "secret", fetchUpstream, rateLimiter: { limit: vi.fn(async () => ({ success: false })) } },
    )

    expect(response.status).toBe(429)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })
})
