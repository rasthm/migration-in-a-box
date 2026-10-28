import type { Extractor, FileEntry, Template, TemplateColumn } from '../types'
import { normalizeHeader } from './pdfExtract'
import { codeHeader, descriptionHeader, isSerialHeading } from './classify'
import { everythingTemplate } from './autoTemplate'
import { askClaude, buildPayload } from './aiAgent'
import { itemsToSort, mergeAiWords, sortWithAi } from './aiSort'
import { copyForPage } from './library'

const col = (name: string, extractor: Extractor, type: TemplateColumn['type'] = 'text'): TemplateColumn => ({
  id: crypto.randomUUID(),
  name,
  type,
  extractor,
})

// Adds S.No, Item Code, Trade, Item type and Material around the item description, unless the
// template already has them. Templates without an item table (one row per file) are left as they are.
export function addSortingColumns(t: Template, files: FileEntry[]): Template {
  if (t.rowMode !== 'tableRows') return t
  const headers = [...new Set(files.flatMap((f) => f.parsed?.headers ?? []))]
  const existing = t.columns.find((c) => c.extractor.kind === 'classify' || c.extractor.kind === 'itemCode')?.extractor as { header: string } | undefined
  const desc = existing?.header ?? descriptionHeader(headers)
  if (!desc) return t
  const code = codeHeader(headers)
  const same = (a: string, b: string) => normalizeHeader(a) === normalizeHeader(b)
  const has = (pred: (e: Extractor) => boolean) => t.columns.some((c) => pred(c.extractor))

  // The printed code column is replaced by Item Code, which keeps printed codes and fills blanks,
  // and a printed serial column (S.No, Sr) by our own S.No, which counts across all files.
  let columns = t.columns.filter((c) => {
    if (c.extractor.kind !== 'tableColumn') return true
    if (code && !has((e) => e.kind === 'itemCode') && same(c.extractor.header, code)) return false
    return !(isSerialHeading(c.extractor.header) && !has((e) => e.kind === 'rowNumber'))
  })
  const named = (what: 'trade' | 'type' | 'material', name: string) =>
    columns.find((c) => c.extractor.kind === 'classify' && c.extractor.what === what) ?? col(name, { kind: 'classify', header: desc, what })
  const sorting = [named('trade', 'Trade'), named('type', 'Item type'), named('material', 'Material')]
  columns = columns.filter((c) => !sorting.includes(c))
  let at = columns.findIndex((c) => c.extractor.kind === 'tableColumn' && same(c.extractor.header, desc))
  if (at === -1) {
    columns = [col(desc, { kind: 'tableColumn', header: desc }), ...columns]
    at = 0
  }
  columns = [...columns.slice(0, at + 1), ...sorting, ...columns.slice(at + 1)]
  const front = [
    ...(has((e) => e.kind === 'rowNumber') ? [] : [col('S.No', { kind: 'rowNumber' }, 'number')]),
    ...(has((e) => e.kind === 'itemCode') ? [] : [col('Item Code', { kind: 'itemCode', header: desc, ...(code ? { codeHeader: code } : {}) })]),
  ]
  return { ...t, columns: [...front, ...columns] }
}

export interface BuildResult {
  template: Template
  notes: string[] // shown to the user: what happened, including anything that didn't work
  needsPasscode?: boolean
}

// Builds the Excel by itself: picks the format (a ready format if given, AI if the user typed a
// wish, else Auto), adds the sorting columns, then lets AI sort the items the rules could not place.
export async function buildWithAi(
  files: FileEntry[],
  wish: string,
  current: Template,
  onStep: (text: string) => void,
  ready?: Template,
): Promise<BuildResult> {
  const notes: string[] = []
  let base: Template | null = ready ? copyForPage(ready) : null
  if (!base && wish.trim()) {
    onStep('Asking AI for the Excel format you described…')
    const r = await askClaude(buildPayload(files, wish, false))
    if ('template' in r) base = r.template
    else {
      notes.push(`AI could not make the format you described (${r.error}). Used the best ready format instead.`)
      if (r.needsPasscode) return { template: current, notes, needsPasscode: true }
    }
  }
  if (!base) base = everythingTemplate(files)
  if (!base) return { template: current, notes: ['No readable files yet.'] }
  let template = addSortingColumns({ ...base, words: current.words }, files)

  const items = itemsToSort(template, files)
  if (items.length > 0) {
    onStep(`AI is sorting ${items.length} item${items.length === 1 ? '' : 's'}…`)
    const r = await sortWithAi(items, template, (done, total) => onStep(`AI is sorting items… ${done} of ${total}`))
    template = mergeAiWords(template, r.words)
    if (!r.ok) {
      notes.push(`AI sorting stopped: ${r.error} Items it did not reach are left blank.`)
      if (r.needsPasscode) return { template, notes, needsPasscode: true }
    } else if (r.unsure > 0) notes.push(`AI was not sure about ${r.unsure} item${r.unsure === 1 ? '' : 's'}. Please check them below.`)
  }
  return { template, notes }
}
