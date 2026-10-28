// Talks to our own server part (POST /api/ai), which holds the Anthropic key. The browser never
// sees the key. On the online version an optional passcode can be required; it is kept for this tab only.

const PASS_KEY = 'mib.passcode'

export function getPasscode(): string {
  try {
    return sessionStorage.getItem(PASS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setPasscode(v: string) {
  try {
    sessionStorage.setItem(PASS_KEY, v)
  } catch {
    // private window: asked again next time
  }
}

export type AiResponse<T> = { ok: true; data: T } | { ok: false; error: string; needsPasscode?: boolean }

export async function callAi<T>(body: unknown): Promise<AiResponse<T>> {
  let res: Response
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-passcode': getPasscode() },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: 'Could not reach the AI. Check the internet connection.' }
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // not JSON: handled below
  }
  if (res.ok && data !== null) return { ok: true, data: data as T }
  const d = (data ?? {}) as { error?: string; needsPasscode?: boolean }
  if (res.status === 404) return { ok: false, error: 'AI is not available here (no /api/ai). Run the app with npm run dev, or use the online version.' }
  return { ok: false, error: d.error ?? `AI request failed (${res.status}).`, needsPasscode: d.needsPasscode }
}
