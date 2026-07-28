import { fetchAllMolitPages, type MolitPageSnapshot } from "./molit-pagination"
import { handleAdminDataStatus, loadAdminDataStatus } from "./admin-data-status"
import { handleHistoryRequest } from "./history-response"
import { handlePnuRequest } from "./pnu-response"
import { handleBuildingRequest } from "./building-response"
import { handleLandUseRequest } from "./land-use-response"
import { handleOrdinanceRequest } from "./ordinance-response"
import { resolveTransactionRequest } from "./rent-endpoints"
import { readStoredTransactionFallback } from "./stored-transaction-response"
import { persistTransactionCollection } from "./transaction-ingestion"
import type { TransactionMode } from "./rent-endpoints"
import { transformTransactionResponse } from "./transaction-response"
import type { PropertyType } from "./transaction-query"
import type { SnapshotDatabase } from "./transaction-store"
import type { AdminStatusLoader } from "./admin-data-status"
type RateLimiter = Pick<RateLimit, "limit">
type CacheStore = Pick<Cache, "match" | "put">
type WaitUntil = ExecutionContext["waitUntil"]

export type ApiDependencies = {
  readonly serviceKey: string
  readonly fetchUpstream: typeof fetch
  readonly rateLimiter?: RateLimiter
  readonly cache?: CacheStore
  readonly waitUntil?: WaitUntil
  readonly database?: SnapshotDatabase
  readonly buildingDatabase?: D1Database
  readonly landUseDatabase?: D1Database
  readonly ordinanceDatabase?: D1Database
  readonly vworldKey?: string
  readonly lawApiOc?: string
  readonly now?: () => string
  readonly adminToken?: string
  readonly adminStatusLoader?: AdminStatusLoader
  readonly adminDatabase?: D1Database
}

type WorkerBindings = {
  readonly serviceKey: string
  readonly vworldKey?: string
  readonly lawApiOc?: string
  readonly fetchAsset: AssetFetcher
  readonly adminToken?: string
}

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...headers,
      },
    },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function isCacheableMolitResponse(response: Response): Promise<boolean> {
  try {
    const payload: unknown = await response.clone().json()
    if (!isRecord(payload) || !isRecord(payload.response) || !isRecord(payload.response.header)) {
      return false
    }
    const resultCode = payload.response.header.resultCode
    return typeof resultCode === "string" && resultCode.startsWith("00")
  } catch {
    return false
  }
}

function createCacheKey(
  request: Request,
  propertyType: PropertyType,
  lawdCd: string,
  dealYmd: string,
): Request {
  const cacheUrl = new URL(request.url)
  cacheUrl.search = new URLSearchParams({ type: propertyType, lawdCd, dealYmd }).toString()
  return new Request(cacheUrl.toString(), { method: "GET" })
}

async function readCachedResponse(cache: CacheStore, cacheKey: Request): Promise<Response | undefined> {
  try {
    return await cache.match(cacheKey)
  } catch {
    return undefined
  }
}

export async function handleApiRequest(
  request: Request,
  dependencies: ApiDependencies,
  mode: TransactionMode = "trade",
): Promise<Response> {
  const { serviceKey, fetchUpstream, rateLimiter, cache, waitUntil, database } = dependencies
  if (request.method !== "GET") {
    return jsonError("허용되지 않은 요청 방식입니다.", 405, { Allow: "GET" })
  }

  const resolvedRequest = resolveTransactionRequest(mode, new URL(request.url))
  if (!resolvedRequest) {
    return jsonError("요청 값을 확인해 주세요.", 400)
  }
  const { propertyType, lawdCd, dealYmd, endpoint, snapshotPropertyType } = resolvedRequest

  if (rateLimiter) {
    try {
      const clientIp = request.headers.get("CF-Connecting-IP") ?? "anonymous"
      const { success } = await rateLimiter.limit({ key: `real-estate:${clientIp}` })
      if (!success) {
        return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
          "Retry-After": "60",
        })
      }
    } catch {
      return jsonError("요청 제한 서비스를 사용할 수 없습니다.", 503)
    }
  }

  const cacheKey = createCacheKey(request, propertyType, lawdCd, dealYmd)
  if (cache) {
    const cachedResponse = await readCachedResponse(cache, cacheKey)
    if (cachedResponse) return cachedResponse
  }

  const upstreamUrl = new URL(endpoint)
  upstreamUrl.searchParams.set("serviceKey", serviceKey)
  upstreamUrl.searchParams.set("LAWD_CD", lawdCd)
  upstreamUrl.searchParams.set("DEAL_YMD", dealYmd)
  upstreamUrl.searchParams.set("_type", "json")

  try {
    const startedAt = dependencies.now?.() ?? new Date().toISOString()
    const pages: MolitPageSnapshot[] = []
    const upstreamResponse = await fetchAllMolitPages(upstreamUrl, fetchUpstream, (page) => {
      pages.push(page)
    })
    if (!upstreamResponse.ok) {
      const storedResponse = database
        ? await readStoredTransactionFallback(database, {
            propertyType: snapshotPropertyType,
            lawdCd,
            dealYmd,
          })
        : undefined
      if (storedResponse) return transformTransactionResponse(resolvedRequest, storedResponse)
      return jsonError("국토부 API 요청이 실패했습니다.", upstreamResponse.status)
    }
    const hasSuccessfulPayload = await isCacheableMolitResponse(upstreamResponse)
    if (!hasSuccessfulPayload && database) {
      const storedResponse = await readStoredTransactionFallback(database, {
        propertyType: snapshotPropertyType,
        lawdCd,
        dealYmd,
      })
      if (storedResponse) return transformTransactionResponse(resolvedRequest, storedResponse)
    }
    const fetchedAt = dependencies.now?.() ?? new Date().toISOString()
    if (database && pages.length > 0 && hasSuccessfulPayload) {
      const databaseWrite = persistTransactionCollection(
        database,
        { propertyType: snapshotPropertyType, lawdCd, dealYmd },
        pages,
        startedAt,
        fetchedAt,
      )
        .catch((error: unknown) => {
          console.error("D1 transaction page persistence failed", error)
        })
      if (waitUntil) {
        waitUntil(databaseWrite)
      } else {
        await databaseWrite
      }
    }
    if (!hasSuccessfulPayload) return upstreamResponse
    const transformedResponse = await transformTransactionResponse(resolvedRequest, upstreamResponse)
    const response = new Response(transformedResponse.body, transformedResponse)
    response.headers.set("X-Data-Source", "molit")
    response.headers.set("X-Data-Status", "complete")
    response.headers.set("X-Data-Fetched-At", fetchedAt)
    if (
      cache &&
      !response.headers.has("Set-Cookie")
    ) {
      const cacheResponse = new Response(response.clone().body, response)
      cacheResponse.headers.set("Cache-Control", "s-maxage=300")
      const cacheWrite = cache.put(cacheKey, cacheResponse).catch(() => undefined)
      if (waitUntil) {
        waitUntil(cacheWrite)
      } else {
        await cacheWrite
      }
    }
    return response
  } catch (error: unknown) {
    if (error instanceof TypeError && database) {
      const storedResponse = await readStoredTransactionFallback(database, {
        propertyType: snapshotPropertyType,
        lawdCd,
        dealYmd,
      })
      if (storedResponse) return transformTransactionResponse(resolvedRequest, storedResponse)
    }
    return jsonError("국토부 API에 연결하지 못했습니다.", 502)
  }
}

type AssetFetcher = (request: Request) => Promise<Response>

export async function routeRequest(
  request: Request,
  dependencies: ApiDependencies,
  fetchAsset: AssetFetcher,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === "/api/admin/data-status") {
    const adminDatabase = dependencies.adminDatabase
    const loadStatus = dependencies.adminStatusLoader ?? (adminDatabase
      ? (query) => loadAdminDataStatus(adminDatabase, query)
      : undefined)
    return handleAdminDataStatus(request, {
      expectedToken: dependencies.adminToken,
      loadStatus,
    })
  }
  if (url.pathname === "/api/real-estate/history") {
    return handleHistoryRequest(request, dependencies.database)
  }
  if (url.pathname === "/api/real-estate/pnu") {
    return handlePnuRequest(request, dependencies)
  }
  if (url.pathname === "/api/real-estate/building") {
    return handleBuildingRequest(request, { ...dependencies, database: dependencies.buildingDatabase })
  }
  if (url.pathname === "/api/real-estate/land-use") {
    return handleLandUseRequest(request, { ...dependencies, database: dependencies.landUseDatabase })
  }
  if (url.pathname === "/api/real-estate/ordinance") {
    return handleOrdinanceRequest(request, { ...dependencies, database: dependencies.ordinanceDatabase })
  }
  if (url.pathname === "/api/real-estate/rent") {
    return handleApiRequest(request, dependencies, "rent")
  }
  if (url.pathname === "/api/real-estate") {
    return handleApiRequest(request, dependencies)
  }
  return fetchAsset(request)
}

type RequestDependencies = Omit<ApiDependencies, "serviceKey">

export function createWorkerHandler(defaultDependencies: RequestDependencies = { fetchUpstream: fetch }) {
  return (
    request: Request,
    bindings: WorkerBindings,
    requestDependencies: RequestDependencies = defaultDependencies,
  ) =>
    routeRequest(
      request,
      { serviceKey: bindings.serviceKey, vworldKey: bindings.vworldKey, lawApiOc: bindings.lawApiOc, adminToken: bindings.adminToken, ...requestDependencies },
      bindings.fetchAsset,
    )
}

const workerHandler = createWorkerHandler({ fetchUpstream: fetch })

type WorkerEnv = Env & { readonly ADMIN_API_TOKEN?: string; readonly VWORLD_API_KEY?: string; readonly LAW_API_OC?: string }

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return workerHandler(
      request,
      {
        serviceKey: env.DATA_GO_KR_SERVICE_KEY,
        vworldKey: env.VWORLD_API_KEY,
        lawApiOc: env.LAW_API_OC,
        adminToken: env.ADMIN_API_TOKEN,
        fetchAsset: (assetRequest) => env.ASSETS.fetch(assetRequest),
      },
      {
        fetchUpstream: fetch,
        rateLimiter: env.API_RATE_LIMITER,
        cache: caches.default,
        waitUntil: ctx.waitUntil.bind(ctx),
        database: env.DB,
        buildingDatabase: env.DB,
        landUseDatabase: env.DB,
        ordinanceDatabase: env.DB,
        adminDatabase: env.DB,
      },
    )
  },
} satisfies ExportedHandler<WorkerEnv>
