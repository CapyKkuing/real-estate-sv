import { describe, expect, it, vi } from "vitest"
import { createDemoOfficialFetch } from "../src/demo-official-data"
import { createWorkerHandler } from "../src/worker"

const demoHandler = createWorkerHandler({ fetchUpstream: createDemoOfficialFetch() })

function bindings() {
  return {
    serviceKey: "",
    dataMode: "demo" as const,
    fetchAsset: vi.fn(async () => new Response("asset")),
  }
}

describe("development demo official data", () => {
  it("serves a labeled transaction response without an official key", async () => {
    const response = await demoHandler(
      new Request("https://example.com/api/real-estate?type=apt&lawdCd=11530&dealYmd=202606"),
      bindings(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("X-Data-Mode")).toBe("demo")
    expect(response.headers.get("X-Data-Source")).toBe("demo")
    await expect(response.json()).resolves.toMatchObject({
      response: { header: { resultCode: "000" }, body: { totalCount: 2 } },
    })
  })

  it("keeps the PNU, building, land-use, and ordinance flow available in demo mode", async () => {
    const handler = demoHandler
    const pnu = await handler(
      new Request("https://example.com/api/real-estate/pnu?address=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EA%B5%AC%EB%A1%9C%EA%B5%AC%20%EB%8D%94%EB%AF%B8%EB%8F%99&jibun=719"),
      bindings(),
    )
    const pnuPayload = await pnu.json<{ readonly kind: string; readonly pnu: string }>()
    expect(pnuPayload.kind).toBe("matched")

    const building = await handler(
      new Request(`https://example.com/api/real-estate/building?pnu=${pnuPayload.pnu}`),
      bindings(),
    )
    const landUse = await handler(
      new Request(`https://example.com/api/real-estate/land-use?pnu=${pnuPayload.pnu}`),
      bindings(),
    )
    const ordinance = await handler(
      new Request("https://example.com/api/real-estate/ordinance?jurisdictionCode=11530&jurisdictionName=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EA%B5%AC%EB%A1%9C%EA%B5%AC&zoneCode=UQA220&zoneName=%EC%9D%BC%EB%B0%98%EC%83%81%EC%97%85%EC%A7%80%EC%97%AD"),
      bindings(),
    )

    await expect(building.json()).resolves.toMatchObject({ kind: "found", profile: { name: "개발용 샘플아파트" } })
    await expect(landUse.json()).resolves.toMatchObject({ kind: "found", zoning: { name: "일반상업지역" } })
    await expect(ordinance.json()).resolves.toMatchObject({
      kind: "found",
      regulation: { buildingCoverageLimitPercent: 70, floorAreaRatioLimitPercent: 800 },
    })
  })

  it("provides a current and two prior months for the demo trend", async () => {
    const response = await demoHandler(
      new Request("https://example.com/api/real-estate/history?type=apt&lawdCd=11530&dealYmd=202606"),
      bindings(),
    )

    expect(response.headers.get("X-Data-Mode")).toBe("demo")
    await expect(response.json()).resolves.toMatchObject({
      query: { fromDealYmd: "202107", toDealYmd: "202606" },
      progress: {
        availableMonths: [],
        nextCollectionMonths: ["202606", "202605", "202604"],
      },
    })
  })
})
