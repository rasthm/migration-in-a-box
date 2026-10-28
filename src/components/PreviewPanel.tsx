import { useState } from 'react'
import type { OutputTable } from '../engine/runTemplate'
import { downloadXlsx, type Grouping } from '../engine/exportXlsx'
import { ColumnBubbles } from './ColumnBubbles'
import { useColumnDrag } from './useColumnDrag'

const RATE_KEY = 'mib.quoteRate'

const readRate = () => {
  try {
    return localStorage.getItem(RATE_KEY) ?? '1.50'
  } catch {
    return '1.50'
  }
}

// simple: the first-time screen (no step number, no job quote, which is for the person doing the job).
// onMoveColumn: when given, columns can be arranged by dragging the bubbles or the table headings.
export function PreviewPanel({
  table,
  defaultName,
  busy,
  simple = false,
  onMoveColumn,
  onResetOrder,
}: {
  table: OutputTable
  defaultName: string
  busy: boolean
  simple?: boolean
  onMoveColumn?: (from: number, to: number) => void
  onResetOrder?: () => void
}) {
  const headingDrag = useColumnDrag((from, to) => onMoveColumn?.(from, to))
  const [fileName, setFileName] = useState('')
  const [group, setGroup] = useState('none')
  const [rate, setRate] = useState(readRate)
  const name = fileName || defaultName || 'converted'
  const ready = !busy && table.columns.length > 0 && table.rows.length > 0
  const hasMarks = table.marks.some((m) => m.some((x) => x !== ''))

  const grouping: Grouping =
    group === 'file' ? { by: 'file' } : group.startsWith('col:') ? { by: 'column', index: Number(group.slice(4)) } : { by: 'none' }
  const checked = table.proof.filter((p) => p.matched !== 'no printed total')
  const matched = checked.filter((p) => p.matched === 'yes').length
  const perItem = Number(rate)
  const quote = Number.isFinite(perItem) ? table.rows.length * perItem : 0

  const saveRate = (v: string) => {
    setRate(v)
    try {
      localStorage.setItem(RATE_KEY, v)
    } catch {
      // private window: the rate just isn't remembered
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{simple ? '3. Check & download' : '3. Preview & download'}</h2>
        <span className="muted small">{busy ? 'Reading files… preview updates when done' : `${table.rows.length} rows`}</span>
      </header>

      {table.columns.length === 0 ? (
        <p className="muted">Add at least one column to the template to see a preview.</p>
      ) : (
        <>
        {onMoveColumn && table.columns.length > 1 && <ColumnBubbles table={table} onMove={onMoveColumn} onReset={() => onResetOrder?.()} />}
        <div className="table-wrap">
          {hasMarks && (
            <p className="legend small">
              <span className="swatch mark-ai">Filled by AI</span>
              <span className="swatch mark-app">Made by the app</span>
              <span className="muted">No colour: exactly as printed. The Excel uses the same colours.</span>
            </p>
          )}
          <table>
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th
                    key={c.id}
                    {...(onMoveColumn ? headingDrag.props(i) : {})}
                    className={onMoveColumn ? `movable ${headingDrag.over === i && headingDrag.dragging !== i ? 'over' : ''}` : undefined}
                    title={onMoveColumn ? 'Drag to move this column' : undefined}
                  >
                    {c.name || <em className="muted">untitled</em>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td
                      key={j}
                      className={[typeof v === 'number' ? 'num' : '', table.marks[i]?.[j] ? `mark-${table.marks[i][j]}` : ''].join(' ').trim()}
                      title={table.marks[i]?.[j] === 'ai' ? 'Filled by AI' : table.marks[i]?.[j] === 'app' ? 'Made by the app' : undefined}
                    >
                      {String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {checked.length > 0 && (
        <p className="small" role="status">
          Proof: in {matched} of {checked.length} files the item amounts match the total printed on the document.
          {matched < checked.length && ' See the warnings below.'} The Excel has a "Proof" sheet with the details.
        </p>
      )}

      {table.warnings.length > 0 && (
        <ul className="warnings">
          {table.warnings.slice(0, 8).map((w) => (
            <li key={w}>{w}</li>
          ))}
          {table.warnings.length > 8 && <li>…and {table.warnings.length - 8} more</li>}
        </ul>
      )}

      <div className="row">
        <input value={fileName} placeholder={`${name}.xlsx`} onChange={(e) => setFileName(e.target.value)} />
        <label className="small">
          Sheets{' '}
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="none">All rows in one sheet</option>
            <option value="file">One sheet per file</option>
            {table.columns.map((c, i) => (
              <option key={c.id} value={`col:${i}`}>
                One sheet per {c.name || `column ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={!ready} onClick={() => void downloadXlsx(table, name, grouping)}>
          Download Excel
        </button>
      </div>

      {!simple && table.rows.length > 0 && (
        <p className="small muted">
          Job quote: {table.rows.length} items × Rs{' '}
          <input className="narrow" value={rate} onChange={(e) => saveRate(e.target.value)} aria-label="Price per item" /> = Rs{' '}
          <strong>{quote.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> (for your quote
          only; it is not added to the Excel)
        </p>
      )}
    </section>
  )
}
