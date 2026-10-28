import { useEffect, useState } from 'react'
import type { ConversionPage } from './types'
import { ConversionPageView } from './components/ConversionPageView'
import { LibraryPanel } from './components/LibraryPanel'
import { SimpleFlow } from './components/SimpleFlow'
import './App.css'

const VIEW_KEY = 'mib.view'
const readView = (): 'simple' | 'advanced' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

const newPage = (n: number): ConversionPage => ({
  id: crypto.randomUUID(),
  name: `Page ${n}`,
  files: [],
  template: { id: crypto.randomUUID(), name: '', rowMode: 'tableRows', columns: [] },
})

export default function App() {
  const [pages, setPages] = useState<ConversionPage[]>(() => [newPage(1)])
  const [activeId, setActiveId] = useState(pages[0].id)
  const active = pages.find((p) => p.id === activeId) ?? pages[0]
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  // Simple: one step at a time for first-time users. Advanced: pages, Library and the full builder.
  const [view, setViewState] = useState(readView)
  const setView = (v: 'simple' | 'advanced') => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // private window: the choice just isn't remembered
    }
  }
  const updateActive = (update: (p: ConversionPage) => ConversionPage) => setPages((all) => all.map((p) => (p.id === active.id ? update(p) : p)))

  // Pages and files live only in memory, so warn before a refresh or tab close loses them.
  const hasWork = pages.some((p) => p.files.length > 0 || p.template.columns.length > 0)
  useEffect(() => {
    if (!hasWork) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasWork])

  const addPage = () => {
    const page = newPage(pages.length + 1)
    setPages([...pages, page])
    setActiveId(page.id)
  }

  const removePage = (id: string) => {
    if (pages.length === 1) return
    const rest = pages.filter((p) => p.id !== id)
    setPages(rest)
    if (id === activeId) setActiveId(rest[0].id)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▣</span> Migration-in-a-box
        </div>
        <div className="topbar-right">
          <p className="privacy">🔒 Your files stay on this computer</p>
          <button className="view-switch" onClick={() => setView(view === 'simple' ? 'advanced' : 'simple')}>
            {view === 'simple' ? 'Advanced ⚙' : '← Simple view'}
          </button>
        </div>
      </header>

      {view === 'simple' && <SimpleFlow key={active.id} page={active} onChange={updateActive} onAdvanced={() => setView('advanced')} />}
      {view === 'advanced' && (
        <>

      <nav className="tabs">
        {pages.map((p) => (
          <div key={p.id} className={`tab ${p.id === active.id ? 'active' : ''}`} onClick={() => setActiveId(p.id)}>
            <input
              value={p.name}
              aria-label="Page name"
              onChange={(e) => setPages(pages.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
            />
            {pages.length > 1 && (
              <button
                className="icon"
                title="Close page"
                onClick={(e) => {
                  e.stopPropagation()
                  removePage(p.id)
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="tab add" onClick={addPage}>
          + New page
        </button>
      </nav>

      <div className="modebar">
        <div className="segmented">
          <button className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>
            Manual
          </button>
          <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')} title="Suggests a template from the files you add">
            Auto
          </button>
        </div>
        <span className="muted small">PDF, Excel or CSV → Excel</span>
      </div>

      <LibraryPanel
        current={active.template}
        onUse={(template) => setPages((all) => all.map((p) => (p.id === active.id ? { ...p, template } : p)))}
      />

      <ConversionPageView key={active.id} page={active} auto={mode === 'auto'} onChange={updateActive} />
        </>
      )}
    </div>
  )
}
