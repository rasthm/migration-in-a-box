import { getDocument, GlobalWorkerOptions, PDFWorker } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { DocField, ParsedDoc, TableRow } from '../types'

GlobalWorkerOptions.workerSrc = workerUrl

// One worker shared by every file. A worker we pass in isn't destroyed with the
// loading task, so big folders don't start a new worker per file.
let sharedWorker: PDFWorker | null = null
export const worker = () => {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new PDFWorker()
  return sharedWorker
}

export interface Piece {
  text: string
  x: number
  x2: number
}

export interface Cell extends Piece {
  parts: Piece[] // the separate text items this cell was joined from
}

export interface Line {
  page: number
  y: number
  cells: Cell[]
}

const hasDigit = (s: string) => /\d/.test(s)
const isNumberLike = (s: string) => /^[₹$]?\s*[-+]?[\d,]+(\.\d+)?\s*%?$/.test(s.trim())
export const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

// Reads a PDF entirely in the browser and returns its text lines, a detected
// table and the full text. Fonts aren't turned into web fonts since we only need text.
export async function readPdf(file: File): Promise<ParsedDoc> {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({ data, worker: worker(), disableFontFace: true, enableXfa: false })
  const doc = await task.promise
  const lines: Line[] = []
  const pagesWithoutText: number[] = []
  const textParts: string[] = []

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = content.items.filter(
        (it): it is TextItem => 'str' in it && it.str.trim() !== '',
      )
      if (items.length === 0) pagesWithoutText.push(p)
      const pageLines = groupIntoLines(items, p)
      lines.push(...pageLines)
      textParts.push(pageLines.map((l) => l.cells.map((c) => c.text).join('  ')).join('\n'))
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }

  const { headers, rows, headerIndex } = detectTable(lines)
  return {
    pageCount: textParts.length,
    pagesWithoutText,
    headers,
    rows,
    fields: docFields(headerIndex === -1 ? lines : lines.slice(0, headerIndex), rows),
    fullText: textParts.join('\n'),
  }
}

export function groupIntoLines(items: TextItem[], page: number): Line[] {
  const pieces = items
    .map((it) => {
      const h = Math.abs(it.transform[3]) || it.height || 10
      return { text: it.str, x: it.transform[4], x2: it.transform[4] + it.width, y: it.transform[5], h }
    })
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const raw: { y: number; h: number; pieces: typeof pieces }[] = []
  for (const piece of pieces) {
    const line = raw.find((l) => Math.abs(l.y - piece.y) <= Math.max(2, Math.min(l.h, piece.h) * 0.5))
    if (line) line.pieces.push(piece)
    else raw.push({ y: piece.y, h: piece.h, pieces: [piece] })
  }

  return raw
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const sorted = l.pieces.sort((a, b) => a.x - b.x)
      const cells: Cell[] = []
      for (const piece of sorted) {
        const prev = cells[cells.length - 1]
        // A gap wider than about one character height starts a new column.
        if (prev && piece.x - prev.x2 < l.h * 1.0) {
          const joiner = piece.x - prev.x2 > l.h * 0.15 && !prev.text.endsWith(' ') ? ' ' : ''
          prev.text += joiner + piece.text
          prev.x2 = Math.max(prev.x2, piece.x2)
          prev.parts.push({ text: piece.text, x: piece.x, x2: piece.x2 })
        } else {
          cells.push({ text: piece.text, x: piece.x, x2: piece.x2, parts: [{ text: piece.text, x: piece.x, x2: piece.x2 }] })
        }
      }
      cells.forEach((c) => (c.text = c.text.trim()))
      return { page, y: l.y, cells: cells.filter((c) => c.text !== '') }
    })
}

function isHeaderLine(line: Line, minCells: number) {
  if (line.cells.length < minCells) return false
  const wordy = line.cells.filter((c) => /[a-zA-Z]/.test(c.text) && !isNumberLike(c.text))
  return wordy.length / line.cells.length >= 0.75 && line.cells.filter((c) => hasDigit(c.text)).length <= 1
}

// Numbers are often right-aligned under a left-aligned header, so a Qty value can reach into
// the span of the "Rate" header (or pdf.js joins them into one item, "4 2,150.00").
// When a column gets two or more numbers, they start LEFT of that column's header, and the
// columns just before it are empty, hand the earlier numbers to those columns. The last stays.
// A cell that starts more than 1.5 points to the right of its own header ("10 5" indented under Rate) is never moved.
function layoutRow(line: Line, header: Cell[]): { out: string[]; moved: boolean } {
  const parts: Cell[][] = header.map(() => [])
  for (const cell of line.cells) {
    // Columns printed close together ("120" right-aligned under Qty, "Mtr" under Unit) arrive as one
    // cell. When its words sit under different headings with a real gap between them, split it there.
    const cols = cell.parts.map((p) => columnFor({ ...p, parts: [p] }, header))
    const splits = cell.parts.some((p, i) => i > 0 && cols[i] !== cols[i - 1] && p.x - cell.parts[i - 1].x2 >= 3)
    if (splits) cell.parts.forEach((p, i) => parts[cols[i]].push({ ...p, parts: [p] }))
    else parts[columnFor(cell, header)].push(cell)
  }
  const out = parts.map((p) => p.map((c) => c.text).join(' '))
  let moved = false
  parts.forEach((p, col) => {
    const words = p.flatMap((c) => c.text.split(/\s+/))
    const first = col - words.length + 1
    if (words.length < 2 || first < 0 || !words.every(isNumberLike)) return
    if (words.every((w) => /^\d+$/.test(w)) && words.join('').length >= 9) return // phone numbers and ids are never split
    if (parts.slice(first, col).some((q) => q.length > 0)) return
    if (Math.min(...p.map((c) => c.x)) > header[col].x + 1.5) return // starts well inside its own column: leave it
    words.forEach((w, i) => (out[first + i] = w))
    moved = true
  })
  return { out, moved }
}

// Two header words printed close together ("Item Code" "Item Name") get joined into one
// cell. Split them only when the rows below prove it: some cells line up with the left
// word, some with the right word, and none of them straddles the gap.
// A heading wider than its column can reach the next heading, and pdf.js then hands both over as one
// text piece ("Item Code Item Description"). Cut it where at least two rows start text inside it and
// nothing in the rows crosses that point, at the nearest word break (a space, or "CodeItem").
// Word positions are estimated from character counts, so the break must be within 12 points.
function splitPiece(piece: Piece, sample: Piece[]): Piece[] {
  const width = piece.x2 - piece.x
  const starts = sample.map((p) => Math.round(p.x)).filter((x) => x > piece.x + 3 && x < piece.x2 - 3)
  const cut = [...new Set(starts)].find(
    (x) => starts.filter((s) => Math.abs(s - x) <= 2).length >= 2 && !sample.some((p) => p.x < x - 2 && p.x2 > x + 2),
  )
  if (cut === undefined) return [piece]
  const breaks = [...piece.text.matchAll(/ (?=\S)|(?<=[a-z])(?=[A-Z])/g)].map((m) => m.index + (piece.text[m.index] === ' ' ? 1 : 0))
  const at = breaks.map((i) => ({ i, x: piece.x + (i / piece.text.length) * width })).sort((a, b) => Math.abs(a.x - cut) - Math.abs(b.x - cut))[0]
  if (!at || Math.abs(at.x - cut) > 12) return [piece]
  const left = { text: piece.text.slice(0, at.i).trim(), x: piece.x, x2: cut - 1 }
  const right = { text: piece.text.slice(at.i).trim(), x: cut, x2: piece.x2 }
  return [left, ...splitPiece(right, sample)]
}

function splitHeader(header: Cell[], body: Line[]): Cell[] {
  // Total / tax lines are laid out freely ("IGST @ 12%" can span two columns), so they don't count.
  // Notes under the table are one long line ("Goods once sold…"), so only lines with two or more cells count.
  const sample = body.filter((l) => !summaryLabel(l) && l.cells.length >= 2).slice(0, 12).flatMap((l) => l.cells.flatMap((c) => c.parts))
  const near = (a: number, b: number) => Math.abs(a - b) <= 3
  const out: Cell[] = []
  for (const original of header) {
    const cell = { ...original, parts: original.parts.flatMap((p) => splitPiece(p, sample)) }
    let current: Piece[] = [cell.parts[0]]
    const groups: Piece[][] = [current]
    for (let i = 1; i < cell.parts.length; i++) {
      const left = cell.parts[i - 1]
      const right = cell.parts[i]
      const leftHits = sample.filter((c) => near(c.x, left.x) || near(c.x2, left.x2)).length
      const rightHits = sample.filter((c) => near(c.x, right.x) || near(c.x2, right.x2)).length
      const straddles = sample.some((c) => c.x < left.x2 - 1 && c.x2 > right.x + 1)
      // Headings in narrow columns can touch ("Product CodeItem Description"); the rows decide.
      if (right.x - left.x2 >= 0 && leftHits >= 2 && rightHits >= 2 && !straddles) groups.push((current = [right]))
      else current.push(right)
    }
    for (const g of groups) {
      out.push({
        text: g.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim(),
        x: g[0].x,
        x2: g[g.length - 1].x2,
        parts: g,
      })
    }
  }
  return out
}

// A Total / tax line under the table. The label must be the WHOLE first cell ("Total Station
// Kit" is an item, "Grand Total" is not). Amounts may carry Rs. / a rupee sign, a % or a unit.
const TOTAL_LABEL =
  /^(grand\s+total|sub\s*-?\s*total|total(\s+amount)?|taxable(\s+(value|amount))?|[csiu]gst|net\s+(amount|payable)|amount\s+payable)(\s*\([^)]*\))?(\s*@?\s*\d+(\.\d+)?\s*%)?\s*:?$/i
const AMOUNT = /^(?:rs\.?|inr|₹|\$)?\s*[-+]?[\d,]+(?:\.\d+)?\s*(?:%|nos?\.?|pcs?\.?|kgs?|mtrs?|ltrs?|sets?|units?|boxes|box)?$/i

export function summaryLabel(line: Line): string | undefined {
  const label = line.cells[0]
  if (!label || !TOTAL_LABEL.test(label.text)) return undefined
  const rest = line.cells.slice(1)
  const allAmounts = rest.every((c) => AMOUNT.test(c.text.trim()))
  return rest.length >= 1 && rest.length <= 3 && allAmounts ? label.text : undefined
}

// Finds the first header-looking line, then maps every following line's cells
// onto those header columns by horizontal position.
export function detectTable(lines: Line[]): { headers: string[]; rows: TableRow[]; headerIndex: number } {
  let headerIndex = lines.findIndex((l) => isHeaderLine(l, 3))
  if (headerIndex === -1) headerIndex = lines.findIndex((l) => isHeaderLine(l, 2))
  if (headerIndex === -1) return { headers: [], rows: [], headerIndex }

  const rawKey = lines[headerIndex].cells.map((c) => normalizeHeader(c.text)).join('|') // as printed, before splitting
  const lineKeyOf = (l: Line) => l.cells.map((c) => normalizeHeader(c.text)).join('|')
  // the header printed again on later pages must not count as "data" when testing the split
  const header = splitHeader(lines[headerIndex].cells, lines.slice(headerIndex + 1).filter((l) => lineKeyOf(l) !== rawKey))
  const headers = header.map((c) => c.text)
  const headerKey = headers.map(normalizeHeader).join('|')
  const rows: TableRow[] = []

  for (const line of lines.slice(headerIndex + 1)) {
    const lineKey = lineKeyOf(line)
    if (lineKey === headerKey || lineKey === rawKey) continue // header repeated on a new page

    const { out: cells, moved } = layoutRow(line, header)
    const filled = cells.filter((c) => c !== '').length

    // Bill details repeated at the top of a later page ("Quotation No: KPF-778  Date: 12-10-2026") are not items.
    if (line.cells.every((c) => /^[A-Z][A-Za-z.&/ ]{1,30}:\s*\S/.test(c.text))) continue

    // Page footers like "Page 1 of 3" are not part of any item.
    if (/^page\s+\d+(\s*(of|\/)\s*\d+)?$/i.test(line.cells.map((c) => c.text).join(' ').trim())) continue

    // A single text fragment under a text column is a wrapped line: append it to the row above.
    const prev = rows[rows.length - 1]
    if (filled === 1 && prev && !prev.summary && prev.page === line.page && !isNumberLike(line.cells[0].text)) {
      const col = cells.findIndex((c) => c !== '')
      if (prev.cells[col] && !isNumberLike(prev.cells[col])) {
        prev.cells[col] += ` ${cells[col]}`
        continue
      }
    }
    if (filled >= 2) {
      const summary = summaryLabel(line)
      rows.push({ page: line.page, cells, ...(moved ? { moved: true } : {}), ...(summary ? { summary } : {}) })
    }
  }
  return { headers, rows, headerIndex }
}

// "Label: value" pairs printed around the table (Invoice No, Date, GSTIN, Vendor...) plus the
// Total / tax lines under it, so they can sit as columns on every item row. Values are only
// copied as printed: nothing is calculated.
const LABEL = /(?:^|\s)([A-Z][A-Za-z.&/]*(?: [A-Za-z.&/]+){0,3})\s*:\s*/g

export function docFields(lines: Line[], rows: TableRow[]): DocField[] {
  const out: DocField[] = []
  const seen = new Map<string, number>()
  const add = (label: string, value: string) => {
    value = value.trim().replace(/[,;]$/, '')
    if (!value || value.length > 60 || value.split(/\s+/).length > 8) return // a sentence, not a value
    const key = normalizeHeader(label)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    out.push({ label: n === 1 ? label : `${label} (${n})`, value })
  }
  for (const line of lines) {
    for (const cell of line.cells) {
      const found = [...cell.text.matchAll(LABEL)]
      found.forEach((m, i) => {
        const start = m.index + m[0].length
        const end = i + 1 < found.length ? found[i + 1].index : cell.text.length
        add(m[1].trim(), cell.text.slice(start, end))
      })
    }
  }
  for (const r of rows) {
    if (!r.summary) continue
    const value = [...r.cells].reverse().find((c) => c !== '' && c !== r.summary) ?? ''
    // "CGST @ 9%" and "CGST @ 6%" both become "CGST", with the rate as its own field ("CGST rate")
    const rate = /@?\s*(\d+(?:\.\d+)?\s*%)\s*:?$/.exec(r.summary)
    const label = r.summary.replace(/\s*@?\s*\d+(?:\.\d+)?\s*%\s*:?$/, '').replace(/:$/, '').trim()
    add(label, value)
    if (rate) add(`${label} rate`, rate[1].replace(/\s+/g, ''))
  }
  return out
}

function columnFor(cell: Cell, header: Cell[]): number {
  // An edge that lines up with a heading's edge is the strongest sign: a number right-aligned under
  // a right-aligned "Rate", or text starting exactly under "Description". Overlap alone can tie when a
  // right-aligned number reaches back into the column before it ("Pcs 14,500.00").
  const byRight = isNumberLike(cell.text) ? header.findIndex((h) => Math.abs(h.x2 - cell.x2) <= 1.5) : -1
  if (byRight !== -1) return byRight
  const byLeft = header.findIndex((h) => Math.abs(h.x - cell.x) <= 1.5)
  if (byLeft !== -1) return byLeft
  let best = -1
  let bestOverlap = 0
  header.forEach((h, i) => {
    const right = i + 1 < header.length ? Math.max(h.x2, header[i + 1].x - 1) : Math.max(h.x2, cell.x2)
    const overlap = Math.min(cell.x2, right) - Math.max(cell.x, h.x)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = i
    }
  })
  if (best !== -1) return best
  const center = (cell.x + cell.x2) / 2
  let nearest = 0
  header.forEach((h, i) => {
    if (Math.abs((h.x + h.x2) / 2 - center) < Math.abs((header[nearest].x + header[nearest].x2) / 2 - center)) nearest = i
  })
  return nearest
}
