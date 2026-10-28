import { useState } from 'react'
import type { FileEntry, Template } from '../types'
import { AI_MODEL_NAME, askClaude, buildPayload } from '../engine/aiAgent'
import { copyForPage } from '../engine/library'
import { PasscodeBox } from './PasscodeBox'

// Describe the Excel you want, see exactly what will be sent, then send it to AI.
// The key is on the server (.env), never in this page.
export function AiHelper({ files, template, onChange }: { files: FileEntry[]; template: Template; onChange: (t: Template) => void }) {
  const [request, setRequest] = useState('')
  const [withSamples, setWithSamples] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ template: Template } | { error: string; needsPasscode?: boolean } | null>(null)
  const payload = buildPayload(files, request, withSamples)
  const canSend = request.trim() !== '' && !busy

  const send = async () => {
    setBusy(true)
    setResult(null)
    setResult(await askClaude(payload))
    setBusy(false)
  }

  const use = (t: Template) => {
    if (template.columns.length > 0 && !window.confirm(`Replace this page's columns with "${t.name}"?`)) return
    onChange({ ...copyForPage(t), words: template.words })
    setResult(null)
  }

  return (
    <details className="small" style={{ margin: '8px 0' }}>
      <summary>AI helper: describe the Excel you want</summary>
      <p className="muted">
        What is shown in the box below is sent to AI ({AI_MODEL_NAME}) and nothing else: no files, and no rows unless you tick the box.
      </p>
      <textarea
        rows={2}
        style={{ width: '100%' }}
        value={request}
        placeholder="e.g. One row per item with invoice number, date, description, quantity, rate and amount"
        onChange={(e) => setRequest(e.target.value)}
      />
      <div className="row">
        <label>
          <input type="checkbox" checked={withSamples} onChange={(e) => setWithSamples(e.target.checked)} /> Also send 3 sample rows
        </label>
        <button className="primary" disabled={!canSend} onClick={() => void send()}>
          {busy ? 'Asking…' : 'Send to AI'}
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 2 }}>
        Exactly what will be sent:
      </p>
      <pre style={{ maxHeight: 160, overflow: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', padding: 6, fontSize: 11 }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
      {result && 'error' in result && (
        <div role="alert" style={{ color: 'var(--warn)' }}>
          <p>{result.error}</p>
          {result.needsPasscode && <PasscodeBox onSaved={() => void send()} />}
        </div>
      )}
      {result && 'template' in result && (
        <div role="status">
          <p>
            <strong>Suggested:</strong> {result.template.name} ({result.template.rowMode === 'tableRows' ? 'one row per item' : 'one row per file'}):{' '}
            {result.template.columns.map((c) => c.name).join(', ')}
          </p>
          <button className="primary" onClick={() => use(result.template)}>
            Use it
          </button>{' '}
          <button onClick={() => setResult(null)}>Discard</button>
        </div>
      )}
    </details>
  )
}
