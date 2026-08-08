import { describe, expect, it, vi } from "vitest"
import { handleOrdinanceRequest } from "../src/ordinance-response"

const lawPayload = `<?xml version="1.0" encoding="UTF-8"?>
<response><header><resultCode>00</resultCode></header><body><items><item>
<UCODE>UQA220</UCODE><UNAME>일반상업지역</UNAME>
<LAW_CONTENTS><![CDATA[일반상업지역은 건폐율 70퍼센트 이하, 용적률 800퍼센트 이하로 한다.]]></LAW_CONTENTS>
</item></items></body></response>`

const request = () => new Request(
  "https://example.com/api/real-estate/ordinance?jurisdictionCode=11530&jurisdictionName=서울특별시%20구로구&zoneCode=UQA220&zoneName=일반상업지역",
)

describe("official ordinance response", () => {
  it("requires the public data portal key before upstream access", async () => {
    const fetchUpstream = vi.fn()
    const response = await handleOrdinanceRequest(request(), { serviceKey: "", fetchUpstream })

    expect(response.status).toBe(503)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("uses the public land-use law endpoint and extracts matching limits", async () => {
    const fetchUpstream = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => new Response(lawPayload))
    const response = await handleOrdinanceRequest(request(), { serviceKey: "test-key", fetchUpstream })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: "found",
      source: { title: "국토교통부 토지이용규제법령정보서비스", effectiveOn: null },
      regulation: {
        sourceKind: "statute",
        zoneCode: "UQA220",
        buildingCoverageLimitPercent: 70,
        floorAreaRatioLimitPercent: 800,
        effectiveOn: null,
      },
    })
    const upstreamUrl = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(upstreamUrl.origin).toBe("https://apis.data.go.kr")
    expect(upstreamUrl.pathname).toBe("/1613000/LuLawInfoService/DTluLawInfo")
    expect(upstreamUrl.searchParams.get("serviceKey")).toBe("test-key")
    expect(upstreamUrl.searchParams.get("areaCd")).toBe("11530")
    expect(upstreamUrl.searchParams.get("ucodeList")).toBe("UQA220")
  })

  it("returns not-found when the public service has no matching law record", async () => {
    const fetchUpstream = vi.fn(async () => new Response("<response><header><resultCode>00</resultCode></header><body><items /></body></response>"))
    const response = await handleOrdinanceRequest(request(), { serviceKey: "test-key", fetchUpstream })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: "not-found" })
  })
})
