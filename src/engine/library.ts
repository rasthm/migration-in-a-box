import type { Template } from '../types'
import { parseTemplate } from './templateSchema'

// The Library keeps saved templates in this browser's localStorage. Only template JSON
// (column names and rules) is stored: never a file and never text read from a file.
//
// Two safety rules:
//  1. Every change re-reads storage first (read, change, write). A second browser tab or an
//     older copy of the list in memory can never wipe what another tab saved.
//  2. An entry that fails the checker is NOT deleted. It stays in storage untouched and is
//     only counted ("1 saved template could not be read"), so a stricter rule later can
//     never erase anything.
const KEY = 'mib.library.v1'

export interface Store {
  templates: Template[]
  unreadable: unknown[] // entries kept as they are in storage but not shown
}

export function readStore(): Store {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return { templates: [], unreadable: [] }
    const templates: Template[] = []
    const unreadable: unknown[] = []
    for (const item of raw) {
      const r = parseTemplate(item, false)
      if (r.ok) templates.push(r.template)
      else unreadable.push(item)
    }
    return { templates, unreadable }
  } catch {
    return { templates: [], unreadable: [] }
  }
}

// Read fresh, apply the change, write back. Returns the new store, or null if the browser refused to store it.
export function mutate(change: (list: Template[]) => Template[]): Store | null {
  const fresh = readStore()
  const next = change(fresh.templates)
  try {
    localStorage.setItem(KEY, JSON.stringify([...fresh.unreadable, ...next]))
    return { templates: next, unreadable: fresh.unreadable }
  } catch {
    return null // private window or storage full
  }
}

// Save as a NEW entry (new id), after the same check the loader uses. Never overwrites.
export function addTemplate(list: Template[], t: Template): { next: Template[]; error?: string } {
  const r = parseTemplate(t, true)
  if (!r.ok) return { next: list, error: r.error }
  return { next: [...list, r.template] }
}

// Replace one saved entry (by its id) with this version, keeping that entry's id.
export function replaceTemplate(list: Template[], id: string, t: Template): { next: Template[]; error?: string } {
  const r = parseTemplate(t, true)
  if (!r.ok) return { next: list, error: r.error }
  return { next: list.map((x) => (x.id === id ? { ...r.template, id } : x)) }
}

// Name to show for an entry this version cannot read (the entry itself is never changed).
export function unreadableName(u: unknown): string {
  const n = typeof u === 'object' && u !== null ? (u as { name?: unknown }).name : undefined
  return typeof n === 'string' && n.trim() ? n.slice(0, 80) : 'Unnamed entry'
}

// Remove ONE unreadable entry, only because the user asked. Frees browser storage.
export function discardUnreadable(index: number): Store | null {
  const fresh = readStore()
  const unreadable = fresh.unreadable.filter((_, i) => i !== index)
  try {
    localStorage.setItem(KEY, JSON.stringify([...unreadable, ...fresh.templates]))
    return { templates: fresh.templates, unreadable }
  } catch {
    return null
  }
}

// A page gets its own copy with new ids, so two pages never share a template id.
export function copyForPage(t: Template): Template {
  const r = parseTemplate(t, true)
  return r.ok ? r.template : t
}

// The content of a template without its ids, used to spot an identical import.
const fingerprint = (t: Template) =>
  JSON.stringify({ n: t.name, r: t.rowMode, i: !!t.keepTotals, c: t.columns.map((c) => [c.name, c.type, c.extractor]), w: t.words ?? [] })

// Adds imported templates, skipping any identical to one already saved.
export function mergeImported(list: Template[], incoming: Template[]): { next: Template[]; skipped: number } {
  const seen = new Set(list.map(fingerprint))
  const next = [...list]
  let skipped = 0
  for (const t of incoming) {
    const f = fingerprint(t)
    if (seen.has(f)) skipped++
    else {
      seen.add(f)
      next.push(t)
    }
  }
  return { next, skipped }
}

export function exportLibraryText(list: Template[]): string {
  return JSON.stringify({ app: 'migration-in-a-box', kind: 'template-library', version: 1, templates: list }, null, 2)
}

// Accepts a whole exported library or one single template. Bad entries are reported, not trusted.
export function importLibraryText(text: string): { templates: Template[]; errors: string[] } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { templates: [], errors: ['This file is not valid JSON.'] }
  }
  const listed = (data as { templates?: unknown } | null)?.templates
  const items: unknown[] = Array.isArray(listed) ? listed : [data]
  const templates: Template[] = []
  const errors: string[] = []
  items.forEach((item, i) => {
    const r = parseTemplate(item, true)
    if (r.ok) templates.push(r.template)
    else errors.push(`Template ${i + 1}: ${r.error}`)
  })
  return { templates, errors }
}

export function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
