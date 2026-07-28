import { timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"
import { Readable } from "node:stream"

const ALLOWED_HOSTS = new Set(["apis.data.go.kr", "api.vworld.kr", "www.law.go.kr"])
const MAX_REQUEST_BYTES = 8 * 1024

function json(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  })
  response.end(JSON.stringify(payload))
}

function isAuthorized(value, token) {
  if (!value?.startsWith("Bearer ")) return false
  const provided = Buffer.from(value.slice("Bearer ".length))
  const expected = Buffer.from(token)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

async function readRequestJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error("request-too-large")
      error.code = "request-too-large"
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    const error = new Error("invalid-json")
    error.code = "invalid-json"
    throw error
  }
}

function isAllowedTarget(url) {
  return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname)
}

function responseHeaders(upstream) {
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream"
  return {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  }
}

export function createOfficialApiProxy({ token, fetchUpstream = fetch, logger = console }) {
  if (!token) throw new Error("OFFICIAL_PROXY_TOKEN is required")

  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      return json(response, 200, { ok: true })
    }
    if (request.method !== "POST" || request.url !== "/v1/official-fetch") {
      return json(response, 404, { error: "not-found" })
    }
    if (!isAuthorized(request.headers.authorization, token)) {
      return json(response, 401, { error: "unauthorized" })
    }

    let payload
    try {
      payload = await readRequestJson(request)
    } catch (error) {
      return json(response, error.code === "request-too-large" ? 413 : 400, { error: "invalid-request" })
    }

    if (!payload || typeof payload.url !== "string") {
      return json(response, 400, { error: "invalid-request" })
    }

    let target
    try {
      target = new URL(payload.url)
    } catch {
      return json(response, 400, { error: "invalid-target" })
    }
    if (!isAllowedTarget(target)) {
      return json(response, 400, { error: "target-not-allowed" })
    }

    const accept = typeof payload.accept === "string" && payload.accept.length <= 120
      ? payload.accept
      : "application/json"
    try {
      const upstream = await fetchUpstream(target, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: accept,
          "User-Agent": "real-estate-sv-official-proxy/1.0",
        },
      })
      response.writeHead(upstream.status, responseHeaders(upstream))
      if (!upstream.body) return response.end()
      Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response)
    } catch (error) {
      logger.error("Official provider request failed", {
        host: target.hostname,
        name: error instanceof Error ? error.name : "UnknownError",
      })
      return json(response, 502, { error: "official-provider-unavailable" })
    }
  })
}

if (process.argv[1] && import.meta.url === new URL(`file:${process.argv[1]}`).href) {
  const server = createOfficialApiProxy({ token: process.env.OFFICIAL_PROXY_TOKEN })
  server.listen(Number(process.env.PORT ?? "8080"), "0.0.0.0")
}
