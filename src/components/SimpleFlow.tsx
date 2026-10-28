import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversionPage } from '../types'
import { STARTERS } from '../engine/starterTemplates'
import { buildWithAi } from '../engine/aiBuild'
import { descriptionsIn } from '../engine/aiSort'
import { applyOrder, clearOrder, moveColumn, saveOrder } from '../engine/columnOrder'
import { usePageEngine } from './usePageEngine'
import { FilePanel } from './FilePanel'
import { PreviewPanel } from './PreviewPanel'
import { CheckList } from './CheckList'
import { PasscodeBox } from './PasscodeBox'
import { VoiceButton } from './VoiceButton'

interface Props {
  page: ConversionPage
  onChange: (update: (p: ConversionPage) => ConversionPage) => void
  onAdvanced: () => void
}

// How the user wants the Excel: left to AI, described in words, or a ready format.
type Choice = { wish: string; readyId: string }

// The one-page screen. Files, "how" and the result are all visible at once, and AI builds and
// sorts the Excel by itself as soon as files are read; the user only steps in to change things.
export function SimpleFlow({ page, onChange, onAdvanced }: Props) {
  const { busy, settledFiles, table, ocrFile } = usePageEngine(page, onChange)
  const [wish, setWish] = useState('')
  const [readyId, setReadyId] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [needPass, setNeedPass] = useState(false)
  const readFiles = settledFiles.filter((f) => f.parsed)
  const filesKey = readFiles.map((f) => f.id).join()

  // Latest values for the async run; a newer run makes older results stale.
  const latest = useRef({ page, settledFiles, choice: { wish: '', readyId: '' } as Choice })
  latest.current.page = page
  latest.current.settledFiles = settledFiles
  const runId = useRef(0)

  const run = async (choice: Choice) => {
    latest.current.choice = choice
    const id = ++runId.current
    const files = latest.current.settledFiles.filter((f) => f.parsed)
    if (files.length === 0) return
    setNeedPass(false)
    setWorking('AI is building your Excel…')
    const ready = STARTERS.find((s) => s.template.id === choice.readyId)?.template
    const r = await buildWithAi(files, choice.wish, latest.current.page.template, (t) => id === runId.current && setWorking(t), ready)
    if (id !== runId.current) return
    onChange((p) => ({ ...p, template: applyOrder(r.template) })) // keeps the column order the user arranged
    setNotes(r.notes)
    setNeedPass(!!r.needsPasscode)
    setWorking(null)
  }

  // Runs by itself whenever the set of read files changes, keeping the user's last choice.
  useEffect(() => {
    if (busy || filesKey === '') return
    void run(latest.current.choice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, busy])

  const clearAll = () => {
    runId.current++
    onChange((p) => ({ ...p, files: [], template: { ...p.template, columns: [], name: '' } }))
    setNotes([])
    setWorking(null)
    setNeedPass(false)
  }

  // Codes made by the app and items per trade, for the summary.
  const codeCol = table.columns.findIndex((c) => c.extractor.kind === 'itemCode')
  const madeCount = codeCol === -1 ? 0 : new Set([...table.madeCodes].map((i) => table.rows[i][codeCol])).size
  const present = useMemo(() => descriptionsIn(page.template, settledFiles), [page.template, settledFiles])
  const aiCells = table.marks.reduce((n, m) => n + m.filter((x) => x === 'ai').length, 0)
  const tradeCol = table.columns.findIndex((c) => c.extractor.kind === 'classify' && c.extractor.what === 'trade')
  const tradeCounts = new Map<string, number>()
  if (tradeCol !== -1) for (const r of table.rows) tradeCounts.set(String(r[tradeCol] || 'Not sorted'), (tradeCounts.get(String(r[tradeCol] || 'Not sorted')) ?? 0) + 1)

  return (
    <main className="simple">
        <FilePanel
          title="1. Add files"
          files={page.files}
          onAdd={(files) => onChange((p) => ({ ...p, files: [...p.files, ...files] }))}
          onClear={clearAll}
          onOcr={(id) => void ocrFile(id)}
          onRemove={(id) => onChange((p) => ({ ...p, files: p.files.filter((f) => f.id !== id) }))}
        />

        <section className="panel how">
          <header className="panel-head">
            <h2>2. Choose how</h2>
            <button className="link small" onClick={onAdvanced}>
              Set it up myself ›
            </button>
          </header>
          <p className="muted small">
            AI does it by itself: picks the columns, sorts every item into a trade (Textiles, Jewellery, Food, Plumbing…), and gives a serial number and item
            code where one is missing. What AI fills in is shown in purple. Tell it what you want, or leave this empty.
          </p>
          <textarea
            rows={3}
            value={wish}
            placeholder="e.g. One row per item with invoice number, description, quantity and amount"
            onChange={(e) => setWish(e.target.value)}
          />
          <VoiceButton disabled={working !== null} onText={(text) => setWish((w) => (w.trim() ? `${w.trimEnd()} ` : '') + text)} />
          <div className="row">
            <button className="primary" disabled={readFiles.length === 0 || working !== null} onClick={() => void run({ wish, readyId: '' })}>
              {wish.trim() ? 'Make it this way' : 'Redo with AI'}
            </button>
            <select
              aria-label="Ready format"
              value={readyId}
              disabled={readFiles.length === 0 || working !== null}
              onChange={(e) => {
                setReadyId(e.target.value)
                void run({ wish: '', readyId: e.target.value })
              }}
            >
              <option value="">or pick a ready format…</option>
              {STARTERS.map((s) => (
                <option key={s.template.id} value={s.template.id}>
                  {s.template.name}
                </option>
              ))}
            </select>
          </div>
          {working && (
            <p className="working" role="status">
              <span className="spinner" aria-hidden /> {working}
            </p>
          )}
          {needPass && (
            <div role="alert">
              <p className="small">This online version needs the AI passcode.</p>
              <PasscodeBox onSaved={() => void run(latest.current.choice)} />
            </div>
          )}
          {notes.map((n) => (
            <p key={n} className="note small">
              {n}
            </p>
          ))}
          <p className="muted small">🔒 Files stay on this computer. Only item names the app can't sort by itself are sent to AI.</p>
        </section>

      {readFiles.length === 0 && !busy ? (
        <section className="panel empty">
          <h2>3. Check &amp; download</h2>
          <p className="muted">Drop your files on the left. The Excel appears here by itself.</p>
        </section>
      ) : page.template.columns.length === 0 && (busy || working !== null) ? (
        <section className="panel empty">
          <h2>3. Check &amp; download</h2>
          <p className="working" role="status">
            <span className="spinner" aria-hidden /> {working ?? 'Reading your files…'}
          </p>
          <p className="muted small">The Excel appears here as soon as it's ready.</p>
        </section>
      ) : (
        <div className="results">
          {table.rows.length > 0 && (
            <div className="summary">
              <span>
                <strong>{table.rows.length}</strong> rows from <strong>{readFiles.length}</strong> file{readFiles.length === 1 ? '' : 's'}
                {aiCells > 0 && (
                <>
                  {' '}
                  · <strong className="ai-count">{aiCells}</strong> cells filled by AI
                </>
              )}
              {madeCount > 0 && (
                  <>
                    {' '}
                    · <strong>{madeCount}</strong> item codes made by the app
                  </>
                )}
              </span>
              {[...tradeCounts].map(([t, n]) => (
                <span key={t} className={`trade-chip ${t === 'Not sorted' ? 'unsorted' : ''}`}>
                  {t} <strong>{n}</strong>
                </span>
              ))}
            </div>
          )}
          <CheckList template={page.template} present={present} onChange={(template) => onChange((p) => ({ ...p, template }))} />
          <PreviewPanel
            table={table}
            defaultName={page.template.name || page.name}
            busy={busy || working !== null}
            simple
            onMoveColumn={(from, to) => {
              const template = moveColumn(page.template, from, to)
              saveOrder(template)
              onChange((p) => ({ ...p, template }))
            }}
            onResetOrder={() => {
              clearOrder()
              void run(latest.current.choice)
            }}
          />
        </div>
      )}
    </main>
  )
}
