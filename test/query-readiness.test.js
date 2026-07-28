import { describe, expect, it } from "vitest"
import { isAnalysisReady } from "../site/query-readiness.js"

describe("analysis query readiness", () => {
  it("allows district-wide analysis without an 읍면동 selection", () => {
    const query = {
      sidoCd: "11",
      lawdCd: "11230",
      dealYmd: "202606",
      selectedTypes: ["apt"],
      selectedModes: ["trade"],
    }

    expect(isAnalysisReady({ ...query, dong: "" })).toBe(true)
    expect(isAnalysisReady({ ...query, dong: "장안동" })).toBe(true)
  })

  it("requires at least one transaction mode", () => {
    expect(isAnalysisReady({ sidoCd: "11", lawdCd: "11230", dealYmd: "202606", selectedTypes: ["apt"], selectedModes: [] })).toBe(false)
  })
})
