export type BuildingRegisterResult =
  | {
      readonly kind: "normalized"
      readonly value: {
        readonly source: "building-hub"
        readonly buildingKey: string
        readonly registryId: string
        readonly name: string | null
        readonly primaryPurpose: string
        readonly totalFloorAreaSquareMeters: number
        readonly aboveGroundFloorCount: number
        readonly belowGroundFloorCount: number
        readonly buildingCoveragePercent: number | null
        readonly floorAreaRatioPercent: number | null
        readonly approvedOn: string
      }
    }
  | {
      readonly kind: "rejected"
      readonly reason: "invalid-record" | "invalid-approval-date"
    }

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const number = Number(String(value).replaceAll(",", "").trim())
  return Number.isFinite(number) ? number : undefined
}

function compactDate(value: unknown): string | undefined {
  const date = text(value)
  if (!date || !/^\d{8}$/.test(date)) return undefined
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6))
  const day = Number(date.slice(6, 8))
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined
  }
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

function optionalPercent(value: unknown, maximum: number): number | null | undefined {
  if (value === undefined || value === null || value === "") return null
  const parsed = numberValue(value)
  return parsed === undefined || parsed < 0 || parsed > maximum ? undefined : parsed
}

export function normalizeBuildingRegister(
  buildingKey: string,
  item: Readonly<Record<string, unknown>>,
): BuildingRegisterResult {
  const registryId = text(item.mgmBldrgstPk)
  const primaryPurpose = text(item.mainPurpsCdNm)
  const totalFloorArea = numberValue(item.totArea)
  const aboveGroundFloorCount = numberValue(item.grndFlrCnt)
  const belowGroundFloorCount = numberValue(item.ugrndFlrCnt)
  const buildingCoveragePercent = optionalPercent(item.bcRat, 100)
  const floorAreaRatioPercent = optionalPercent(item.vlRat, 5000)
  const approvedOn = compactDate(item.useAprDay)
  if (text(item.useAprDay) && !approvedOn) {
    return { kind: "rejected", reason: "invalid-approval-date" }
  }
  if (
    buildingKey.trim().length === 0 ||
    !registryId ||
    !primaryPurpose ||
    totalFloorArea === undefined ||
    totalFloorArea < 0 ||
    aboveGroundFloorCount === undefined ||
    !Number.isInteger(aboveGroundFloorCount) ||
    aboveGroundFloorCount < 0 ||
    belowGroundFloorCount === undefined ||
    !Number.isInteger(belowGroundFloorCount) ||
    belowGroundFloorCount < 0 ||
    buildingCoveragePercent === undefined ||
    floorAreaRatioPercent === undefined ||
    !approvedOn
  ) {
    return { kind: "rejected", reason: "invalid-record" }
  }
  return {
    kind: "normalized",
    value: {
      source: "building-hub",
      buildingKey: buildingKey.trim(),
      registryId,
      name: text(item.bldNm) ?? null,
      primaryPurpose,
      totalFloorAreaSquareMeters: totalFloorArea,
      aboveGroundFloorCount,
      belowGroundFloorCount,
      buildingCoveragePercent,
      floorAreaRatioPercent,
      approvedOn,
    },
  }
}
