import { normalizeLandUse, type LandUseResult } from "./land-use"

type LandUseDependencies = {
  readonly vworldKey?: string
  readonly fetchUpstream: typeof fetch
  readonly database?: D1Database
}

type LandUseProfile = Extract<LandUseResult, { readonly kind: "normalized" }>["value"]

export type LandUseResponse =
  | {
      readonly kind: "found"
      readonly zoning: { readonly code: string; readonly name: string; readonly sourceUpdatedOn: string | null } | null
      readonly restrictions: readonly { readonly code: string; readonly name: string }[]
    }
  | { readonly kind: "not-found" }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function records(payload: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!isRecord(payload) || !isRecord(payload.landUses)) return []
  const fields = payload.landUses.field
  const values = Array.isArray(fields) ? fields : fields ? [fields] : []
  return values.filter(isRecord)
}

function isZoningName(name: string): boolean {
  return /(?:주거|상업|공업|녹지|관리|농림|자연환경보전)지역$/.test(name)
}

function normalizeProfiles(payload: unknown, pnu: string): readonly LandUseProfile[] {
  return records(payload)
    .filter((record) => record.pnu === pnu)
    .map(normalizeLandUse)
    .flatMap((result) => result.kind === "normalized" ? [result.value] : [])
}

export function resolveLandUseResponse(payload: unknown, pnu: string): LandUseResponse {
  const profiles = normalizeProfiles(payload, pnu)
  if (profiles.length === 0) return { kind: "not-found" }
  const zone = profiles.find((profile) => isZoningName(profile.zone.name))
  const restrictions = profiles
    .filter((profile) => profile.zone.code !== zone?.zone.code)
    .map((profile) => ({ code: profile.zone.code, name: profile.zone.name }))
  return {
    kind: "found",
    zoning: zone ? { ...zone.zone, sourceUpdatedOn: zone.sourceUpdatedOn } : null,
    restrictions,
  }
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function readCachedProfile(database: D1Database, pnu: string): Promise<LandUseResponse | undefined> {
  const row = await database
    .prepare(`SELECT payload_json FROM land_use_profiles WHERE pnu = ? AND fetched_at >= datetime('now', '-30 days')`)
    .bind(pnu)
    .first<{ readonly payload_json: string }>()
  if (!row) return undefined
  try {
    const payload: unknown = JSON.parse(row.payload_json)
    if (!isRecord(payload) || (payload.kind !== "found" && payload.kind !== "not-found")) return undefined
    return payload as LandUseResponse
  } catch {
    return undefined
  }
}

async function saveProfile(database: D1Database, pnu: string, response: LandUseResponse): Promise<void> {
  await database
    .prepare(`
      INSERT INTO land_use_profiles (pnu, payload_json, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(pnu) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at
    `)
    .bind(pnu, JSON.stringify(response), new Date().toISOString())
    .run()
}

export async function handleLandUseRequest(
  request: Request,
  dependencies: LandUseDependencies,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse("GET 요청만 허용됩니다.", 405)
  const url = new URL(request.url)
  const pnu = url.searchParams.get("pnu")
  if (!pnu || !/^\d{19}$/.test(pnu)) return errorResponse("유효한 PNU를 확인해 주세요.", 400)
  if (!dependencies.vworldKey) return errorResponse("토지이용 운영 API 키가 설정되지 않았습니다.", 503)

  if (dependencies.database) {
    try {
      const cached = await readCachedProfile(dependencies.database, pnu)
      if (cached) return Response.json(cached, { headers: { "X-Data-Source": "d1", "Cache-Control": "s-maxage=86400" } })
    } catch {}
  }

  const upstreamUrl = new URL("https://api.vworld.kr/ned/data/getLandUseAttr")
  upstreamUrl.search = new URLSearchParams({
    format: "json",
    key: dependencies.vworldKey,
    domain: url.hostname,
    pnu,
    numOfRows: "100",
    pageNo: "1",
  }).toString()

  try {
    const upstream = await dependencies.fetchUpstream(upstreamUrl)
    if (!upstream.ok) return errorResponse("토지이용계획 API 요청에 실패했습니다.", upstream.status)
    const resolved = resolveLandUseResponse(await upstream.json(), pnu)
    if (dependencies.database) {
      try {
        await saveProfile(dependencies.database, pnu, resolved)
      } catch {}
    }
    return Response.json(resolved, { headers: { "Cache-Control": "s-maxage=86400" } })
  } catch {
    return errorResponse("토지이용계획 API에 연결하지 못했습니다.", 502)
  }
}
