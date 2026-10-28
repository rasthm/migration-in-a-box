import type { RegexResults } from './runTemplate'

const TIME_LIMIT_MS = 500

// A worker that has finished loading. Loading time does not count against the time limit.
let ready: Promise<Worker> | null = null
const getWorker = () =>
  (ready ??= new Promise<Worker>((resolve) => {
    const w = new Worker(new URL('./regexWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ ready?: boolean }>) => {
      if (e.data.ready) resolve(w)
    }
  }))

// Runs each pattern in the worker. A pattern that takes longer than the time limit is stopped
// (the worker is thrown away and a new one started) and recorded as null = timed out.
export async function runPatterns(jobs: { key: string; pattern: string; text: string }[]): Promise<RegexResults> {
  const out: RegexResults = new Map()
  let id = 0
  for (const job of jobs) {
    const w = await getWorker()
    const myId = ++id
    out.set(
      job.key,
      await new Promise<string | null>((resolve) => {
        const timer = window.setTimeout(() => {
          w.terminate()
          ready = null
          resolve(null)
        }, TIME_LIMIT_MS)
        w.onmessage = (e: MessageEvent<{ id: number; value: string }>) => {
          if (e.data.id !== myId) return
          window.clearTimeout(timer)
          resolve(e.data.value)
        }
        w.postMessage({ id: myId, pattern: job.pattern, text: job.text })
      }),
    )
  }
  return out
}
