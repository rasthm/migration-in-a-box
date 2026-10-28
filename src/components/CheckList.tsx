import { useState } from 'react'
import type { TaughtWord, Template } from '../types'
import { knownTrades } from '../engine/aiSort'
import { descriptionKey } from '../engine/classify'

const SHOWN = 30

// "Please check": items AI sorted but wasn't sure about. Fix the trade or item type if needed
// and confirm; the answer is kept with the format, so the same item is sorted right next time.
// present: descriptions in the files listed now; answers for removed files are kept but not shown.
export function CheckList({ template, onChange, present }: { template: Template; onChange: (t: Template) => void; present?: Set<string> }) {
  const words = template.words ?? []
  const unsure = words.filter((w) => w.check && (!present || present.has(descriptionKey(w.word))))
  const [edits, setEdits] = useState<Record<string, { trade?: string; type?: string }>>({})
  if (unsure.length === 0) return null

  const confirm = (targets: TaughtWord[]) => {
    const set = new Set(targets)
    onChange({
      ...template,
      words: words.map((w) => {
        if (!set.has(w)) return w
        const e = edits[w.word] ?? {}
        const { check: _check, ...rest } = w
        return { ...rest, ...(e.trade ? { trade: e.trade } : {}), ...(e.type !== undefined && e.type.trim() ? { type: e.type.trim().slice(0, 60) } : {}) }
      }),
    })
  }
  const edit = (w: TaughtWord, patch: { trade?: string; type?: string }) => setEdits({ ...edits, [w.word]: { ...edits[w.word], ...patch } })

  return (
    <section className="panel checklist">
      <header className="panel-head">
        <h2>Please check ({unsure.length})</h2>
        <button onClick={() => confirm(unsure)}>All look right</button>
      </header>
      <p className="muted small">AI wasn't sure about these. Change the trade or item type if it's wrong, then press ✓.</p>
      <ul>
        {unsure.slice(0, SHOWN).map((w) => (
          <li key={w.word}>
            <div className="check-text">
              <strong>{w.word}</strong>
              {w.reason && <span className="muted small"> · {w.reason}</span>}
            </div>
            <div className="check-edit">
              <select aria-label="Trade" value={edits[w.word]?.trade ?? w.trade ?? 'Other'} onChange={(e) => edit(w, { trade: e.target.value })}>
                {knownTrades(template).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input aria-label="Item type" value={edits[w.word]?.type ?? w.type ?? ''} placeholder="Item type" onChange={(e) => edit(w, { type: e.target.value })} />
              <button className="primary" title="Confirm" onClick={() => confirm([w])}>
                ✓
              </button>
            </div>
          </li>
        ))}
      </ul>
      {unsure.length > SHOWN && <p className="muted small">…and {unsure.length - SHOWN} more after these.</p>}
    </section>
  )
}
