import { describe, expect, it, vi } from "vitest"
import { handleOrdinanceRequest } from "../src/ordinance-response"

const searchPayload = {
  LawSearch: {
    law: [{
      자치법규명: "서울특별시 구로구 도시계획 조례",
      자치법규ID: "1001",
      시행일자: "20260101",
      지자체기관명: "서울특별시 구로구",
    }],
  },
}

const bodyPayload = {
  ordinance: {
    자치법규명: "서울특별시 구로구 도시계획 조례",
    시행일자: "20260101",
    조문: [{
      조문번호: "제55조",
      조내용: "일반상업지역은 건폐율 70퍼센트 이하, 용적률 800퍼센트 이하로 한다.",
    }],
  },
}

const request = () => new Request(
  "https://example.com/api/real-estate/ordinance?jurisdictionCode=11530&jurisdictionName=서울특별시%20구로구&zoneCode=UQA220&zoneName=일반상업지역",
)

describe("official ordinance response", () => {
  it("requires the Law Open Data credential before upstream access", async () => {
    const fetchUpstream = vi.fn()
    const response = await handleOrdinanceRequest(request(), { fetchUpstream })

    expect(response.status).toBe(503)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("searches the jurisdiction ordinance and extracts only matching zone limits", async () => {
    const fetchUpstream = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.pathname.endsWith("lawSearch.do") ? Response.json(searchPayload) : Response.json(bodyPayload)
    })
    const response = await handleOrdinanceRequest(request(), { lawApiOc: "test-oc", fetchUpstream })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: "found",
      source: { title: "서울특별시 구로구 도시계획 조례", ordinanceId: "1001", effectiveOn: "2026-01-01" },
      regulation: {
        sourceKind: "ordinance",
        zoneCode: "UQA220",
        buildingCoverageLimitPercent: 70,
        floorAreaRatioLimitPercent: 800,
      },
    })
    const searchUrl = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(searchUrl.searchParams.get("OC")).toBe("test-oc")
    expect(searchUrl.searchParams.get("target")).toBe("ordin")
    expect(searchUrl.searchParams.get("type")).toBe("JSON")
    expect(searchUrl.searchParams.get("query")).toContain("서울특별시 구로구")
    const bodyUrl = new URL(String(fetchUpstream.mock.calls[1]?.[0]))
    expect(bodyUrl.searchParams.get("ID")).toBe("1001")
  })

  it("keeps official source metadata when numeric matching is unavailable", async () => {
    const fetchUpstream = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.pathname.endsWith("lawSearch.do") ? Response.json(searchPayload) : Response.json({ ordinance: { 자치법규명: "서울특별시 구로구 도시계획 조례", 조문: [{ 조내용: "일반상업지역 관련 조문" }] } })
    })

    const response = await handleOrdinanceRequest(request(), { lawApiOc: "test-oc", fetchUpstream })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ kind: "found", regulation: null })
  })
})
