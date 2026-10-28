import Anthropic from '@anthropic-ai/sdk'

// The only code that holds the Anthropic key. It runs on the server side: inside the Vite dev
// server on a laptop (vite.config.ts) and as a Cloudflare Worker online (worker/index.ts).
// The browser calls POST /api/ai with one of two fixed request shapes; anything else is refused,
// so this is not an open pipe to Claude. Nothing received here is logged or stored.

export const AI_MODEL = 'claude-haiku-5-5'

const MAX_BODY = 64_000
const MAX_ITEMS = 100
const MAX_TEXT = 300

export interface AiEnv {
  apiKey?: string
  passcode?: string // optional APP_PASSCODE: when set, the browser must send the same value
}

export interface AiResult {
  status: number
  body: unknown
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): AiResult => ({ status, body: { error, ...extra } })
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strList = (v: unknown, max: number, len: number) =>
  Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length <= len) ? (v as string[]) : null

const TEMPLATE_SYSTEM = `You write templates for Migration-in-a-box, a tool that turns PDFs and spreadsheets into Excel.
Reply with ONE JSON object and nothing else, in this shape:
{"name": string, "rowMode": "tableRows" | "onePerFile", "columns": [{"name": string, "type": "text" | "number" | "date" | "unit", "extractor": EXTRACTOR}]}
EXTRACTOR is one of:
{"kind":"tableColumn","header": one of the table headings given}
{"kind":"docField","label": one of the document details given}
{"kind":"classify","header": a table heading holding the item description,"what":"trade"|"type"|"material"}
{"kind":"rowNumber"} (S.No 1, 2, 3...)
{"kind":"itemCode","header": the item description heading,"codeHeader"?: a heading that already holds item codes}
{"kind":"fileName"} | {"kind":"filePath"} | {"kind":"pageNumber"} | {"kind":"pageCount"}
{"kind":"constant","value": string}
Use only headings and details from the lists given. "tableRows" gives one Excel row per item; "onePerFile" one per document.
Use "number" for amounts and quantities, "date" for dates, "unit" for units of measure.`

const SORT_SYSTEM = `You sort items from Indian invoices, bills, purchase orders and price lists for a data migration.
The items come in the order they appear on the documents, so neighbouring items often belong to the same business.
For each item description, give:
- trade: the trade or category the item belongs to, by what it is used for, not by its material: a copper pipe is Plumbing, a copper wire is Electrical, a cotton crepe bandage is Medical / pharmacy, dress material is Textiles / clothing. The list given holds broad trades: use one of them whenever it reasonably fits, spelled exactly the same, rather than a narrower name (shampoo and lipstick are both Cosmetics / personal care; textbooks and pens are both Books / stationery). Only when none of them fits at all, name a new broad trade in 1-3 words, Title Case. Use the HSN code when one is given. Use "Other" only when you cannot tell what the item is.
- itemType: a short generic name for the item, 1-3 words, Title Case (e.g. "Pipe", "Pipe fitting", "Cable / wire", "Fabric", "Button", "Bandage", "Paper").
- confidence: "high" only when the description clearly names the item; "low" when you are guessing.
- reason: under 12 words, naming the words that decided it.
Return every id you were given, once.`

const SORT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          trade: { type: 'string' },
          itemType: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'low'] },
          reason: { type: 'string' },
        },
        required: ['id', 'trade', 'itemType', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
}

// Checks the two allowed request shapes and turns them into a Claude request.
function buildRequest(body: Record<string, unknown>): Anthropic.MessageCreateParamsNonStreaming | string {
  if (body.action === 'template') {
    const p = body.payload
    if (!isObj(p) || typeof p.request !== 'string' || p.request.length > 2000) return 'The request is missing or too long.'
    const tableHeadings = strList(p.tableHeadings, 200, MAX_TEXT)
    const documentDetails = strList(p.documentDetails, 200, MAX_TEXT)
    if (!tableHeadings || !documentDetails) return 'Bad headings list.'
    const sampleRows =
      Array.isArray(p.sampleRows) && p.sampleRows.length <= 3 && p.sampleRows.every((r) => strList(r, 60, MAX_TEXT)) ? p.sampleRows : undefined
    const payload = { request: p.request, tableHeadings, documentDetails, ...(sampleRows ? { sampleRows } : {}) }
    return {
      model: AI_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: TEMPLATE_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
    }
  }
  if (body.action === 'sort') {
    const trades = strList(body.trades, 60, 40)
    const items = body.items
    if (!trades || trades.length === 0) return 'Bad trades list.'
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return `Send 1 to ${MAX_ITEMS} items at a time.`
    const clean: { id: string; text: string; hsn?: string }[] = []
    for (const it of items) {
      if (!isObj(it) || typeof it.id !== 'string' || it.id.length > 20 || typeof it.text !== 'string' || it.text.length > MAX_TEXT) return 'Bad item.'
      clean.push({ id: it.id, text: it.text, ...(typeof it.hsn === 'string' && it.hsn.length <= 20 && it.hsn ? { hsn: it.hsn } : {}) })
    }
    return {
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SORT_SCHEMA } },
      system: SORT_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({ trades, items: clean }) }],
    }
  }
  return 'Unknown action.'
}

// Online, Anthropic now and then refuses a request coming through one Cloudflare location (403)
// and accepts the same request a moment later. Those are tried again; the SDK already retries 429 / 5xx.
async function createWithRetry(client: Anthropic, request: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.messages.create(request)
    } catch (err) {
      if (!(err instanceof Anthropic.PermissionDeniedError) || attempt >= 4) throw err
      await new Promise((r) => setTimeout(r, 400 * attempt))
    }
  }
}

export async function handleAi(rawBody: string, env: AiEnv, passcode: string | null): Promise<AiResult> {
  if (env.passcode && passcode !== env.passcode) return fail(401, 'Enter the passcode to use AI.', { needsPasscode: true })
  if (!env.apiKey) return fail(503, 'AI is not set up: ANTHROPIC_API_KEY is missing on the server.')
  if (rawBody.length > MAX_BODY) return fail(413, 'Too much data in one request.')
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return fail(400, 'Not valid JSON.')
  }
  if (!isObj(body)) return fail(400, 'Not valid JSON.')
  const request = buildRequest(body)
  if (typeof request === 'string') return fail(400, request)

  const client = new Anthropic({ apiKey: env.apiKey })
  try {
    const response = await createWithRetry(client, request)
    if (response.stop_reason === 'refusal') return fail(422, 'Claude declined this request. Try describing it differently.')
    if (response.stop_reason === 'max_tokens') return fail(422, 'The reply was cut off. Try fewer items.')
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
    if (body.action === 'sort') {
      try {
        return { status: 200, body: JSON.parse(text) }
      } catch {
        return fail(502, 'The AI reply was not valid JSON.')
      }
    }
    return { status: 200, body: { text } }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return fail(502, 'The API key on the server was not accepted.')
    if (err instanceof Anthropic.RateLimitError) return fail(429, 'Too many AI requests right now. Try again in a minute.')
    if (err instanceof Anthropic.APIConnectionError) return fail(502, 'The server could not reach Anthropic.')
    if (err instanceof Anthropic.APIError) return fail(502, `Anthropic returned an error (${err.status}): ${err.message.slice(0, 200)}`)
    return fail(500, 'AI request failed.')
  }
}
