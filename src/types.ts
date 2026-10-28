// Shared data model. A Template is plain JSON (never code), so Manual mode,
// Auto mode, the AI agent and the Library can all read and write the same thing,
// and one local engine can run it in the browser without a server.

export type ClassifyWhat = 'trade' | 'type' | 'material'

export type ColumnType = 'text' | 'number' | 'date' | 'unit' // date: written as DD-MM-YYYY; unit: one spelling (Nos, Kg...)

export type Extractor =
  | { kind: 'tableColumn'; header: string } // value from a detected table column
  | { kind: 'regex'; pattern: string; group: number } // first match in the document text
  | { kind: 'fileName' }
  | { kind: 'filePath' }
  | { kind: 'pageNumber' }
  | { kind: 'pageCount' }
  | { kind: 'constant'; value: string }
  | { kind: 'docField'; label: string } // a "Label: value" or Total line printed around the table
  | { kind: 'classify'; header: string; what: ClassifyWhat } // trade / item type / material read from a text column
  | { kind: 'rowNumber' } // S.No: 1, 2, 3... down the output
  | { kind: 'itemCode'; header: string; codeHeader?: string } // the item's code from codeHeader, or one made by the app (ELE-0001) when blank

export interface TemplateColumn {
  id: string
  name: string
  type: ColumnType
  extractor: Extractor
}

export type RowMode = 'tableRows' | 'onePerFile'

export interface Template {
  id: string
  name: string
  rowMode: RowMode
  columns: TemplateColumn[]
  keepTotals?: boolean // include Total / CGST / Grand Total lines in the rows (default: leave them out)
  words?: TaughtWord[] // the user's own words for item type / material, checked before the built-in lists
}

export interface TaughtWord {
  word: string // user words match anywhere in a description; AI answers (ai) match the whole description
  trade?: string
  type?: string
  material?: string
  ai?: boolean // answer from AI sorting
  check?: boolean // AI was not sure: shown in "Please check" until the user confirms
  reason?: string // the AI's one-line reason
}

// What the PDF reader produces. Only extracted text is kept, never the file bytes.
export interface TableRow {
  page: number
  summary?: string // set when this is a Total / tax line; holds its label
  cells: string[] // aligned with ParsedDoc.headers
  moved?: boolean // two numbers under one heading were split into two columns on this row
}

export interface DocField {
  label: string // as printed, e.g. "Invoice No", "GSTIN (2)" for the second GSTIN, "CGST rate"
  value: string
}

export interface ParsedDoc {
  fields: DocField[] // document details found around the table
  ocr?: boolean // some pages were read by OCR (scanned): numbers need checking
  pageCount: number
  pagesWithoutText: number[] // likely scanned pages: need OCR (later section)
  headers: string[] // detected table header, empty if no table found
  rows: TableRow[]
  fullText: string
}

export type FileStatus = 'queued' | 'reading' | 'done' | 'needs-ocr' | 'unsupported' | 'error'

export interface FileEntry {
  id: string
  name: string
  path: string
  size: number
  file?: File // dropped after reading so memory stays low
  status: FileStatus
  message?: string
  parsed?: ParsedDoc
}

export interface ConversionPage {
  id: string
  name: string
  files: FileEntry[]
  template: Template
}
