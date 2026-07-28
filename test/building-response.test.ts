import { describe, expect, it, vi } from "vitest"
import { handleBuildingRequest, resolveBuildingResponse } from "../src/building-response"

const buildingPayload = {
  response: {
    header: { resultCode: "00" },
    body: {
      items: {
        item: [{
          mgmBldrgstPk: "11530-100000001", bldNm: "테스트아파트", mainPurpsCdNm: "공동주택",
          totArea: "12345.67", grndFlrCnt: "18", ugrndFlrCnt: "2", useAprDay: "20080314",
        }],
      },
    },
  },
}

describe("building Hub profile response", () => {
  it("normalizes a title record for an exact PNU", () => {
    expect(resolveBuildingResponse(buildingPayload, "1153010200100120003")).toMatchObject({
      kind: "found",
      profile: { registryId: "11530-100000001", primaryPurpose: "공동주택", approvedOn: "2008-03-14" },
    })
  })

  it("rejects an invalid PNU before upstream fetch", async () => {
    const fetchUpstream = vi.fn()
    const response = await handleBuildingRequest(
      new Request("https://example.com/api/real-estate/building?pnu=bad"),
      { serviceKey: "secret", fetchUpstream },
    )

    expect(response.status).toBe(400)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("calls Building Hub with PNU components", async () => {
    const fetchUpstream = vi.fn(async (_input: RequestInfo | URL) => Response.json(buildingPayload))
    const response = await handleBuildingRequest(
      new Request("https://example.com/api/real-estate/building?pnu=1153010200200120003"),
      { serviceKey: "secret", fetchUpstream },
    )

    expect(response.status).toBe(200)
    const url = new URL(String(fetchUpstream.mock.calls[0]?.[0]))
    expect(url.pathname).toBe("/1613000/BldRgstHubService/getBrTitleInfo")
    expect(url.searchParams.get("sigunguCd")).toBe("11530")
    expect(url.searchParams.get("bjdongCd")).toBe("10200")
    expect(url.searchParams.get("platGbCd")).toBe("1")
    expect(url.searchParams.get("bun")).toBe("0012")
    expect(url.searchParams.get("ji")).toBe("0003")
  })
})
