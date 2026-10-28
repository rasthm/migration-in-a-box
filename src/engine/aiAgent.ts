import type { FileEntry, Template } from '../types'
import { parseTemplate } from './templateSchema'
import { callAi } from './aiClient'

// The AI helper: the user describes the Excel they want and Claude writes a template.
// Only what buildPayload() returns is sent (through our server part, which holds the key),
// and the user can see it before sending.

export const AI_MODEL_NAME = 'Claude Haiku 5.5'

export interface Payload {
  request: string
  tableHeadings: string[]
  documentDetails: string[]
  sampleRows?: string[][]
}

export function buildPayload(files: FileEntry[], request: string, withSamples: boolean): Payload {
  const docs = files.map((f) => f.parsed).filter((d) => d !== undefined)
  const tableHeadings = [...new Set(docs.flatMap((d) => d.headers))]
  const documentDetails = [...new Set(docs.flatMap((d) => (d.fields ?? []).map((f) => f.label)))]
  const first = docs.find((d) => d.rows.length > 0)
  return {
    request: request.trim(),
    tableHeadings,
    documentDetails,
    ...(withSamples && first ? { sampleRows: first.rows.filter((r) => !r.summary).slice(0, 3).map((r) => r.cells) } : {}),
  }
}

// Pulls the template out of Claude's reply and runs it through the same checker as every
// other template. Anything that does not pass is refused.
export function templateFromReply(text: string): { template: Template } | { error: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return { error: 'The reply did not contain a template.' }
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { error: 'The reply was not valid JSON.' }
  }
  if (typeof raw === 'object' && raw !== null && !('id' in raw)) (raw as Record<string, unknown>).id = 'ai'
  const r = parseTemplate(raw, true)
  return r.ok ? { template: r.template } : { error: `The suggested template was refused: ${r.error}` }
}

export async function askClaude(payload: Payload): Promise<{ template: Template } | { error: string; needsPasscode?: boolean }> {
  const r = await callAi<{ text: string }>({ action: 'template', payload })
  if (!r.ok) return { error: r.error, needsPasscode: r.needsPasscode }
  return templateFromReply(r.data.text)
}
