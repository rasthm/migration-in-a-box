import type { Template } from '../types'

// The column order the user arranged by dragging. It is remembered by column name in this browser,
// so "Redo with AI" or adding files keeps it. Columns not in the saved order keep their place after it.

const KEY = 'mib.columnOrder'

export function moveColumn(template: Template, from: number, to: number): Template {
  if (from === to || from < 0 || to < 0 || from >= template.columns.length || to >= template.columns.length) return template
  const columns = [...template.columns]
  const [moved] = columns.splice(from, 1)
  columns.splice(to, 0, moved)
  return { ...template, columns }
}

export function readOrder(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function saveOrder(template: Template) {
  try {
    localStorage.setItem(KEY, JSON.stringify(template.columns.map((c) => c.name)))
  } catch {
    // private window: the order just isn't remembered
  }
}

export function clearOrder() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

// Puts the columns in the saved order. Sorting is stable, so unsaved columns keep their relative order.
export function applyOrder(template: Template, order: string[] = readOrder()): Template {
  if (order.length === 0) return template
  const rank = (name: string) => {
    const i = order.indexOf(name)
    return i === -1 ? order.length : i
  }
  const columns = template.columns.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.name) - rank(b.c.name) || a.i - b.i).map((x) => x.c)
  return { ...template, columns }
}
