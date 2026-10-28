// The one place that decides whether a pattern is allowed to run. A FILTER, not a proof.
const MAX_PATTERN = 300

const SLOW_GROUP =
  'This pattern repeats a group that already repeats, chooses, or is optional inside itself, which can freeze the browser. Simplify it.'

// Returns a plain-words problem, or null when the pattern looks fine.
export function checkPattern(pattern: string): string | null {
  if (pattern === '') return null
  if (pattern.length > MAX_PATTERN) return `The pattern is longer than ${MAX_PATTERN} characters.`
  try {
    new RegExp(pattern, 'i')
  } catch {
    return 'This is not a valid pattern.'
  }
  // escapes (\d, \.) and [...] sets each count as one plain character
  const flat = pattern.replace(/\\./g, 'x').replace(/\[(?:[^\]\\]|\\.)*\]/g, 'x')
  if ((flat.match(/\.[*+]/g) ?? []).length > 2) return 'More than two ".*" or ".+" in one pattern can make the browser very slow. Use fewer.'
  if ((flat.match(/[+*]|\{\d+,\}/g) ?? []).length > 5) return 'Too many open-ended repeats (+ or *) in one pattern. Use fewer.'

  // loose = something inside repeats without limit or chooses with |
  // vague = something inside is optional (?) or has a range ({1,100})
  const stack: { loose: boolean; vague: boolean }[] = [{ loose: false, vague: false }]
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]
    const prev = i > 0 ? flat[i - 1] : ''
    const top = stack[stack.length - 1]
    if (ch === '(') stack.push({ loose: false, vague: false })
    else if (ch === '|' || ch === '+' || ch === '*') top.loose = true
    else if (ch === '?' && !'(+*?}'.includes(prev || 'x')) top.vague = true
    else if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(flat.slice(i))
      if (m && m[2] !== undefined) {
        if (m[3] === '') top.loose = true // {n,}
        else if (Number(m[3]) > Number(m[1])) top.vague = true // {n,m}
      }
    } else if (ch === ')' && stack.length > 1) {
      const group = stack.pop()!
      const after = flat.slice(i + 1)
      const m = /^\{(\d+)(?:,(\d*))?\}/.exec(after)
      const repeats = after[0] === '+' || after[0] === '*' || (m !== null && (m[2] === '' || Number(m[2] ?? m[1]) >= 8))
      if (repeats && (group.loose || group.vague)) return SLOW_GROUP
      const parent = stack[stack.length - 1]
      parent.loose ||= group.loose
      parent.vague ||= group.vague
    }
  }
  return null
}
