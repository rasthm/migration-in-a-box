import type { WorkSheet } from 'xlsx-js-style'
import type { Mark, OutputTable } from './runTemplate'

// How rows are split across sheets: all in one, one sheet per file, or one per value of a column.
export type Grouping = { by: 'none' } | { by: 'file' } | { by: 'column'; index: number }

// Cell colours in the Excel, the same as the preview: purple = filled by AI, green = made by the app.
// Everything without a colour is exactly as printed on the document.
export const MARK_FILL: Record<Exclude<Mark, ''>, { fill: string; font: string; label: string }> = {
  ai: { fill: 'EDE4FF', font: '5B21B6', label: 'Filled by AI (trade, item type)' },
  app: { fill: 'DCF5E3', font: '166534', label: 'Made by the app (item codes, keyword sorting)' },
}

// Excel sheet names: at most 31 characters, none of []:*?/\ and unique in the book.
function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.trim() || '(blank)').replace(/[[\]:*?/\\]/g, '-').slice(0, 31)
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)}~${n}`
  used.add(name.toLowerCase())
  return name
}

// When the app made item codes, a last column says which ones, so nobody mistakes them for printed codes.
function withMadeFlag(table: OutputTable): OutputTable {
  if (table.madeCodes.size === 0) return table
  const flag: OutputTable['columns'][number] = { id: 'made-flag', name: 'Item code made by app', type: 'text', extractor: { kind: 'constant', value: '' } }
  return {
    ...table,
    columns: [...table.columns, flag],
    rows: table.rows.map((r, i) => [...r, table.madeCodes.has(i) ? 'Yes' : '']),
    marks: table.marks.map((m) => [...m, '']),
  }
}

// Builds the .xlsx in memory and hands it to the browser as a download. The last sheet is
// the proof: for each file, how many items were read and whether they match the printed total.
export async function downloadXlsx(source: OutputTable, fileName: string, grouping: Grouping = { by: 'none' }) {
  const mod = await import('xlsx-js-style')
  const X = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod
  const table = withMadeFlag(source)
  const header = { font: { bold: true }, fill: { fgColor: { rgb: 'E8EEF7' } } }

  const dataSheet = (indexes: number[]): WorkSheet => {
    const rows = indexes.map((i) => table.rows[i])
    const sheet = X.utils.aoa_to_sheet([table.columns.map((c) => c.name), ...rows])
    table.columns.forEach((_, c) => {
      const head = sheet[X.utils.encode_cell({ r: 0, c })]
      if (head) head.s = header
      indexes.forEach((rowIndex, r) => {
        const mark = table.marks[rowIndex]?.[c]
        const cell = sheet[X.utils.encode_cell({ r: r + 1, c })]
        if (mark && cell) cell.s = { fill: { fgColor: { rgb: MARK_FILL[mark].fill } }, font: { color: { rgb: MARK_FILL[mark].font } } }
      })
    })
    sheet['!cols'] = table.columns.map((c, i) => ({
      wch: Math.min(60, Math.max(c.name.length, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2),
    }))
    sheet['!freeze'] = { xSplit: 0, ySplit: 1 }
    return sheet
  }

  const book = X.utils.book_new()
  const used = new Set<string>(['proof'])
  const all = table.rows.map((_, i) => i)
  if (grouping.by === 'none') {
    X.utils.book_append_sheet(book, dataSheet(all), sheetName('Data', used))
  } else {
    const groups = new Map<string, number[]>()
    for (const i of all) {
      const key = grouping.by === 'file' ? table.rowFiles[i] : String(table.rows[i][grouping.index] ?? '')
      groups.set(key, [...(groups.get(key) ?? []), i])
    }
    for (const [key, idx] of groups) X.utils.book_append_sheet(book, dataSheet(idx), sheetName(key.replace(/\.[^.]+$/, ''), used))
  }

  const proof = X.utils.aoa_to_sheet([
    ['File', 'Items read', 'Total lines left out', 'Printed subtotal', 'Item amounts added up', 'Matches'],
    ...table.proof.map((p) => [p.file, p.items, p.totalsLeftOut, p.printed, p.sum, p.matched]),
    [],
    ['Colour key'],
    [MARK_FILL.ai.label],
    [MARK_FILL.app.label],
    ['No colour: exactly as printed on the document'],
  ])
  const keyRow = table.proof.length + 2 // header, proof rows, blank line, then "Colour key"
  for (const [offset, mark] of [[1, 'ai'], [2, 'app']] as const) {
    const cell = proof[X.utils.encode_cell({ r: keyRow + offset, c: 0 })]
    if (cell) cell.s = { fill: { fgColor: { rgb: MARK_FILL[mark].fill } }, font: { color: { rgb: MARK_FILL[mark].font } } }
  }
  proof['!cols'] = [{ wch: 48 }, { wch: 11 }, { wch: 19 }, { wch: 16 }, { wch: 20 }, { wch: 16 }]
  X.utils.book_append_sheet(book, proof, 'Proof')
  X.writeFile(book, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
}
