import { useState } from 'react'

// Drag a column bubble (or a table heading) and drop it on another to put it there.
// A focused bubble also moves with the ← and → keys, for touchpads and keyboards.
export function useColumnDrag(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const reset = () => {
    setDragging(null)
    setOver(null)
  }
  const props = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragging(i)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-column', String(i))
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('text/x-column')) return // files dropped here are not columns
      e.preventDefault()
      setOver(i)
    },
    onDragLeave: () => setOver((o) => (o === i ? null : o)),
    onDrop: (e: React.DragEvent) => {
      const from = Number(e.dataTransfer.getData('text/x-column'))
      if (Number.isInteger(from)) {
        e.preventDefault()
        onMove(from, i)
      }
      reset()
    },
    onDragEnd: reset,
  })
  return { props, dragging, over }
}
