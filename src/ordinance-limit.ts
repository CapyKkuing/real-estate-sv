export type DevelopmentLimitSourceKind = "statute" | "ordinance"

export type DevelopmentLimitResult =
  | {
      readonly kind: "normalized"
      readonly value: {
        readonly sourceKind: DevelopmentLimitSourceKind
        readonly sourceTitle: string
        readonly article: string
        readonly jurisdictionCode: string
        readonly zoneCode: string
        readonly buildingCoverageLimitPercent: number
        readonly floorAreaRatioLimitPercent: number
        readonly effectiveOn: string | null
        readonly retrievedAt: string
      }
    }
  | { readonly kind: "rejected"; readonly reason: "invalid-record" }

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function percent(value: unknown, maximum: number): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const number = Number(String(value).replaceAll(",", "").trim())
  return Number.isFinite(number) && number >= 0 && number <= maximum ? number : undefined
}

function compactDate(value: unknown): string | undefined {
  const date = text(value)
  if (!date || !/^\d{8}$/.test(date)) return undefined
  const parsed = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10).replaceAll("-", "") !== date) {
    return undefined
  }
  return parsed.toISOString().slice(0, 10)
}

export function normalizeDevelopmentLimit(
  sourceKind: DevelopmentLimitSourceKind,
  item: Readonly<Record<string, unknown>>,
): DevelopmentLimitResult {
  const sourceTitle = text(item.sourceTitle)
  const article = text(item.article)
  const jurisdictionCode = text(item.jurisdictionCode)
  const zoneCode = text(item.zoneCode)
  const buildingCoverageLimitPercent = percent(item.buildingCoverageLimitPercent, 100)
  const floorAreaRatioLimitPercent = percent(item.floorAreaRatioLimitPercent, 5000)
  const effectiveOn = compactDate(item.effectiveDate) ?? null
  const retrievedAt = text(item.retrievedAt)
  if (
    !sourceTitle ||
    !article ||
    !jurisdictionCode ||
    !zoneCode ||
    buildingCoverageLimitPercent === undefined ||
    floorAreaRatioLimitPercent === undefined ||
    !retrievedAt ||
    Number.isNaN(Date.parse(retrievedAt))
  ) {
    return { kind: "rejected", reason: "invalid-record" }
  }
  return {
    kind: "normalized",
    value: {
      sourceKind,
      sourceTitle,
      article,
      jurisdictionCode,
      zoneCode,
      buildingCoverageLimitPercent,
      floorAreaRatioLimitPercent,
      effectiveOn,
      retrievedAt,
    },
  }
}

export function mergeDevelopmentLimitHistory(
  existing: readonly DevelopmentLimitResult[],
  incoming: readonly DevelopmentLimitResult[],
): readonly DevelopmentLimitResult[] {
  const history = new Map<string, Extract<DevelopmentLimitResult, { readonly kind: "normalized" }>>()
  for (const result of [...existing, ...incoming]) {
    if (result.kind === "rejected") continue
    const key = [
      result.value.sourceKind,
      result.value.sourceTitle,
      result.value.jurisdictionCode,
      result.value.zoneCode,
      result.value.effectiveOn,
    ].join("|")
    history.set(key, result)
  }
  return [...history.values()].sort((left, right) =>
    (left.value.effectiveOn ?? "").localeCompare(right.value.effectiveOn ?? ""),
  )
}
