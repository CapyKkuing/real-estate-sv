import { normalizeDevelopmentLimit, type DevelopmentLimitResult } from "./ordinance-limit"

type OrdinanceDependencies = {
  readonly serviceKey: string
  readonly fetchUpstream: typeof fetch
  readonly database?: D1Database
}

type DevelopmentLimit = Extract<DevelopmentLimitResult, { readonly kind: "normalized" }>["value"]

type OrdinanceSource = {
  readonly title: string
  readonly jurisdictionName: string
  readonly ordinanceId: null
  readonly mst: null
  readonly effectiveOn: null
  readonly sourceUrl: string
  readonly retrievedAt: string
}

export type OrdinanceResponse =
  | { readonly kind: "found"; readonly source: OrdinanceSource; readonly regulation: DevelopmentLimit | null }
  | { readonly kind: "not-found" }

const LAW_ENDPOINT = "https://apis.data.go.kr/1613000/LuLawInfoService/DTluLawInfo"
const LAW_SOURCE_URL = "https://www.data.go.kr/data/15057174/openapi.do"

type LawEntry = {
  readonly zoneCode: string
  readonly zoneName: string
  readonly contents: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim()
}

function xmlText(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${escapeRegExp(name)}>([\\s\\S]*?)</${escapeRegExp(name)}>`, "i").exec(xml)
  const value = match?.[1]
  return value ? decodeXml(value) || undefined : undefined
}

function lawEntries(xml: string): readonly LawEntry[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(match => match[1] ?? "")
    .map(item => ({
      zoneCode: xmlText(item, "UCODE") ?? "",
      zoneName: xmlText(item, "UNAME") ?? "",
      contents: xmlText(item, "LAW_CONTENTS") ?? "",
    }))
    .filter((entry): entry is LawEntry => Boolean(entry.zoneCode && entry.zoneName && entry.contents))
}

function extractPercent(text: string, label: string): number | undefined {
  const match = new RegExp(`${escapeRegExp(label)}[^0-9]{0,100}(\\d{1,4}(?:\\.\\d+)?)\\s*(?:%|퍼센트|이하|미만)?`).exec(text)
  const value = Number(match?.[1])
  return Number.isFinite(value) ? value : undefined
}

function findRegulation(
  entries: readonly LawEntry[],
  jurisdictionCode: string,
  zoneCode: string,
  zoneName: string,
  retrievedAt: string,
): DevelopmentLimit | null {
  const contents = entries
    .filter(entry => entry.zoneCode === zoneCode || entry.zoneName === zoneName)
    .map(entry => `${entry.zoneName} ${entry.contents}`)
    .join(" ")
  const buildingCoverage = extractPercent(contents, "건폐율")
  const floorAreaRatio = extractPercent(contents, "용적률")
  if (buildingCoverage === undefined || floorAreaRatio === undefined) return null
  const normalized = normalizeDevelopmentLimit("statute", {
    sourceTitle: "국토교통부 토지이용규제법령정보서비스",
    article: "지역지구별 법령 내용",
    jurisdictionCode,
    zoneCode,
    buildingCoverageLimitPercent: buildingCoverage,
    floorAreaRatioLimitPercent: floorAreaRatio,
    retrievedAt,
  })
  return normalized.kind === "normalized" ? normalized.value : null
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
    if (!payload || typeof payload !== "object" || !("kind" in payload) || payload.kind !== "found") return undefined
    if (!("source" in payload) || !payload.source || typeof payload.source !== "object" || !("sourceUrl" in payload.source) || payload.source.sourceUrl !== LAW_SOURCE_URL) return undefined
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
  if (!dependencies.serviceKey) return errorResponse("공공데이터포털 API 키가 설정되지 않았습니다.", 503)
  if (dependencies.database) {
    try {
      const cached = await readCachedProfile(dependencies.database, jurisdictionCode, zoneCode)
      if (cached) return Response.json(cached, { headers: { "X-Data-Source": "d1", "Cache-Control": "s-maxage=86400" } })
    } catch {}
  }

  const upstreamUrl = new URL(LAW_ENDPOINT)
  upstreamUrl.search = new URLSearchParams({
    serviceKey: dependencies.serviceKey,
    areaCd: jurisdictionCode,
    ucodeList: zoneCode,
  }).toString()
  try {
    const upstream = await dependencies.fetchUpstream(upstreamUrl, {
      headers: { Accept: "application/xml", "User-Agent": "real-estate-sv/1.0" },
    })
    if (!upstream.ok) return errorResponse("토지이용규제 법령 API 요청에 실패했습니다.", upstream.status)
    const payload = await upstream.text()
    const resultCode = xmlText(payload, "resultCode")
    if (resultCode && !/^0+$/.test(resultCode)) return errorResponse("토지이용규제 법령 API 응답에 실패했습니다.", 502)
    const entries = lawEntries(payload)
    if (entries.length === 0) return Response.json({ kind: "not-found" } satisfies OrdinanceResponse, { headers: { "Cache-Control": "s-maxage=86400" } })
    const retrievedAt = new Date().toISOString()
    const result: OrdinanceResponse = {
      kind: "found",
      source: {
        title: "국토교통부 토지이용규제법령정보서비스",
        jurisdictionName,
        ordinanceId: null,
        mst: null,
        effectiveOn: null,
        sourceUrl: LAW_SOURCE_URL,
        retrievedAt,
      },
      regulation: findRegulation(entries, jurisdictionCode, zoneCode, zoneName, retrievedAt),
    }
    if (dependencies.database) {
      try { await saveProfile(dependencies.database, jurisdictionCode, zoneCode, result) } catch {}
    }
    return Response.json(result, { headers: { "Cache-Control": "s-maxage=86400" } })
  } catch {
    return errorResponse("토지이용규제 법령 API에 연결하지 못했습니다.", 502)
  }
}
