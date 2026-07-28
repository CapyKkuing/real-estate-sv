import { buildPnu } from "./pnu"

const LEGAL_DONG_ENDPOINT = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"

type PnuMatch =
  | {
      readonly kind: "matched"
      readonly pnu: string
      readonly legalDongCode: string
      readonly lotNumber: string
    }
  | { readonly kind: "unmatched"; readonly reason: "legal-dong-not-found" | "invalid-lot-number" }

type PnuDependencies = {
  readonly serviceKey: string
  readonly fetchUpstream: typeof fetch
  readonly rateLimiter?: Pick<RateLimit, "limit">
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function legalDongRows(payload: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.StanReginCd)) return []
  for (const section of payload.StanReginCd) {
    if (!isRecord(section) || !Array.isArray(section.row)) continue
    return section.row.filter(isRecord)
  }
  return []
}

function parseLotNumber(jibun: string):
  | { readonly mountain: boolean; readonly mainNumber: string; readonly subNumber: string }
  | undefined {
  const normalized = jibun.trim()
  const match = /^(산\s*)?(\d{1,4})(?:-(\d{1,4}))?$/.exec(normalized)
  if (!match?.[2]) return undefined
  return {
    mountain: Boolean(match[1]),
    mainNumber: match[2],
    subNumber: match[3] ?? "0",
  }
}

export function resolvePnuFromLegalDongPayload(
  payload: unknown,
  address: string,
  jibun: string,
): PnuMatch {
  const lot = parseLotNumber(jibun)
  if (!lot) return { kind: "unmatched", reason: "invalid-lot-number" }
  const matches = legalDongRows(payload).filter(
    (row) => row.locatadd_nm === address && typeof row.region_cd === "string" && /^\d{10}$/.test(row.region_cd),
  )
  const row = matches.length === 1 ? matches[0] : undefined
  const legalDongCode = row?.region_cd
  if (typeof legalDongCode !== "string") {
    return { kind: "unmatched", reason: "legal-dong-not-found" }
  }
  const pnu = buildPnu({ legalDongCode, ...lot })
  if (pnu.kind === "invalid") return { kind: "unmatched", reason: "invalid-lot-number" }
  return {
    kind: "matched",
    pnu: pnu.value.pnu,
    legalDongCode,
    lotNumber: pnu.value.lotNumber,
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function handlePnuRequest(
  request: Request,
  dependencies: PnuDependencies,
): Promise<Response> {
  if (request.method !== "GET") return jsonError("허용되지 않은 요청 방식입니다.", 405)
  const url = new URL(request.url)
  const address = url.searchParams.get("address")?.trim()
  const jibun = url.searchParams.get("jibun")?.trim()
  if (!address || address.length > 80 || !jibun || !parseLotNumber(jibun)) {
    return jsonError("요청 값을 확인해 주세요.", 400)
  }
  if (dependencies.rateLimiter) {
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "anonymous"
    const { success } = await dependencies.rateLimiter.limit({ key: `real-estate-pnu:${clientIp}` })
    if (!success) return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429)
  }

  const upstreamUrl = new URL(LEGAL_DONG_ENDPOINT)
  upstreamUrl.search = new URLSearchParams({
    serviceKey: dependencies.serviceKey,
    pageNo: "1",
    numOfRows: "10",
    type: "json",
    locatadd_nm: address,
  }).toString()
  try {
    const response = await dependencies.fetchUpstream(upstreamUrl.toString(), {
      headers: { Accept: "application/json", "User-Agent": "real-estate-sv/1.0" },
    })
    if (!response.ok) return jsonError("법정동 코드 조회에 실패했습니다.", 502)
    const result = resolvePnuFromLegalDongPayload(await response.json(), address, jibun)
    return Response.json(result, { status: result.kind === "matched" ? 200 : 404 })
  } catch (error: unknown) {
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return jsonError("법정동 코드 서비스에 연결하지 못했습니다.", 502)
    }
    throw error
  }
}
