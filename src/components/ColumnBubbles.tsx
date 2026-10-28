import { useColumnDrag } from './useColumnDrag'
import type { OutputTable } from '../engine/runTemplate'

export function ColumnBubbles({ table, onMove, onReset }: { table: OutputTable; onMove: (from: number, to: number) => void; onReset: () => void }) {
  const { props, dragging, over } = useColumnDrag(onMove)
  const hasAi = (i: number) => table.marks.some((m) => m[i] === 'ai')
  const hasApp = (i: number) => table.marks.some((m) => m[i] === 'app')
  return (
    <div className="bubbles" aria-label="Column order">
      <span className="muted small bubbles-hint">Drag to arrange columns:</span>
      {table.columns.map((c, i) => (
        <span
          key={c.id}
          {...props(i)}
          tabIndex={0}
          role="button"
          aria-label={`${c.name}, column ${i + 1} of ${table.columns.length}. Use left and right arrow keys to move.`}
          title="Drag to move it, or click it and press ← →"
          className={['bubble', hasAi(i) ? 'bubble-ai' : hasApp(i) ? 'bubble-app' : '', dragging === i ? 'dragging' : '', over === i && dragging !== i ? 'over' : ''].join(' ')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && i > 0) {
              e.preventDefault()
              onMove(i, i - 1)
            }
            if (e.key === 'ArrowRight' && i < table.columns.length - 1) {
              e.preventDefault()
              onMove(i, i + 1)
            }
          }}
        >
          <span className="grip" aria-hidden>
            ⠿
          </span>
          {c.name || 'untitled'}
        </span>
      ))}
      <button className="link small" onClick={onReset} title="Forget the arranged order and use the app's order again">
        Reset order
      </button>
    </div>
  )
}
