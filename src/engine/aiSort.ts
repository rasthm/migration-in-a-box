import type { FileEntry, TaughtWord, Template } from '../types'
import { normalizeHeader } from './pdfExtract'
import { TRADES, descriptionHeader, descriptionKey, hasAnswer, hsnHeader } from './classify'
import { callAi } from './aiClient'

// AI sorting: every distinct item description gets a trade and an item type from AI, which sees
// items in document order and so has context ("Hook and eye" on a tailoring bill is not door
// hardware). Only the description and its HSN code (if printed) are sent: never files, prices,
// invoice numbers, GSTIN or names. Material is never asked for: it comes only from the printed
// description. Words the user taught and earlier answers are not sent again.

const BATCH = 60
const PARALLEL = 4
const MAX_ITEMS = 3000

export interface SortItem {
  text: string
  hsn: string
}

// Distinct item descriptions, in document order, that have no answer yet.
// Every item description in the files, in document order, with its HSN code if printed.
function* itemDescriptions(template: Template, files: FileEntry[]): Generator<SortItem> {
  const fromTemplate = template.columns.flatMap((c) => (c.extractor.kind === 'classify' || c.extractor.kind === 'itemCode' ? [c.extractor.header] : []))
  for (const f of files) {
    const doc = f.parsed
    if (!doc || doc.headers.length === 0) continue
    const norm = doc.headers.map(normalizeHeader)
    const descName = fromTemplate.find((h) => norm.includes(normalizeHeader(h))) ?? descriptionHeader(doc.headers)
    if (!descName) continue
    const descIdx = norm.indexOf(normalizeHeader(descName))
    const hsnName = hsnHeader(doc.headers)
    const hsnIdx = hsnName === undefined ? -1 : doc.headers.indexOf(hsnName)
    for (const r of doc.rows) {
      if (r.summary) continue
      const text = (r.cells[descIdx] ?? '').trim().slice(0, 300)
      if (text.length < 2 || !/[a-z]/i.test(text)) continue
      yield { text, hsn: hsnIdx === -1 ? '' : (r.cells[hsnIdx] ?? '').trim().slice(0, 20) }
    }
  }
}

// The descriptions (as keys) of the files in the list now. "Please check" shows only these, so a
// removed file's items don't linger there.
export const descriptionsIn = (template: Template, files: FileEntry[]) => new Set([...itemDescriptions(template, files)].map((i) => descriptionKey(i.text)))

// Distinct item descriptions, in document order, that have no answer yet.
export function itemsToSort(template: Template, files: FileEntry[]): SortItem[] {
  const seen = new Map<string, SortItem>()
  for (const item of itemDescriptions(template, files)) {
    const key = descriptionKey(item.text)
    if (seen.has(key) || hasAnswer(item.text, template.words)) continue
    seen.set(key, item)
    if (seen.size >= MAX_ITEMS) break
  }
  return [...seen.values()]
}

interface SortAnswer {
  id: string
  trade: string
  itemType: string
  confidence: 'high' | 'low'
  reason: string
}

export type SortOutcome = { ok: true; words: TaughtWord[]; unsure: number } | { ok: false; error: string; needsPasscode?: boolean; words: TaughtWord[] }

// The trades to offer: the built-in list plus any the AI already named for this job.
export const knownTrades = (template: Template) => [
  ...new Set([...TRADES.map((t) => t.name), ...(template.words ?? []).flatMap((w) => (w.trade ? [w.trade] : []))]),
]

export async function sortWithAi(items: SortItem[], template: Template, onProgress?: (done: number, total: number) => void): Promise<SortOutcome> {
  const trades = knownTrades(template)
  const words: TaughtWord[] = []
  let done = 0

  const sortBatch = async (batch: SortItem[]): Promise<{ error: string; needsPasscode?: boolean } | null> => {
    const r = await callAi<{ results: SortAnswer[] }>({
      action: 'sort',
      trades: trades.slice(0, 60),
      items: batch.map((it, i) => ({ id: String(i), text: it.text, ...(it.hsn ? { hsn: it.hsn } : {}) })),
    })
    if (!r.ok) return r
    for (const a of r.data.results ?? []) {
      const item = batch[Number(a.id)]
      if (!item) continue
      // A trade the AI named before is kept in the same spelling; a new one joins the list.
      const named = a.trade.trim().replace(/\s+/g, ' ').slice(0, 40) || 'Other'
      const trade = trades.find((t) => t.toLowerCase() === named.toLowerCase()) ?? named
      if (!trades.includes(trade)) trades.push(trade)
      const type = a.itemType.trim().slice(0, 60)
      words.push({
        word: item.text,
        trade,
        ...(type ? { type } : {}),
        ai: true,
        ...(a.confidence !== 'high' ? { check: true } : {}),
        ...(a.reason ? { reason: a.reason.trim().slice(0, 200) } : {}),
      })
    }
    done += batch.length
    onProgress?.(done, items.length)
    return null
  }

  const batches: SortItem[][] = []
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH))
  // The first batch runs alone so the trade names it picks are reused by all the others.
  let failed = batches.length > 0 ? await sortBatch(batches[0]) : null
  for (let i = 1; i < batches.length && !failed; i += PARALLEL) {
    const results = await Promise.all(batches.slice(i, i + PARALLEL).map(sortBatch))
    failed = results.find((r) => r !== null) ?? null
  }
  if (failed) return { ok: false, error: failed.error, needsPasscode: failed.needsPasscode, words }
  return { ok: true, words, unsure: words.filter((w) => w.check).length }
}

// Adds AI answers to the template, replacing older answers for the same description.
export function mergeAiWords(template: Template, answers: TaughtWord[]): Template {
  const keys = new Set(answers.map((w) => descriptionKey(w.word)))
  const kept = (template.words ?? []).filter((w) => !(w.ai && keys.has(descriptionKey(w.word))))
  return { ...template, words: [...kept, ...answers] }
}
