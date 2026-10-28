import type { ColumnType, Extractor, RowMode, TaughtWord, Template, TemplateColumn } from '../types'
import { checkPattern } from './patternCheck'

// The single gatekeeper for template JSON. The Library, file import, the "run" step in
// runTemplate.ts, the Manual builder's pattern box and (later) Auto mode and the AI agent
// all use the functions in this file (the pattern filter lives in patternCheck.ts, Step 2a). It copies only known fields, so anything else in the
// JSON is dropped, and it never runs any text as code.
const MAX_COLUMNS = 200
const MAX_TEXT = 300
const MAX_PATTERN = 300
const MAX_WORDS = 5000 // AI answers are stored one per distinct item description

export type ParseResult = { ok: true; template: Template } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' && v.length <= max ? v : null)

function parseExtractor(v: unknown): Extractor | string {
  if (!isObj(v)) return 'an extractor is missing'
  switch (v.kind) {
    case 'tableColumn': {
      const header = str(v.header)
      return header === null ? 'a table column has no header name' : { kind: 'tableColumn', header }
    }
    case 'regex': {
      const pattern = str(v.pattern, MAX_PATTERN)
      const group = typeof v.group === 'number' && Number.isInteger(v.group) && v.group >= 0 && v.group <= 20 ? v.group : 1
      if (pattern === null) return `a pattern is longer than ${MAX_PATTERN} characters`
      const problem = checkPattern(pattern)
      if (problem) return `pattern "${pattern}": ${problem}`
      return { kind: 'regex', pattern, group }
    }
    case 'constant': {
      const value = str(v.value)
      return value === null ? 'a fixed value is too long' : { kind: 'constant', value }
    }
    case 'docField': {
      const label = str(v.label)
      return label === null ? 'a document detail has no name' : { kind: 'docField', label }
    }
    case 'classify': {
      const header = str(v.header)
      if (header === null) return 'a trade / item type / material column has no source column'
      if (v.what !== 'trade' && v.what !== 'type' && v.what !== 'material') return 'a sorting column must read "trade", "type" or "material"'
      return { kind: 'classify', header, what: v.what }
    }
    case 'itemCode': {
      const header = str(v.header)
      if (header === null) return 'an item code column has no description column'
      const codeHeader = v.codeHeader === undefined || v.codeHeader === '' ? undefined : str(v.codeHeader)
      if (codeHeader === null) return 'an item code column has a bad code column name'
      return { kind: 'itemCode', header, ...(codeHeader ? { codeHeader } : {}) }
    }
    case 'rowNumber':
    case 'fileName':
    case 'filePath':
    case 'pageNumber':
    case 'pageCount':
      return { kind: v.kind }
    default:
      return `unknown field kind "${String(v.kind)}"`
  }
}

// freshIds = true gives the copy new ids (use it for Import and for "Use", so two pages never share an id).
export function parseTemplate(raw: unknown, freshIds = true): ParseResult {
  if (!isObj(raw)) return { ok: false, error: 'This is not a template.' }
  const name = str(raw.name)
  if (name === null) return { ok: false, error: 'The template name is missing or too long.' }
  if (raw.rowMode !== 'tableRows' && raw.rowMode !== 'onePerFile') return { ok: false, error: 'rowMode must be tableRows or onePerFile.' }
  if (!Array.isArray(raw.columns) || raw.columns.length > MAX_COLUMNS) {
    return { ok: false, error: `The template needs a columns list (up to ${MAX_COLUMNS}).` }
  }

  const columns: TemplateColumn[] = []
  for (const c of raw.columns) {
    if (!isObj(c)) return { ok: false, error: 'A column is not an object.' }
    const colName = str(c.name)
    if (colName === null) return { ok: false, error: 'A column name is missing or too long.' }
    if (c.type !== 'text' && c.type !== 'number' && c.type !== 'date' && c.type !== 'unit') return { ok: false, error: `Column "${colName}" must be text, number, date or unit.` }
    const extractor = parseExtractor(c.extractor)
    if (typeof extractor === 'string') return { ok: false, error: `Column "${colName}": ${extractor}.` }
    const id = !freshIds && str(c.id, 80) ? (c.id as string) : crypto.randomUUID()
    columns.push({ id, name: colName, type: c.type as ColumnType, extractor })
  }
  // Taught words and AI answers: plain text only, capped so a template stays small.
  const words: TaughtWord[] = []
  for (const w of Array.isArray(raw.words) ? raw.words.slice(0, MAX_WORDS) : []) {
    if (!isObj(w)) continue
    const ai = w.ai === true
    const word = str(w.word, ai ? MAX_TEXT : 60)
    const opt = (v: unknown, max = 60) => (v === undefined || v === '' ? undefined : str(v, max))
    const trade = opt(w.trade)
    const type = opt(w.type)
    const material = opt(w.material)
    const reason = opt(w.reason, 200)
    if (!word || trade === null || type === null || material === null || reason === null || (!trade && !type && !material)) continue
    words.push({
      word,
      ...(trade ? { trade } : {}),
      ...(type ? { type } : {}),
      ...(material ? { material } : {}),
      ...(ai ? { ai: true } : {}),
      ...(ai && w.check === true ? { check: true } : {}),
      ...(reason ? { reason } : {}),
    })
  }
  const id = !freshIds && str(raw.id, 80) ? (raw.id as string) : crypto.randomUUID()
  return {
    ok: true,
    template: {
      id,
      name,
      rowMode: raw.rowMode as RowMode,
      columns,
      ...(raw.keepTotals === true ? { keepTotals: true } : {}),
      ...(words.length > 0 ? { words } : {}),
    },
  }
}
