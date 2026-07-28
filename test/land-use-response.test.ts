import { describe, expect, it, vi } from "vitest"
import { handleLandUseRequest, resolveLandUseResponse } from "../src/land-use-response"

const landUsePayload = {
  landUses: {
    field: [
      {
        pnu: "1126010200100830008",
        regstrSeCode: "1",
        regstrSeCodeNm: "토지대장",
        prposAreaDstrcCode: "UQA220",
        prposAreaDstrcCodeNm: "일반상업지역",
        lastUpdtDt: "2022-07-14",
      },
      {
        pnu: "1126010200100830008",
        regstrSeCode: "1",
        regstrSeCodeNm: "토지대장",
        prposAreaDstrcCode: "UDA100",
        prposAreaDstrcCodeNm: "재정비촉진지구",
        lastUpdtDt: "2022-07-14",
      },
    ],
  },
}

describe("official land-use response", () => {
  it("keeps the official zoning and restriction records for one PNU", () => {
    expect(resolveLandUseResponse(landUsePayload, "1126010200100830008")).toMatchObject({
      kind: "found",
      zoning: { code: "UQA220", name: "일반상업지역", sourceUpdatedOn: "2022-07-14" },
      restrictions: [{ code: "UDA100", name: "재정비촉진지구" }],
    })
  })

  it("requires a VWorld key without sending a partial request", async () => {
    const fetchUpstream = vi.fn()
    const response = await handleLandUseRequest(
      new Request("https://example.com/api/real-estate/land-use?pnu=1126010200100830008"),
      { fetchUpstream },
    )

    expect(response.status).toBe(503)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("calls the official PNU land-use endpoint", async () => {
    const fetchUpstream = vi.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => Response.json(landUsePayload))
    const response = await handleLandUseRequest(
      new Request("https://example.com/api/real-estate/land-use?pnu=1126010200100830008"),
      { vworldKey: "test-key", fetchUpstream },
    )

    expect(response.status).toBe(200)
    const url = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(url.origin).toBe("https://api.vworld.kr")
    expect(url.pathname).toBe("/ned/data/getLandUseAttr")
    expect(url.searchParams.get("pnu")).toBe("1126010200100830008")
    expect(url.searchParams.get("key")).toBe("test-key")
    expect(url.searchParams.get("domain")).toBe("example.com")
  })
})
