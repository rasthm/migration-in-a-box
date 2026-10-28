import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { handleAi, type AiEnv } from './server/ai.ts'

// POST /api/ai on the laptop (npm run dev / npm run preview). The key is read from .env here,
// on the Node side; it has no VITE_ prefix, so Vite never puts it in the browser code. No passcode
// here: the laptop version is only reachable from this computer.
function aiApi(env: AiEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
      if (raw.length > 100_000) req.destroy()
    })
    req.on('end', async () => {
      const passcode = req.headers['x-app-passcode']
      const result = await handleAi(raw, env, typeof passcode === 'string' ? passcode : null)
      res.statusCode = result.status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result.body))
    })
  }
  return {
    name: 'ai-api',
    configureServer: (server) => void server.middlewares.use('/api/ai', middleware),
    configurePreviewServer: (server) => void server.middlewares.use('/api/ai', middleware),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), aiApi({ apiKey: env.ANTHROPIC_API_KEY })],
  }
})
