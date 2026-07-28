import { normalizeDevelopmentLimit, type DevelopmentLimitResult } from "./ordinance-limit"

type OrdinanceDependencies = {
  readonly lawApiOc?: string
  readonly fetchUpstream: typeof fetch
  readonly database?: D1Database
}

type DevelopmentLimit = Extract<DevelopmentLimitResult, { readonly kind: "normalized" }>["value"]

type OrdinanceSource = {
  readonly title: string
  readonly jurisdictionName: string
  readonly ordinanceId: string | null
  readonly mst: string | null
  readonly effectiveOn: string | null
  readonly sourceUrl: string
  readonly retrievedAt: string
}

export type OrdinanceResponse =
  | { readonly kind: "found"; readonly source: OrdinanceSource; readonly regulation: DevelopmentLimit | null }
  | { readonly kind: "not-found" }

const NAME_KEYS = ["자치법규명", "법령명", "법령명한글", "ordinanceName", "lawName", "name"]
const ID_KEYS = ["자치법규ID", "법령ID", "ordinId", "lawId", "ID", "id"]
const MST_KEYS = ["자치법규일련번호", "법령일련번호", "MST", "mst"]
const JURISDICTION_KEYS = ["지자체기관명", "자치단체명", "jurisdictionName", "organizationName"]
const EFFECTIVE_DATE_KEYS = ["시행일자", "시행일", "effectiveDate", "effectiveOn"]

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function firstText(record: Readonly<Record<string, unknown>>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = text(record[key])
    if (value) return value
  }
  return undefined
}

function walkRecords(payload: unknown): readonly Readonly<Record<string, unknown>>[] {
  const found: Readonly<Record<string, unknown>>[] = []
  const visit = (value: unknown, depth: number): void => {
    if (depth > 6) return
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1))
      return
    }
    if (!isRecord(value)) return
    if (NAME_KEYS.some(key => text(value[key]))) found.push(value)
    Object.values(value).forEach(item => visit(item, depth + 1))
  }
  visit(payload, 0)
  return found
}

function allText(payload: unknown): readonly string[] {
  const values: string[] = []
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8) return
    if (typeof value === "string") {
      const normalized = value.trim()
      if (normalized) values.push(normalized)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1))
      return
    }
    if (isRecord(value)) Object.values(value).forEach(item => visit(item, depth + 1))
  }
  visit(payload, 0)
  return values
}

type Candidate = {
  readonly title: string
  readonly ordinanceId: string | null
  readonly mst: string | null
  readonly jurisdictionName: string | null
  readonly effectiveDate: string | null
}

function candidates(payload: unknown, jurisdictionName: string): readonly Candidate[] {
  const seen = new Set<string>()
  return walkRecords(payload)
    .map(record => ({
      title: firstText(record, NAME_KEYS),
      ordinanceId: firstText(record, ID_KEYS) ?? null,
      mst: firstText(record, MST_KEYS) ?? null,
      jurisdictionName: firstText(record, JURISDICTION_KEYS) ?? null,
      effectiveDate: firstText(record, EFFECTIVE_DATE_KEYS) ?? null,
    }))
    .filter((candidate): candidate is Candidate => Boolean(candidate.title))
    .filter(candidate => candidate.title.includes("도시계획") || candidate.title.includes("국토의 계획") || candidate.title.includes(jurisdictionName))
    .filter(candidate => {
      const key = [candidate.title, candidate.ordinanceId, candidate.mst].join("|")
      if (seen.has(key)) return false
      seen.add(key)
      return Boolean(candidate.ordinanceId || candidate.mst)
    })
    .sort((left, right) => Number(right.title.includes("도시계획")) - Number(left.title.includes("도시계획")))
}

function compactDate(value: string | null | undefined): string | null {
  if (!value) return null
  const compact = value.replaceAll("-", "").replaceAll("/", "")
  if (!/^\d{8}$/.test(compact)) return null
  const date = new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractPercent(textValue: string, label: string): number | undefined {
  const match = new RegExp(`${escapeRegExp(label)}[^0-9]{0,100}(\\d{1,4}(?:\\.\\d+)?)\\s*(?:%|퍼센트|이하|미만)?`).exec(textValue)
  if (!match?.[1]) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

function findRegulation(
  payload: unknown,
  candidate: Candidate,
  jurisdictionCode: string,
  zoneCode: string,
  zoneName: string,
  retrievedAt: string,
): DevelopmentLimit | null {
  const texts = allText(payload)
  const zonePattern = new RegExp(escapeRegExp(zoneName))
  for (let index = 0; index < texts.length; index += 1) {
    if (!zonePattern.test(texts[index] ?? "")) continue
    const context = texts.slice(index, index + 4).join(" ")
    const buildingCoverage = extractPercent(context, "건폐율")
    const floorAreaRatio = extractPercent(context, "용적률")
    if (buildingCoverage === undefined || floorAreaRatio === undefined) continue
    const normalized = normalizeDevelopmentLimit("ordinance", {
      sourceTitle: candidate.title,
      article: "용도지역별 건폐율·용적률",
      jurisdictionCode,
      zoneCode,
      buildingCoverageLimitPercent: buildingCoverage,
      floorAreaRatioLimitPercent: floorAreaRatio,
      effectiveDate: candidate.effectiveDate ?? "",
      retrievedAt,
    })
    if (normalized.kind === "normalized") return normalized.value
  }
  return null
}

function bodyUrl(oc: string, candidate: Candidate): URL {
  const url = new URL("https://www.law.go.kr/DRF/lawService.do")
  url.search = new URLSearchParams({
    OC: oc,
    target: "ordin",
    type: "JSON",
    ...(candidate.ordinanceId ? { ID: candidate.ordinanceId } : { MST: candidate.mst ?? "" }),
  }).toString()
  return url
}

function searchUrl(oc: string, jurisdictionName: string): URL {
  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do")
  url.search = new URLSearchParams({
    OC: oc,
    target: "ordin",
    type: "JSON",
    query: `${jurisdictionName} 도시계획 조례`,
    display: "20",
    page: "1",
  }).toString()
  return url
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function readCachedProfile(database: D1Database, jurisdictionCode: string, zoneCode: string): Promise<OrdinanceResponse | undefined> {
  const row = await database
    .prepare(`SELECT payload_json FROM ordinance_profiles WHERE jurisdiction_code = ? AND zone_code = ? AND fetched_at >= datetime('now', '-30 days')`)
    .bind(jurisdictionCode, zoneCode)
    .first<{ readonly payload_json: string }>()
  if (!row) return undefined
  try {
    const payload: unknown = JSON.parse(row.payload_json)
    if (!isRecord(payload) || (payload.kind !== "found" && payload.kind !== "not-found")) return undefined
    return payload as OrdinanceResponse
  } catch {
    return undefined
  }
}

async function saveProfile(database: D1Database, jurisdictionCode: string, zoneCode: string, response: OrdinanceResponse): Promise<void> {
  await database
    .prepare(`
      INSERT INTO ordinance_profiles (jurisdiction_code, zone_code, payload_json, fetched_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(jurisdiction_code, zone_code) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at
    `)
    .bind(jurisdictionCode, zoneCode, JSON.stringify(response), new Date().toISOString())
    .run()
}

export async function handleOrdinanceRequest(
  request: Request,
  dependencies: OrdinanceDependencies,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse("GET 요청만 허용됩니다.", 405)
  const url = new URL(request.url)
  const jurisdictionCode = url.searchParams.get("jurisdictionCode")
  const jurisdictionName = url.searchParams.get("jurisdictionName")?.trim()
  const zoneCode = url.searchParams.get("zoneCode")
  const zoneName = url.searchParams.get("zoneName")?.trim()
  if (!jurisdictionCode || !/^\d{5}$/.test(jurisdictionCode) || !jurisdictionName || jurisdictionName.length > 80 || !zoneCode || zoneCode.length > 30 || !zoneName || zoneName.length > 80) {
    return errorResponse("유효한 조례 조회 조건을 확인해 주세요.", 400)
  }
  if (!dependencies.lawApiOc) return errorResponse("국가법령정보 API 인증값이 설정되지 않았습니다.", 503)
  if (dependencies.database) {
    try {
      const cached = await readCachedProfile(dependencies.database, jurisdictionCode, zoneCode)
      if (cached) return Response.json(cached, { headers: { "X-Data-Source": "d1", "Cache-Control": "s-maxage=86400" } })
    } catch {}
  }

  const retrievedAt = new Date().toISOString()
  try {
    const searchResponse = await dependencies.fetchUpstream(searchUrl(dependencies.lawApiOc, jurisdictionName))
    if (!searchResponse.ok) return errorResponse("국가법령정보 검색 API 요청에 실패했습니다.", searchResponse.status)
    const foundCandidates = candidates(await searchResponse.json(), jurisdictionName).slice(0, 5)
    if (foundCandidates.length === 0) {
      const result: OrdinanceResponse = { kind: "not-found" }
      if (dependencies.database) {
        try { await saveProfile(dependencies.database, jurisdictionCode, zoneCode, result) } catch {}
      }
      return Response.json(result, { headers: { "Cache-Control": "s-maxage=86400" } })
    }

    for (const candidate of foundCandidates) {
      const response = await dependencies.fetchUpstream(bodyUrl(dependencies.lawApiOc, candidate))
      if (!response.ok) continue
      const payload = await response.json()
      const regulation = findRegulation(payload, candidate, jurisdictionCode, zoneCode, zoneName, retrievedAt)
      const result: OrdinanceResponse = {
        kind: "found",
        source: {
          title: candidate.title,
          jurisdictionName: candidate.jurisdictionName ?? jurisdictionName,
          ordinanceId: candidate.ordinanceId,
          mst: candidate.mst,
          effectiveOn: compactDate(candidate.effectiveDate),
          sourceUrl: "https://www.law.go.kr/LSW/ordinSc.do",
          retrievedAt,
        },
        regulation,
      }
      if (dependencies.database) {
        try { await saveProfile(dependencies.database, jurisdictionCode, zoneCode, result) } catch {}
      }
      return Response.json(result, { headers: { "Cache-Control": "s-maxage=86400" } })
    }
    return errorResponse("국가법령정보 본문 API 요청에 실패했습니다.", 502)
  } catch {
    return errorResponse("국가법령정보 API에 연결하지 못했습니다.", 502)
  }
}
