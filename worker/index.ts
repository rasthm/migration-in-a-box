import { handleAi } from '../server/ai.ts'

// The online version on Cloudflare Workers: the built app (dist/) is served as static files,
// and POST /api/ai runs here with the key stored as a Worker secret (never in the files).
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  ANTHROPIC_API_KEY?: string
  APP_PASSCODE?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/api/ai') return env.ASSETS.fetch(request)
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    const result = await handleAi(await request.text(), { apiKey: env.ANTHROPIC_API_KEY, passcode: env.APP_PASSCODE || undefined }, request.headers.get('x-app-passcode'))
    return Response.json(result.body, { status: result.status })
  },
}
