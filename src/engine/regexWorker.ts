// Runs one pattern at a time off the main thread, so a slow pattern can be stopped
// without freezing the tab. Replies with the match and its groups joined by \u0000.
self.postMessage({ ready: true }) // the time limit only starts once the worker has loaded

self.onmessage = (e: MessageEvent<{ id: number; pattern: string; text: string }>) => {
  const { id, pattern, text } = e.data
  try {
    const m = new RegExp(pattern, 'i').exec(text)
    self.postMessage({ id, value: m ? [...m].map((g) => (g ?? '').trim()).join('\u0000') : '' })
  } catch {
    self.postMessage({ id, value: '' })
  }
}
