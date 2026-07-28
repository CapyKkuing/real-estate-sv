import { normalizeBuildingRegister } from "./building-register"

type RateLimiter = Pick<RateLimit, "limit">

type BuildingDependencies = {
  readonly serviceKey: string
  readonly fetchUpstream: typeof fetch
  readonly rateLimiter?: RateLimiter
  readonly database?: D1Database
}

type BuildingProfile = Extract<ReturnType<typeof normalizeBuildingRegister>, { kind: "normalized" }>["value"]

export type BuildingResponse =
  | { readonly kind: "found"; readonly profile: BuildingProfile }
  | { readonly kind: "not-found" }
  | { readonly kind: "ambiguous"; readonly count: number }

type PnuParts = {
  readonly sigunguCd: string
  readonly bjdongCd: string
  readonly platGbCd: "0" | "1"
  readonly bun: string
  readonly ji: string
}

function parsePnu(value: string | null): PnuParts | undefined {
  if (!value || !/^\d{19}$/.test(value)) return undefined
  const legalDong = value.slice(0, 10)
  const landMarker = value.at(10)
  if (landMarker !== "1" && landMarker !== "2") return undefined
  return {
    sigunguCd: legalDong.slice(0, 5),
    bjdongCd: legalDong.slice(5),
    platGbCd: landMarker === "2" ? "1" : "0",
    bun: value.slice(11, 15),
    ji: value.slice(15, 19),
  }
}

function records(payload: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (typeof payload !== "object" || payload === null) return []
  const response = (payload as { response?: unknown }).response
  if (typeof response !== "object" || response === null) return []
  const body = (response as { body?: unknown }).body
  if (typeof body !== "object" || body === null) return []
  const items = (body as { items?: unknown }).items
  if (typeof items !== "object" || items === null) return []
  const item = (items as { item?: unknown }).item
  const values = Array.isArray(item) ? item : item ? [item] : []
  return values.filter((value): value is Readonly<Record<string, unknown>> =>
    typeof value === "object" && value !== null,
  )
}

export function resolveBuildingResponse(payload: unknown, pnu: string): BuildingResponse {
  const profiles = records(payload)
    .map((item) => normalizeBuildingRegister(`land:${pnu}`, item))
    .flatMap((result) => result.kind === "normalized" ? [result.value] : [])

  if (profiles.length === 0) return { kind: "not-found" }
  if (profiles.length > 1) return { kind: "ambiguous", count: profiles.length }
  return { kind: "found", profile: profiles[0] }
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function readCachedProfile(database: D1Database, pnu: string): Promise<BuildingResponse | undefined> {
  const row = await database
    .prepare(`SELECT payload_json FROM building_profiles WHERE pnu = ? AND fetched_at >= datetime('now', '-30 days')`)
    .bind(pnu)
    .first<{ readonly payload_json: string }>()
  if (!row) return undefined
  try {
    const payload: unknown = JSON.parse(row.payload_json)
    if (typeof payload !== "object" || payload === null || !("kind" in payload)) return undefined
    return payload as BuildingResponse
  } catch {
    return undefined
  }
}

async function saveProfile(database: D1Database, pnu: string, response: BuildingResponse): Promise<void> {
  if (response.kind !== "found") return
  await database
    .prepare(`
      INSERT INTO building_profiles (pnu, payload_json, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(pnu) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at
    `)
    .bind(pnu, JSON.stringify(response), new Date().toISOString())
    .run()
}

export async function handleBuildingRequest(
  request: Request,
  dependencies: BuildingDependencies,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse("GET 요청만 허용됩니다.", 405)
  const pnu = new URL(request.url).searchParams.get("pnu")
  const parts = parsePnu(pnu)
  if (!parts || !pnu) return errorResponse("유효한 PNU를 확인해 주세요.", 400)

  if (dependencies.database) {
    try {
      const cached = await readCachedProfile(dependencies.database, pnu)
      if (cached) return Response.json(cached, { headers: { "X-Data-Source": "d1", "Cache-Control": "s-maxage=86400" } })
    } catch {}
  }

  if (dependencies.rateLimiter) {
    try {
      const clientIp = request.headers.get("CF-Connecting-IP") ?? "anonymous"
      const { success } = await dependencies.rateLimiter.limit({ key: `real-estate-building:${clientIp}` })
      if (!success) return errorResponse("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429)
    } catch {
      return errorResponse("요청 제한 서비스를 사용할 수 없습니다.", 503)
    }
  }

  const upstreamUrl = new URL("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo")
  upstreamUrl.search = new URLSearchParams({
    serviceKey: dependencies.serviceKey,
    sigunguCd: parts.sigunguCd,
    bjdongCd: parts.bjdongCd,
    platGbCd: parts.platGbCd,
    bun: parts.bun,
    ji: parts.ji,
    numOfRows: "10",
    pageNo: "1",
    _type: "json",
  }).toString()

  try {
    const upstream = await dependencies.fetchUpstream(upstreamUrl)
    if (!upstream.ok) return errorResponse("건축물대장 API 요청에 실패했습니다.", upstream.status)
    const resolved = resolveBuildingResponse(await upstream.json(), pnu)
    if (dependencies.database) {
      try {
        await saveProfile(dependencies.database, pnu, resolved)
      } catch {}
    }
    return Response.json(resolved, {
      headers: { "Cache-Control": "s-maxage=86400" },
    })
  } catch {
    return errorResponse("건축물대장 API에 연결하지 못했습니다.", 502)
  }
}
