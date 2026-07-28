import { afterEach, describe, expect, it, vi } from "vitest"
import { createOfficialApiProxy } from "../proxy/server.mjs"

const servers = []

async function startServer(options) {
  const server = createOfficialApiProxy(options)
  servers.push(server)
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

describe("official API proxy server", () => {
  it("forwards a permitted GET only after token verification", async () => {
    const fetchUpstream = vi.fn(async () => new Response('{"ok":true}', {
      status: 201,
      headers: { "content-type": "application/json" },
    }))
    const baseUrl = await startServer({ token: "proxy-token", fetchUpstream })

    const response = await fetch(`${baseUrl}/v1/official-fetch`, {
      method: "POST",
      headers: { Authorization: "Bearer proxy-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://api.vworld.kr/ned/data/getLandUseAttr?key=provider-key",
        accept: "application/json",
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(fetchUpstream).toHaveBeenCalledTimes(1)
    const [url, init] = fetchUpstream.mock.calls[0]
    expect(String(url)).toContain("https://api.vworld.kr/ned/data/getLandUseAttr")
    expect(init).toMatchObject({ method: "GET", redirect: "manual" })
    expect(init.headers).toMatchObject({ Accept: "application/json" })
  })

  it("rejects requests without the proxy token", async () => {
    const fetchUpstream = vi.fn()
    const baseUrl = await startServer({ token: "proxy-token", fetchUpstream })

    const response = await fetch(`${baseUrl}/v1/official-fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.law.go.kr/DRF/lawSearch.do" }),
    })

    expect(response.status).toBe(401)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })

  it("rejects URLs outside the official provider allowlist", async () => {
    const fetchUpstream = vi.fn()
    const baseUrl = await startServer({ token: "proxy-token", fetchUpstream })

    const response = await fetch(`${baseUrl}/v1/official-fetch`, {
      method: "POST",
      headers: { Authorization: "Bearer proxy-token", "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/private" }),
    })

    expect(response.status).toBe(400)
    expect(fetchUpstream).not.toHaveBeenCalled()
  })
})
