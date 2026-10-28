import type { Extractor, FileEntry, Template, TemplateColumn } from '../types'
import { normalizeHeader } from './pdfExtract'
import { checkPattern } from './patternCheck'
import { classify, classifyWithSource, codeHeader, descriptionHeader, descriptionKey, hsnHeader, isDescriptionLike, tradePrefix } from './classify'
import { findDetail, findHeading } from './synonyms'
import { toDate, toUnit } from './normalize'

export type Mark = 'ai' | 'app' | ''

// One line of the proof sheet: what was read from a file, and whether it matches what is printed on it.
export interface ProofRow {
  file: string
  items: number
  totalsLeftOut: number
  printed: string // the printed subtotal, '' if none
  sum: number | '' // the item amounts added up, '' if there is no amount column
  matched: 'yes' | 'no' | 'no printed total'
}

export interface OutputTable {
  columns: TemplateColumn[]
  rows: (string | number)[][]
  rowFiles: string[] // the file each row came from (for one sheet per file)
  madeCodes: Set<number> // rows whose item code was made by the app (no code was printed)
  marks: Mark[][] // per cell: 'ai' = filled by AI, 'app' = made by the app (codes, keyword sorting), '' = as printed
  proof: ProofRow[]
  warnings: string[]
}

// Patterns run in a worker with a time limit (see regexWorker.ts). Results come in through this map,
// keyed by regexKey(); a pattern that is not in the map yet is run here only if no map is given.
export type RegexResults = Map<string, string | null> // null = timed out
export const regexKey = (fileId: string, pattern: string) => `${fileId}\u0000${pattern}`

// Document numbers used to spot the same document added twice.
const DOC_NUMBER_KEYS = ['invoiceno', 'invoicenumber', 'billno', 'billnumber', 'ponumber', 'pono', 'quotationno', 'quotationnumber', 'challanno']

// Runs a JSON template over every read file. Pure and local: no AI, no network.
export function runTemplate(template: Template, files: FileEntry[], regex?: RegexResults): OutputTable {
  const warnings = new Set<string>()
  const skipped: string[] = []
  const splitFiles: string[] = []
  const rows: (string | number)[][] = []
  const rowFiles: string[] = []
  const marks: Mark[][] = []
  const proof: ProofRow[] = []
  const docNumbers = new Map<string, string[]>()
  // Item codes made by the app: one per distinct description, counted per trade prefix (ELE-0001).
  const madeCodes = new Set<number>()
  const codeFor = new Map<string, string>()
  const counters = new Map<string, number>()
  const prefixes = new Map<string, string>() // trade -> its prefix in this run, so two trades never share one
  const makeCode = (description: string, trade: string) => {
    const key = descriptionKey(description)
    let code = codeFor.get(key)
    if (!code) {
      const t = trade || 'Other'
      const prefix = prefixes.get(t) ?? tradePrefix(t, prefixes)
      const n = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, n)
      code = `${prefix}-${String(n).padStart(4, '0')}`
      codeFor.set(key, code)
    }
    return code
  }
  const done = files.filter((f) => f.parsed)
  // Details / columns a file doesn't print are left blank (never made up), and reported once per name.
  const missing = new Map<string, Set<string>>()
  const miss = (what: string, fileName: string) => missing.set(what, (missing.get(what) ?? new Set<string>()).add(fileName))

  for (const file of done) {
    const doc = file.parsed!
    if (doc.rows.some((r) => r.moved)) splitFiles.push(file.name)
    const dataRows = template.keepTotals ? doc.rows : doc.rows.filter((r) => !r.summary)
    const totalLines = doc.rows.filter((r) => r.summary)
    if (template.rowMode === 'tableRows') for (const r of totalLines) skipped.push(r.summary!)
    if (doc.ocr) warnings.add(`"${file.name}" was read by OCR (scanned page). Please check the numbers.`)
    const headerIndex = new Map(doc.headers.map((h, i) => [normalizeHeader(h), i]))
    const fields = new Map((doc.fields ?? []).map((f) => [normalizeHeader(f.label), f.value]))
    // Files from different sources name the item description differently ("Particulars", "Item
    // Description"), so a description column falls back to this file's own description column.
    const descName = descriptionHeader(doc.headers)
    const descIdx = descName === undefined ? undefined : doc.headers.indexOf(descName)
    // A column is found by its own name, a name meaning the same ("Quantity" for "Qty"), or for
    // descriptions, this file's own description column.
    const columnIndex = (header: string) => {
      const same = findHeading(header, doc.headers)
      if (same !== undefined) return headerIndex.get(normalizeHeader(same))
      return isDescriptionLike(header) ? descIdx : undefined
    }
    const fieldLabels = (doc.fields ?? []).map((f) => f.label)
    const fieldValue = (label: string) => {
      const same = findDetail(label, fieldLabels)
      return same === undefined ? undefined : fields.get(normalizeHeader(same))
    }
    const hsnName = hsnHeader(doc.headers)
    const hsnIdx = hsnName === undefined ? -1 : doc.headers.indexOf(hsnName)

    // Same number from two different sellers is not a duplicate, so the seller is part of the key.
    const seller = fields.get('gstin') ?? fields.get('vendor') ?? fields.get('supplier') ?? ''
    for (const key of DOC_NUMBER_KEYS) {
      const no = fields.get(key)
      const k = `${seller}\u0000${no}`
      if (no) docNumbers.set(k, [...(docNumbers.get(k) ?? []), file.name])
    }

    // Accuracy check: the item amounts should add up to the subtotal printed on the document.
    // Only printed numbers are compared; nothing is calculated from tax rates.
    const items = doc.rows.filter((r) => !r.summary)
    const amountName = findHeading('Amount', doc.headers)
    const amountCol = amountName === undefined ? -1 : doc.headers.indexOf(amountName)
    const printed = fields.get('taxablevalue') ?? fields.get('taxableamount') ?? fields.get('subtotal') ?? fields.get('total')
    const sum = amountCol === -1 ? '' : items.reduce((s, r) => s + (Number(r.cells[amountCol].replace(/[^\d.-]/g, '')) || 0), 0)
    let matched: ProofRow['matched'] = 'no printed total'
    if (sum !== '' && printed !== undefined) {
      const want = Number(printed.replace(/[^\d.-]/g, ''))
      matched = Number.isFinite(want) && Math.abs(sum - want) <= 0.5 ? 'yes' : 'no'
      if (matched === 'no') {
        warnings.add(`"${file.name}": the item amounts add up to ${sum.toFixed(2)}, but the document prints ${printed}. An item may be missing or misread.`)
      }
    }
    proof.push({ file: file.name, items: items.length, totalsLeftOut: template.keepTotals ? 0 : totalLines.length, printed: printed ?? '', sum: sum === '' ? '' : Math.round(sum * 100) / 100, matched })

    const runPattern = (pattern: string, group: number): string => {
      if (regex) {
        const hit = regex.get(regexKey(file.id, pattern))
        if (hit === null) warnings.add(`Pattern timed out and was stopped: ${pattern}`)
        if (hit === undefined || hit === null) return ''
        return group === 0 ? hit.split('\u0000')[0] : (hit.split('\u0000')[group] ?? hit.split('\u0000')[0])
      }
      try {
        const m = new RegExp(pattern, 'i').exec(doc.fullText)
        return m ? (m[group] ?? m[0]).trim() : ''
      } catch {
        warnings.add(`Invalid pattern: ${pattern}`)
        return ''
      }
    }

    const docValue = (ex: Extractor, page: number): string => {
      switch (ex.kind) {
        case 'fileName':
          return file.name
        case 'filePath':
          return file.path
        case 'pageNumber':
          return String(page)
        case 'pageCount':
          return String(doc.pageCount)
        case 'constant':
          return ex.value
        case 'regex': {
          if (!ex.pattern) return ''
          const problem = checkPattern(ex.pattern)
          if (problem) {
            warnings.add(`Pattern not run: ${problem}`)
            return ''
          }
          return runPattern(ex.pattern, ex.group)
        }
        case 'docField': {
          const v = fieldValue(ex.label)
          if (v === undefined) miss(`detail:${ex.label}`, file.name)
          return v ?? ''
        }
        case 'rowNumber':
          return String(rows.length + 1)
        case 'tableColumn':
        case 'classify':
        case 'itemCode':
          return ''
      }
    }

    let mark: Mark = '' // set by cellValue for the cell it just made
    const cellValue = (col: TemplateColumn, cells: string[] | undefined, page: number): string | number => {
      let raw = ''
      mark = ''
      // A bill number or date kept as a column (an Excel purchase register) instead of printed above the table.
      const detailColumn = col.extractor.kind === 'docField' && fieldValue(col.extractor.label) === undefined ? findDetail(col.extractor.label, doc.headers) : undefined
      if (detailColumn !== undefined) {
        raw = cells?.[headerIndex.get(normalizeHeader(detailColumn))!] ?? ''
      } else if (col.extractor.kind === 'tableColumn') {
        const idx = columnIndex(col.extractor.header)
        if (idx === undefined) miss(`column:${col.extractor.header}`, file.name)
        else raw = cells?.[idx] ?? ''
      } else if (col.extractor.kind === 'classify') {
        const idx = columnIndex(col.extractor.header)
        if (idx === undefined) miss(`column:${col.extractor.header}`, file.name)
        else {
          const r = classifyWithSource(cells?.[idx] ?? '', col.extractor.what, template.words, hsnIdx === -1 ? '' : (cells?.[hsnIdx] ?? ''))
          raw = r.value
          mark = r.source === 'ai' ? 'ai' : r.source === 'rules' ? 'app' : ''
        }
      } else if (col.extractor.kind === 'itemCode') {
        const ex = col.extractor
        const codeName = ex.codeHeader ?? codeHeader(doc.headers)
        const codeIdx = codeName ? columnIndex(codeName) : undefined
        const printed = codeIdx === undefined ? '' : (cells?.[codeIdx] ?? '').trim()
        const at = columnIndex(ex.header)
        const description = at === undefined ? '' : (cells?.[at] ?? '').trim()
        if (printed) raw = printed
        else if (description) {
          raw = makeCode(description, classify(description, 'trade', template.words, hsnIdx === -1 ? '' : (cells?.[hsnIdx] ?? '')))
          madeCodes.add(rows.length)
          mark = 'app'
        }
      } else {
        raw = docValue(col.extractor, page)
      }
      switch (col.type) {
        case 'number':
          return toNumber(raw, col.name, warnings)
        case 'date': {
          if (raw.trim() === '') return ''
          const d = toDate(raw)
          if (d === null) warnings.add(`Some "${col.name}" values aren't dates it can read, so they were kept as printed`)
          return d ?? raw
        }
        case 'unit':
          return toUnit(raw)
        default:
          return raw
      }
    }

    // One output row, with a mark per cell saying whether AI or the app filled it.
    const pushRow = (cells: string[] | undefined, page: number, skip?: (c: TemplateColumn) => boolean) => {
      const m: Mark[] = []
      rows.push(
        template.columns.map((c) => {
          if (skip?.(c)) {
            m.push('')
            return ''
          }
          const v = cellValue(c, cells, page)
          m.push(mark)
          return v
        }),
      )
      marks.push(m)
      rowFiles.push(file.name)
    }

    if (template.rowMode === 'tableRows') {
      if (doc.rows.length === 0) warnings.add(`"${file.name}": no table found`)
      for (const r of dataRows) {
        // Total / tax lines are not items: no S.No or item code for them.
        if (r.summary && template.keepTotals) pushRow(r.cells, r.page, (c) => c.extractor.kind === 'rowNumber' || c.extractor.kind === 'itemCode')
        else pushRow(r.cells, r.page)
      }
    } else {
      pushRow(dataRows[0]?.cells, 1)
    }
  }

  if (missing.size > 0) {
    const list = [...missing.keys()].map((what) => what.slice(what.indexOf(':') + 1))
    warnings.add(`Left blank where a file doesn't print them (nothing is made up): ${list.join(', ')}.`)
  }
  for (const [key, names] of docNumbers) {
    if (names.length > 1) warnings.add(`Same document number ${key.split('\u0000')[1]} in ${names.length} files: ${names.join(', ')}. It may have been added twice.`)
  }
  if (splitFiles.length > 0) {
    const which = splitFiles.length === 1 ? `"${splitFiles[0]}"` : `${splitFiles.length} files`
    warnings.add(`In ${which}, two numbers under one heading were split into two columns in some rows (for example Qty and Rate). Please check them.`)
  }
  // When the totals are already columns, leaving their lines out as item rows needs no explaining.
  const totalsAsColumns = template.columns.some((c) => c.extractor.kind === 'docField' && /total|taxable|gst/i.test(c.extractor.label))
  if (skipped.length > 0 && !totalsAsColumns) {
    const names = [...new Set(skipped)].slice(0, 4).join(', ')
    const n = skipped.length
    warnings.add(
      template.keepTotals
        ? `${n} lines look like totals (${names}...). They are included because "Keep total and tax lines" is ticked.`
        : `Left out ${n} total / tax lines (${names}...) as rows. Add them as columns from "Document details" to show them on every row, or tick "Keep total and tax lines".`,
    )
  }
  return { columns: template.columns, rows, rowFiles, madeCodes, marks, proof, warnings: [...warnings] }
}

function toNumber(raw: string, column: string, warnings: Set<string>): string | number {
  if (raw === '') return ''
  const cleaned = raw.replace(/₹|rs\.?|inr|,|\s/gi, '')
  const n = Number(cleaned)
  if (cleaned !== '' && Number.isFinite(n)) return n
  warnings.add(`Some "${column}" values aren't numbers, so they were kept as text`)
  return raw
}
