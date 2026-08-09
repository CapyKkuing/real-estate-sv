export function handleMapConfigRequest(request: Request, javascriptKey?: string): Response {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  }

  const body = javascriptKey
    ? { provider: 'kakao', javascriptKey }
    : { provider: 'openfreemap' }

  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
