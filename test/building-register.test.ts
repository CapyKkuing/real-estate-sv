import { describe, expect, it } from "vitest"
import { normalizeBuildingRegister } from "../src/building-register"

describe("building register normalization", () => {
  it("links official title data to a building identity", () => {
    expect(
      normalizeBuildingRegister("registry:REG-100", {
        mgmBldrgstPk: "REG-100",
        bldNm: "한빛 아파트",
        mainPurpsCdNm: "공동주택",
        totArea: "12,345.67",
        grndFlrCnt: "18",
        ugrndFlrCnt: "2",
        useAprDay: "20080314",
      }),
    ).toEqual({
      kind: "normalized",
      value: {
        source: "building-hub",
        buildingKey: "registry:REG-100",
        registryId: "REG-100",
        name: "한빛 아파트",
        primaryPurpose: "공동주택",
        totalFloorAreaSquareMeters: 12345.67,
        aboveGroundFloorCount: 18,
        belowGroundFloorCount: 2,
        buildingCoveragePercent: null,
        floorAreaRatioPercent: null,
        approvedOn: "2008-03-14",
      },
    })
  })

  it("keeps current coverage and floor-area ratios when supplied by Building Hub", () => {
    expect(
      normalizeBuildingRegister("registry:REG-100", {
        mgmBldrgstPk: "REG-100",
        mainPurpsCdNm: "공동주택",
        totArea: "100",
        grndFlrCnt: "1",
        ugrndFlrCnt: "0",
        useAprDay: "20080314",
        bcRat: "34.28",
        vlRat: "249.7",
      }),
    ).toMatchObject({
      kind: "normalized",
      value: { buildingCoveragePercent: 34.28, floorAreaRatioPercent: 249.7 },
    })
  })

  it("rejects an impossible approval date", () => {
    expect(
      normalizeBuildingRegister("registry:REG-100", {
        mgmBldrgstPk: "REG-100",
        mainPurpsCdNm: "공동주택",
        totArea: "100",
        grndFlrCnt: "1",
        ugrndFlrCnt: "0",
        useAprDay: "20260230",
      }),
    ).toEqual({ kind: "rejected", reason: "invalid-approval-date" })
  })
})
