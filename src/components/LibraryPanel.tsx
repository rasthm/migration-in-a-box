import { useEffect, useRef, useState } from 'react'
import type { Template } from '../types'
import {
  addTemplate,
  copyForPage,
  discardUnreadable,
  downloadText,
  exportLibraryText,
  importLibraryText,
  mergeImported,
  mutate,
  readStore,
  replaceTemplate,
  unreadableName,
} from '../engine/library'

interface Props {
  current: Template // the template on the page being viewed
  onUse: (t: Template) => void // replaces that page's template
}

export function LibraryPanel({ current, onUse }: Props) {
  const [store, setStore] = useState(readStore)
  const [msg, setMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const { templates: list, unreadable } = store

  // Another browser tab changed the Library: show its version.
  useEffect(() => {
    const onStorage = () => setStore(readStore())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Read the stored list again, apply the change, write it. Never writes from a stale copy.
  const change = (fn: (fresh: Template[]) => { next: Template[]; error?: string }, ok: string): boolean => {
    let error: string | undefined
    const saved = mutate((fresh) => {
      const r = fn(fresh)
      error = r.error
      return r.next
    })
    if (error) {
      setMsg(error)
      return false
    }
    if (!saved) {
      setMsg('Could not save in this browser. Use Export to keep a copy.')
      return false
    }
    setStore(saved)
    setMsg(ok)
    return true
  }

  const saveNew = () => {
    if (!current.name.trim()) return setMsg('Give the template a name first (Template name box).')
    if (current.columns.length === 0) return setMsg('Add at least one column first.')
    change((fresh) => addTemplate(fresh, current), `Saved "${current.name}" as a new entry.`)
  }

  const replace = (t: Template) => {
    if (current.columns.length === 0) return setMsg('This page has no columns to save yet.')
    const sure = window.confirm(
      `Replace the saved "${t.name}" with this page's template ("${current.name || 'no name'}")? The old version cannot be brought back.`,
    )
    if (sure) change((fresh) => replaceTemplate(fresh, t.id, current), `Replaced "${t.name}".`)
  }

  const remove = (t: Template) => {
    if (!window.confirm(`Delete the saved "${t.name}"?`)) return
    change((fresh) => ({ next: fresh.filter((x) => x.id !== t.id) }), `Deleted "${t.name}".`)
  }

  const dropUnreadable = (i: number) => {
    if (!window.confirm('Delete this entry for good? It cannot be brought back. Use Export first if you want a copy.')) return
    const saved = discardUnreadable(i)
    if (saved) {
      setStore(saved)
      setMsg('Removed one entry.')
    } else setMsg('Could not save in this browser.')
  }

  const use = (t: Template) => {
    const ok = current.columns.length === 0 || window.confirm("Replace this page's template with the saved one?")
    if (ok) onUse(copyForPage(t))
  }

  const importFile = async (file: File) => {
    const { templates, errors } = importLibraryText(await file.text())
    if (templates.length === 0) return setMsg(errors.join(' ') || 'Nothing to import.')
    let skipped = 0
    const done = change((fresh) => {
      const m = mergeImported(fresh, templates)
      skipped = m.skipped
      return { next: m.next }
    }, '')
    if (done) setMsg(`Imported ${templates.length - skipped} template(s)${skipped ? `, skipped ${skipped} already saved` : ''}. ${errors.join(' ')}`)
  }

  return (
    <details className="library">
      <summary>Library ({list.length} saved)</summary>
      <p className="muted small">
        Saved templates stay in this browser only. They hold column names and rules, which can include heading words from your files. Your files and their contents are never saved. Clearing browser data erases them, so use Export for a backup.
      </p>
      {unreadable.length > 0 && (
        <div className="small" role="status">
          <p>
            {unreadable.length} saved template(s) could not be read by this version. They are still kept; nothing was deleted
            unless you delete it here.
          </p>
          <ul className="lib-list">
            {unreadable.map((u, i) => (
              <li key={i} className="row space">
                <span>{unreadableName(u)}</span>
                <span className="row">
                  <button onClick={() => downloadText(JSON.stringify(u, null, 2), `unreadable-${i + 1}.json`)}>Export</button>
                  <button className="danger" onClick={() => dropUnreadable(i)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="row">
        <button className="primary" onClick={saveNew}>
          Save this page&apos;s template as new
        </button>
        <button disabled={list.length === 0} onClick={() => downloadText(exportLibraryText(list), 'migration-library.json')}>
          Export
        </button>
        <button onClick={() => importRef.current?.click()}>Import</button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importFile(f)
          }}
        />
      </div>
      {msg && (
        <p className="small" role="status">
          {msg}
        </p>
      )}
      <ul className="lib-list">
        {list.map((t) => (
          <li key={t.id} className="row space">
            <span>
              <strong>{t.name || 'Untitled'}</strong>{' '}
              <span className="muted small">
                {t.columns.length} columns · {t.rowMode === 'tableRows' ? 'one row per table row' : 'one row per file'}
              </span>
            </span>
            <span className="row">
              <button onClick={() => use(t)}>Use</button>
              <button onClick={() => replace(t)} title="Overwrite this saved entry with the template on the current page">
                Replace with this page
              </button>
              <button className="danger" onClick={() => remove(t)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
