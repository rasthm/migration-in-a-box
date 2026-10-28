import type { ClassifyWhat, TaughtWord } from '../types'

// Trade, item type and material read from an item's description. Edit the lists below to teach
// it new words. The first matching entry wins, so keep specific entries above generic ones; no
// match leaves the cell blank (never a guess). Items left blank can be sorted by AI (aiSort.ts).

// The trades every item is sorted into, with the prefix used for item codes the app makes (ELE-0001).
export const TRADES: { name: string; prefix: string }[] = [
  { name: 'Electrical', prefix: 'ELE' },
  { name: 'Plumbing', prefix: 'PLB' },
  { name: 'Sanitary', prefix: 'SAN' },
  { name: 'Hardware', prefix: 'HDW' },
  { name: 'Tools', prefix: 'TLS' },
  { name: 'Civil / building', prefix: 'CIV' },
  { name: 'Paint', prefix: 'PNT' },
  { name: 'Safety equipment', prefix: 'SAF' },
  // Broad trades outside construction. AI picks from this list first, so parallel batches don't
  // each invent their own name ("Beauty", "Salon supplies", "Hygiene") for the same kind of item.
  { name: 'Textiles / clothing', prefix: 'TEX' },
  { name: 'Footwear', prefix: 'FTW' },
  { name: 'Jewellery', prefix: 'JEW' },
  { name: 'Food / grocery', prefix: 'FOO' },
  { name: 'Medical / pharmacy', prefix: 'MED' },
  { name: 'Cosmetics / personal care', prefix: 'COS' },
  { name: 'Cleaning / household', prefix: 'HSE' },
  { name: 'Kitchenware', prefix: 'KIT' },
  { name: 'Books / stationery', prefix: 'STA' },
  { name: 'Electronics', prefix: 'ELC' },
  { name: 'Furniture', prefix: 'FUR' },
  { name: 'Sports / fitness', prefix: 'SPO' },
  { name: 'Toys / games', prefix: 'TOY' },
  { name: 'Agriculture', prefix: 'AGR' },
  { name: 'Handicrafts / decor', prefix: 'HAN' },
  { name: 'Flowers / event decor', prefix: 'FLO' },
  { name: 'Packaging', prefix: 'PAC' },
  { name: 'Automotive', prefix: 'AUT' },
  { name: 'Other', prefix: 'OTH' },
]

// The code prefix for a trade, different from the prefixes other trades already use in this run
// ("Food / grocery" FOO, then "Footwear" FTW rather than a second FOO).
export function tradePrefix(trade: string, taken: Map<string, string> = new Map()): string {
  const known = TRADES.find((t) => t.name.toLowerCase() === trade.trim().toLowerCase())?.prefix
  const letters = trade.replace(/[^a-z]/gi, '').toUpperCase()
  const consonants = letters[0] + letters.slice(1).replace(/[AEIOU]/g, '')
  const initials = trade.split(/[^a-z]+/i).filter(Boolean).map((w) => w[0].toUpperCase()).join('')
  const candidates = [known, letters.slice(0, 3), consonants.slice(0, 3), (initials + letters.slice(1)).slice(0, 3)].filter(
    (p): p is string => !!p && p.length === 3,
  )
  const owner = (p: string) => [...taken].find(([, q]) => q === p)?.[0]
  const free = candidates.find((p) => owner(p) === undefined || owner(p) === trade) ?? `${candidates[0] ?? 'OTH'}${taken.size}`
  taken.set(trade, free)
  return free
}

// [item type, trade, words]. The trade comes from what the item is, never from its material:
// a copper pipe is Plumbing, a copper wire is Electrical.
const ITEM_TYPES: [string, string, string[]][] = [
  ['Extension board', 'Electrical', ['extension board', 'spike guard']],
  ['Distribution board / MCB', 'Electrical', ['distribution board', 'mcb', 'rccb', 'elcb']],
  ['Driver / power supply', 'Electrical', ['driver', 'smps', 'adapter', 'adaptor']],
  ['Light', 'Electrical', ['led', 'batten', 'bulb', 'lamp', 'panel light', 'tube light', 'downlight']],
  ['Conduit / casing', 'Electrical', ['conduit', 'casing', 'capping', 'junction box']],
  ['Sanitary ware', 'Sanitary', ['wash basin', 'basin', 'commode', 'water closet', 'urinal', 'sink', 'shower', 'faucet', 'cistern', 'flush']],
  ['Pipe fitting', 'Plumbing', ['tee', 'elbow', 'flange', 'coupler', 'coupling', 'reducer', 'union', 'bend', 'nipple', 'end cap', 'socket fitting']],
  ['Valve', 'Plumbing', ['valve', 'cock', 'tap']],
  ['Pipe', 'Plumbing', ['pipe', 'tube', 'hose']],
  ['Cable / wire', 'Electrical', ['cable', 'wire']],
  ['Fan', 'Electrical', ['fan']],
  ['Door / cabinet hardware', 'Hardware', ['tower bolt', 'aldrop', 'door stopper', 'door closer']],
  ['Fastener', 'Hardware', ['screw', 'bolt', 'nut', 'washer', 'anchor', 'nail', 'wall plug', 'rawl plug']],
  ['Door / cabinet hardware', 'Hardware', ['hinge', 'lock', 'padlock', 'handle', 'hook', 'drawer channel', 'latch', 'knob']],
  ['Switch / socket', 'Electrical', ['switch', 'socket', 'plug']],
  ['Pump', 'Plumbing', ['pump']],
  ['Motor', 'Electrical', ['motor']],
  ['Tank', 'Plumbing', ['tank']],
  ['Tool', 'Tools', ['drill', 'hammer', 'spanner', 'plier', 'screwdriver', 'cutter']],
  ['Building material', 'Civil / building', ['cement', 'sand', 'brick', 'tile', 'grout', 'putty', 'tile adhesive']],
]

const MATERIALS: [string, string[]][] = [
  ['uPVC', ['upvc']],
  ['CPVC', ['cpvc']],
  ['PVC', ['pvc']],
  ['HDPE', ['hdpe']],
  ['Copper', ['copper', 'cu']],
  ['Brass', ['brass']],
  ['Stainless steel', ['ss', 'stainless']],
  ['GI (galvanised iron)', ['gi', 'galvanised', 'galvanized']],
  ['Mild steel', ['ms', 'mild steel']],
  ['Cast iron', ['ci', 'cast iron']],
  ['Aluminium', ['aluminium', 'aluminum', 'al']],
  ['Steel', ['steel']],
  ['Plastic', ['plastic']],
  ['Nylon', ['nylon']],
  ['Polyester', ['polyester']],
  ['Cotton', ['cotton']],
  ['Rayon', ['rayon']],
  ['Linen', ['linen']],
  ['Silk', ['silk']],
  ['Wool', ['wool', 'woollen']],
  ['Latex', ['latex']],
  ['Rubber', ['rubber']],
  ['Leather', ['leather']],
  ['Wood', ['wood', 'wooden', 'plywood']],
  ['Glass', ['glass']],
  ['Ceramic', ['ceramic']],
]

// HSN code → trade, longest prefix first. Checked only when the description gives no item type.
// (From GST/HSN reference lists: confirm against the official tariff before relying on it.)
const HSN_TRADES: [string, string][] = [
  ['3917', 'Plumbing'], // plastic pipes and fittings
  ['7306', 'Plumbing'], // steel tubes and pipes
  ['7307', 'Plumbing'], // steel pipe fittings
  ['7411', 'Plumbing'], // copper tubes and pipes
  ['7412', 'Plumbing'], // copper pipe fittings
  ['8481', 'Plumbing'], // taps, cocks, valves
  ['8413', 'Plumbing'], // pumps
  ['3922', 'Sanitary'], // plastic baths, basins, cisterns
  ['6910', 'Sanitary'], // ceramic sinks, basins, WCs
  ['7324', 'Sanitary'], // steel sanitary ware
  ['7413', 'Electrical'], // stranded copper wire
  ['8414', 'Electrical'], // fans
  ['7318', 'Hardware'], // screws, bolts, nuts
  ['8301', 'Hardware'], // locks
  ['8302', 'Hardware'], // door and cabinet fittings
  ['82', 'Tools'], // hand tools
  ['85', 'Electrical'], // electrical machinery and parts
  ['2523', 'Civil / building'], // cement
  ['6907', 'Civil / building'], // ceramic tiles
]

export function tradeFromHsn(hsn: string): string {
  const code = hsn.replace(/\D/g, '')
  if (code.length < 2) return ''
  return HSN_TRADES.find(([p]) => code.startsWith(p))?.[1] ?? ''
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // taught words are plain text, never patterns
const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z])${escape(word).replace(/ /g, '\\s+')}($|[^a-z])`, 'i').test(text)

// The key an AI answer is stored under: the whole description, lower case, single spaces.
export const descriptionKey = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

// AI answers can run into the thousands, so they are looked up by exact description, not scanned.
const indexes = new WeakMap<TaughtWord[], { exact: Map<string, TaughtWord>; partial: TaughtWord[] }>()
function indexOf(taught: TaughtWord[]) {
  let idx = indexes.get(taught)
  if (!idx) {
    idx = { exact: new Map(), partial: [] }
    for (const t of taught) {
      if (t.ai) idx.exact.set(descriptionKey(t.word), t)
      else idx.partial.push(t)
    }
    indexes.set(taught, idx)
  }
  return idx
}

const pick = (t: TaughtWord, what: ClassifyWhat) => (what === 'trade' ? t.trade : what === 'type' ? t.type : t.material)

// Words the user taught come first, then AI answers for this exact description, then the built-in lists.
export const classify = (text: string, what: ClassifyWhat, taught: TaughtWord[] = [], hsn = ''): string => classifyWithSource(text, what, taught, hsn).value

// Where a value came from, so the preview and the Excel can highlight what was not printed:
// 'user' = a word the user taught, 'ai' = an AI answer, 'rules' = the built-in lists or the HSN code,
// 'printed' = material read straight from the description.
export type Source = 'user' | 'ai' | 'rules' | 'printed' | ''

export function classifyWithSource(text: string, what: ClassifyWhat, taught: TaughtWord[] = [], hsn = ''): { value: string; source: Source } {
  const none = { value: '', source: '' as Source }
  if (text.trim() === '') return none
  const idx = indexOf(taught)
  for (const t of idx.partial) {
    const v = pick(t, what)
    if (v && hasWord(text, t.word.toLowerCase())) return { value: v, source: 'user' }
  }
  // Material is only ever read from the printed description, never from an AI answer.
  const ai = what === 'material' ? undefined : idx.exact.get(descriptionKey(text))
  if (ai && pick(ai, what)) return { value: pick(ai, what)!, source: 'ai' }
  if (what === 'material') {
    const m = MATERIALS.find(([, words]) => words.some((w) => hasWord(text, w)))?.[0]
    return m ? { value: m, source: 'printed' } : none
  }
  const found = ITEM_TYPES.find(([, , words]) => words.some((w) => hasWord(text, w)))
  if (what === 'type') return found ? { value: found[0], source: 'rules' } : none
  // Trade: from a taught item type, then the built-in item type, then the HSN code.
  const taughtType = idx.partial.find((t) => t.type && hasWord(text, t.word.toLowerCase()))?.type
  const typeTrade = ITEM_TYPES.find(([type]) => type === taughtType)?.[1]
  if (typeTrade) return { value: typeTrade, source: 'user' }
  const trade = found?.[1] ?? tradeFromHsn(hsn)
  return trade ? { value: trade, source: 'rules' } : none
}

// True when the user taught a word in this description, or AI already sorted it.
export function hasAnswer(text: string, taught: TaughtWord[] = []): boolean {
  const idx = indexOf(taught)
  return idx.exact.has(descriptionKey(text)) || idx.partial.some((t) => (t.trade || t.type) && hasWord(text, t.word.toLowerCase()))
}

// Headings that name a code or number, not the description ("Product Code", "Item No").
const NOT_DESCRIPTION = /code|\bno\.?$|\bid\b|number|hsn|sac|sku/i

// The column most likely to hold the item description.
export function descriptionHeader(headers: string[]): string | undefined {
  return (
    headers.find((h) => /desc|particular|item name|product|goods/i.test(h) && !NOT_DESCRIPTION.test(h)) ??
    headers.find((h) => /item|material|name|^\s*articles?\s*$|^\s*title\s*$/i.test(h) && !/code|no|id/i.test(h))
  )
}

// A heading that clearly names an item description ("Particulars", "Item Description", "Item"),
// so files that name it differently can share one column. Not "Customer Name" or "Item Code".
export const isDescriptionLike = (h: string) =>
  (/desc|particular|item name|product|goods/i.test(h) && !NOT_DESCRIPTION.test(h)) || /^(items?|materials?|articles?|title)$/i.test(h.trim())

// A printed serial-number column (S.No, Sl, Sr. No., No.).
export const isSerialHeading = (h: string) => /^(s\.?\s*no\.?|sl\.?(\s*no\.?)?|sr\.?(\s*no\.?)?|no\.?|#)$/i.test(h.trim())

// The column holding HSN / SAC codes, if any.
export const hsnHeader = (headers: string[]) => headers.find((h) => /\b(hsn|sac)\b/i.test(h))

// A column that already holds item codes (not HSN, not S.No).
export const codeHeader = (headers: string[]) =>
  headers.find((h) => /\b(item code|product code|code|sku|part no|part number|model no|style no|article no|design no|isbn)\b/i.test(h) && !/hsn|sac/i.test(h))
