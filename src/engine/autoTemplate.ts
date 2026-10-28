import type { Extractor, FileEntry, Template, TemplateColumn } from '../types'
import { normalizeHeader } from './pdfExtract'
import { STARTERS } from './starterTemplates'
import { codeHeader, descriptionHeader, isDescriptionLike, isSerialHeading } from './classify'
import { detailKey, detailName, headingKey, headingName } from './synonyms'

export interface Suggestion {
  template: Template
  found: number // columns whose heading / detail is in the files
  total: number // columns that need something from the files
  fromStarter: boolean
}

// Auto mode: picks the free template that fits the loaded files best. If none fits well,
// it builds one from every table heading and document detail it found. No AI involved.
export function suggestTemplate(files: FileEntry[]): Suggestion | null {
  const docs = files.map((f) => f.parsed).filter((d) => d !== undefined)
  if (docs.length === 0) return null
  const headers = new Set(docs.flatMap((d) => d.headers.map(normalizeHeader)))
  const details = new Set(docs.flatMap((d) => (d.fields ?? []).map((f) => normalizeHeader(f.label))))

  const has = (ex: Extractor): boolean | undefined => {
    switch (ex.kind) {
      case 'tableColumn':
      case 'classify':
        return headers.has(normalizeHeader(ex.header))
      case 'docField':
        return details.has(normalizeHeader(ex.label))
      default:
        return undefined // file name, page count...: always available, not counted
    }
  }

  let best: Suggestion | null = null
  for (const s of STARTERS) {
    const checks = s.template.columns.map((c) => has(c.extractor)).filter((x) => x !== undefined)
    if (checks.length === 0) continue
    const found = checks.filter(Boolean).length
    if (!best || found / checks.length > best.found / best.total) best = { template: s.template, found, total: checks.length, fromStarter: true }
  }
  if (best && best.found / best.total >= 0.6) return best

  // Nothing fits: one column per heading and per document detail found.
  const first = (key: string, list: string[]) => list.find((h) => normalizeHeader(h) === key) ?? key
  const allHeaders = [...new Set(docs.flatMap((d) => d.headers))]
  const allDetails = [...new Set(docs.flatMap((d) => (d.fields ?? []).map((f) => f.label)))]
  const col = (name: string, extractor: Extractor): TemplateColumn => ({ id: crypto.randomUUID(), name, type: 'text', extractor })
  const desc = [descriptionHeader(allHeaders)].find((h) => h && /desc|particular|item|product|goods/i.test(h)) // not "Customer Name"
  // Files that call the description "Item" in one and "Item Description" in another get one column:
  // runTemplate reads each file's own description column for it.
  const tableHeaders = [...headers].filter((h) => !desc || !isDescriptionLike(first(h, allHeaders)) || normalizeHeader(desc) === h)
  const columns = [
    ...allDetails.map((l) => col(l, { kind: 'docField', label: first(normalizeHeader(l), allDetails) })),
    ...tableHeaders.map((h) => {
      const c = col(first(h, allHeaders), { kind: 'tableColumn', header: first(h, allHeaders) })
      return /^(qty|quantity|rate|amount|amt|price|unit price|mrp|total|line total|value)\b/i.test(c.name.trim()) ? { ...c, type: 'number' as const } : c
    }),
    ...(desc ? [col('Item type', { kind: 'classify', header: desc, what: 'type' })] : []),
    col('File name', { kind: 'fileName' }),
  ]
  return {
    template: { id: crypto.randomUUID(), name: 'Auto: everything found', rowMode: headers.size > 0 ? 'tableRows' : 'onePerFile', columns },
    found: columns.length - 1,
    total: columns.length - 1,
    fromStarter: false,
  }
}

// Detail names that are bill totals, printed under the table. They go after the item columns.
const TOTAL_DETAIL = /^(taxable|subtotal|[cisu]gst|grandtotal|total|net|roundoff|roundedoff|amountpayable)/

// Every table column and every detail printed on the files, with look-alike names merged
// ("Qty" / "Quantity", "Bill No" / "Invoice No") so different sellers share one column.
// Printed serial and code columns are left out: S.No and Item Code are added by addSortingColumns.
export function everythingTemplate(files: FileEntry[]): Template | null {
  const docs = files.map((f) => f.parsed).filter((d) => d !== undefined)
  if (docs.length === 0) return null
  const col = (name: string, extractor: Extractor, type: TemplateColumn['type'] = 'text'): TemplateColumn => ({ id: crypto.randomUUID(), name, type, extractor })

  // Table columns, first seen first. A merged column is named after its meaning when files disagree.
  const headings = new Map<string, string[]>() // key -> labels as printed
  let descKey: string | undefined
  const billColumns: string[] = [] // "Bill No" / "Bill Date" kept as columns (a purchase register)
  for (const d of docs) {
    for (const h of d.headers) {
      if (isSerialHeading(h) || codeHeader([h]) === h) continue
      if (detailName(h) === 'Invoice / Bill No' || detailName(h) === 'Invoice / Bill Date') {
        billColumns.push(h)
        continue
      }
      let key = headingKey(h)
      if (isDescriptionLike(h) || h === descriptionHeader(d.headers)) key = descKey ??= key
      headings.set(key, [...(headings.get(key) ?? []), h])
    }
  }
  const tableColumns = [...headings.entries()].map(([key, labels]) => {
    const same = labels.every((l) => normalizeHeader(l) === normalizeHeader(labels[0]))
    const name = same ? labels[0] : key === descKey ? 'Description' : (headingName(labels[0]) ?? labels[0])
    const c = col(name, { kind: 'tableColumn', header: labels[0] })
    return /^(qty|quantity|rate|amount|amt|price|unit price|mrp|total|line total|value)\b/i.test(name.trim()) ? { ...c, type: 'number' as const } : c
  })

  // Printed details, split into those above the table and the totals under it.
  const details = new Map<string, string[]>()
  for (const d of docs) for (const f of d.fields ?? []) details.set(detailKey(f.label), [...(details.get(detailKey(f.label)) ?? []), f.label])
  for (const h of billColumns) details.set(detailKey(h), [...(details.get(detailKey(h)) ?? []), h]) // runTemplate reads them per row
  const detailColumn = (labels: string[]) => {
    const same = labels.every((l) => normalizeHeader(l) === normalizeHeader(labels[0]))
    const label = labels[0]
    const name = /^gstin$/i.test(label) ? 'Seller GSTIN' : /^gstin \(2\)$/i.test(label) ? 'Buyer GSTIN' : same ? label : (detailName(label) ?? label)
    const total = TOTAL_DETAIL.test(normalizeHeader(label)) && !/rate$/i.test(label)
    return col(name, { kind: 'docField', label }, total ? 'number' : /date/i.test(name) ? 'date' : 'text')
  }
  const all = [...details.values()]
  const isTotal = (labels: string[]) => TOTAL_DETAIL.test(normalizeHeader(labels[0]))
  // What people look at first comes first: the item (description, quantity, rate, amount), then
  // the bill it came from (number, date, GSTINs), then everything else, then the bill totals.
  const MAIN_TABLE = ['Qty', 'Unit', 'Rate', 'Amount']
  const MAIN_DETAILS = ['Invoice / Bill No', 'Invoice / Bill Date', 'gstin', 'gstin2', 'placeofsupply']
  const rank = (key: string, order: string[]) => (order.includes(key) ? order.indexOf(key) : order.length)
  const keyOf = (c: TemplateColumn) => (c.extractor.kind === 'tableColumn' ? headingKey(c.extractor.header) : c.extractor.kind === 'docField' ? detailKey(c.extractor.label) : '')
  const descColumn = tableColumns.filter((c) => keyOf(c) === descKey)
  const mainItem = tableColumns.filter((c) => MAIN_TABLE.includes(keyOf(c))).sort((a, b) => rank(keyOf(a), MAIN_TABLE) - rank(keyOf(b), MAIN_TABLE))
  const otherItem = tableColumns.filter((c) => keyOf(c) !== descKey && !MAIN_TABLE.includes(keyOf(c)))
  const billDetails = all
    .filter((l) => !isTotal(l))
    .map(detailColumn)
    .sort((a, b) => rank(keyOf(a), MAIN_DETAILS) - rank(keyOf(b), MAIN_DETAILS))
  const columns = [
    ...descColumn,
    ...mainItem,
    ...billDetails,
    ...otherItem,
    ...all.filter(isTotal).map(detailColumn),
    col('File name', { kind: 'fileName' }),
  ]
  return { id: crypto.randomUUID(), name: 'Everything found', rowMode: headings.size > 0 ? 'tableRows' : 'onePerFile', columns }
}
