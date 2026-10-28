// Clean-ups for date and unit columns, so a new system gets one format whatever the PDF used.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

function build(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000 // a 2-digit year is 20xx
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null
  const date = new Date(y, m - 1, d)
  if (date.getMonth() !== m - 1) return null // 31-02 and the like
  return `${pad(d)}-${pad(m)}-${y}`
}

const monthOf = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1

// Returns DD-MM-YYYY, or null when the text is not a date it can read for sure.
// Numbers are always read day first (Indian style); it never flips to month first.
export function toDate(raw: string): string | null {
  const s = raw.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) // 2026-10-14
  if (m) return build(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s) // 14-10-2026, 14/10/26
  if (m) return build(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/. ]+([A-Za-z]{3,9})\.?[-/., ]+(\d{2}|\d{4})$/.exec(s) // 14 Oct 2026, 14-Oct-26
  if (m && monthOf(m[2])) return build(+m[1], monthOf(m[2]), +m[3])
  m = /^([A-Za-z]{3,9})\.?[ -]+(\d{1,2}),?[ -]+(\d{2}|\d{4})$/.exec(s) // Oct 14, 2026
  if (m && monthOf(m[1])) return build(+m[2], monthOf(m[1]), +m[3])
  return null
}

const UNITS: [string, string[]][] = [
  ['Nos', ['nos', 'no', 'number', 'numbers', 'pcs', 'pc', 'piece', 'pieces', 'each', 'ea', 'unit', 'units']],
  ['Kg', ['kg', 'kgs', 'kilo', 'kilogram', 'kilograms']],
  ['g', ['g', 'gm', 'gms', 'gram', 'grams']],
  ['Mtr', ['m', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres', 'rmt']],
  ['Ft', ['ft', 'feet', 'foot']],
  ['Ltr', ['l', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters']],
  ['Set', ['set', 'sets']],
  ['Box', ['box', 'boxes', 'bx']],
  ['Pair', ['pair', 'pairs', 'pr']],
  ['Pkt', ['pkt', 'pkts', 'packet', 'packets', 'pack', 'packs']],
  ['Roll', ['roll', 'rolls', 'coil', 'coils']],
  ['Bag', ['bag', 'bags']],
  ['Doz', ['doz', 'dozen']],
]

// One spelling per unit. "14 Nos" keeps its number ("14 Nos"); anything unknown is left as it is.
export function toUnit(raw: string): string {
  const m = /^\s*([\d.,]+\s*)?([A-Za-z.]+)\s*$/.exec(raw)
  if (!m) return raw
  const word = m[2].replace(/\.$/, '').toLowerCase()
  const unit = UNITS.find(([, words]) => words.includes(word))?.[0]
  return unit ? `${m[1] ? m[1].trim() + ' ' : ''}${unit}` : raw
}
