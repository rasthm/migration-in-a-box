import { read, utils } from 'xlsx'
import type { ParsedDoc, TableRow } from '../types'
import { docFields, normalizeHeader, summaryLabel, type Cell, type Line } from './pdfExtract'

export const isSheet = (name: string) => /\.(xlsx|xlsm|xls|csv|ods)$/i.test(name)

const isNumberLike = (s: string) => /^[₹$]?\s*[-+]?[\d,]+(\.\d+)?\s*%?$/.test(s.trim())

// A spreadsheet row as a "line" so the PDF helpers (document details, total lines) work on it too.
const asLine = (cells: string[], page: number): Line => ({
  page,
  y: 0,
  cells: cells
    .map((text, i): Cell => ({ text: text.trim(), x: i, x2: i + 1, parts: [] }))
    .filter((c) => c.text !== ''),
})

// Reads an Excel or CSV file in the browser. Each sheet counts as a page. The first row with
// two or more text cells is the header; later sheets are matched to it by heading name.
export async function readSheet(file: File): Promise<ParsedDoc> {
  // CSV text is kept exactly as written (raw: no guessing that "05/03/2025" is a US date).
  // Real Excel date cells are written as DD-MM-YYYY here, because the default display is US m/d/yy.
  const csv = /\.csv$/i.test(file.name ?? '')
  const book = read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true, ...(csv ? { raw: true } : {}) })
  for (const name of book.SheetNames) {
    for (const [addr, cell] of Object.entries(book.Sheets[name])) {
      if (addr.startsWith('!') || cell?.t !== 'd' || !(cell.v instanceof Date)) continue
      const d = cell.v
      cell.w = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
    }
  }
  let headers: string[] = []
  const rows: TableRow[] = []
  const above: Line[] = []
  const textParts: string[] = []

  book.SheetNames.forEach((sheetName, s) => {
    const page = s + 1
    // raw: false gives the text Excel shows (dates as printed, not as serial numbers)
    const grid = utils.sheet_to_json<string[]>(book.Sheets[sheetName], { header: 1, raw: false, defval: '' })
    textParts.push(grid.map((r) => r.filter((c) => c !== '').join('  ')).join('\n'))
    // The heading row is the one with the most text cells near the top. "Supplier: X" style
    // rows are document details, not headings.
    const textCells = (r: string[]) =>
      r.some((c) => /:\s*\S/.test(String(c))) ? 0 : r.filter((c) => String(c).trim() !== '' && !isNumberLike(String(c))).length
    let headerRow = -1
    grid.slice(0, 30).forEach((r, i) => {
      if (textCells(r) >= 2 && (headerRow === -1 || textCells(r) > textCells(grid[headerRow]))) headerRow = i
    })
    if (headerRow === -1) return
    const sheetHeaders = grid[headerRow].map((c) => String(c).trim())
    if (headers.length === 0) {
      headers = sheetHeaders.filter((h) => h !== '')
      for (const r of grid.slice(0, headerRow)) above.push(asLine(r.map(String), page))
    }
    // where each of this sheet's columns goes in the first sheet's headings
    const map = sheetHeaders.map((h) => headers.findIndex((x) => normalizeHeader(x) === normalizeHeader(h)))
    for (const r of grid.slice(headerRow + 1)) {
      const raw = r.map((c) => String(c).trim())
      if (raw.every((c) => c === '')) continue
      if (raw.map(normalizeHeader).join('|') === sheetHeaders.map(normalizeHeader).join('|')) continue // header repeated
      const cells = headers.map(() => '')
      raw.forEach((c, i) => {
        if (map[i] !== undefined && map[i] >= 0) cells[map[i]] = c
      })
      const summary = summaryLabel(asLine(raw, page))
      rows.push({ page, cells, ...(summary ? { summary } : {}) })
    }
  })

  return {
    pageCount: book.SheetNames.length,
    pagesWithoutText: [],
    headers,
    rows,
    fields: docFields(above, rows),
    fullText: textParts.join('\n'),
  }
}
