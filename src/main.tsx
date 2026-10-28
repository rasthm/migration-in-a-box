import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev only: ?demo=<delay ms>&d=<scene ms,...> plays the recorded walkthrough (demo/recorder.js).
const demo = new URLSearchParams(location.search)
if (import.meta.env.DEV && demo.has('demo')) {
  const scenes = (demo.get('d') ?? '').split(',').map(Number)
  setTimeout(async () => {
    const url = '/demo/recorder.js' // outside src, so a variable keeps TypeScript and the build from resolving it
    await import(/* @vite-ignore */ url)
    ;(window as unknown as { runDemo: (ms: number[]) => void }).runDemo(scenes)
  }, Number(demo.get('demo')) || 0)
}
