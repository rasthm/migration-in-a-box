import { useRef, useState } from 'react'
import type { FileEntry } from '../types'
import { fromDrop, fromInput, pickDirectory, supportsDirectoryPicker, toEntries } from '../engine/fileIntake'

const STATUS_LABEL: Record<FileEntry['status'], string> = {
  queued: 'Waiting',
  reading: 'Reading…',
  done: 'Read',
  'needs-ocr': 'Needs OCR',
  unsupported: 'Not supported yet',
  error: 'Error',
}

interface Props {
  title?: string
  files: FileEntry[]
  onAdd: (files: FileEntry[]) => void
  onClear: () => void
  onOcr: (id: string) => void
  onRemove: (id: string) => void // takes one file off the list; nothing on disk changes
}

export function FilePanel({ title = '1. Files', files, onAdd, onClear, onOcr, onRemove }: Props) {
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const chooseFolder = async () => {
    if (!supportsDirectoryPicker()) return folderInput.current?.click()
    try {
      onAdd(toEntries(await pickDirectory()))
    } catch {
      // The user closed the picker.
    }
  }

  const counts = files.reduce<Record<string, number>>((acc, f) => ((acc[f.status] = (acc[f.status] ?? 0) + 1), acc), {})

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {files.length > 0 && (
          <button className="link" onClick={onClear}>
            Clear
          </button>
        )}
      </header>

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setOver(false)
          onAdd(toEntries(await fromDrop(e.dataTransfer)))
        }}
      >
        <p className="drop-title">Drop PDFs, Excel or CSV files, or whole folders here</p>
        <p className="muted">USB drives and hard disks work too</p>
        <div className="row">
          <button onClick={() => fileInput.current?.click()}>Choose files</button>
          <button onClick={chooseFolder}>Choose folder</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onAdd(toEntries(fromInput(e.target.files)))
            e.target.value = ''
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => {
            onAdd(toEntries(fromInput(e.target.files)))
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <>
          <p className="muted small">
            {files.length} file{files.length === 1 ? '' : 's'}
            {Object.entries(counts).map(([s, n]) => ` · ${n} ${STATUS_LABEL[s as FileEntry['status']].toLowerCase()}`)}
          </p>
          <ul className="file-list">
            {files.slice(0, 300).map((f) => (
              <li key={f.id} title={f.path}>
                <span className="file-name">{f.name}</span>
                <span className={`badge ${f.status}`} title={f.message}>
                  {STATUS_LABEL[f.status]}
                </span>
                {f.parsed && f.status === 'done' && <span className="muted small">{f.parsed.rows.length} rows</span>}
                <button
                  className="icon remove"
                  title="Remove from this list (the file on your computer is not touched)"
                  aria-label={`Remove ${f.name} from the list`}
                  onClick={() => onRemove(f.id)}
                >
                  ✕
                </button>
                {f.message && <span className="muted small file-msg">{f.message}</span>}
                {f.status === 'needs-ocr' && f.file && (
                  <button
                    className="link small"
                    title="Downloads the reading engine once (about 15 MB). Your file stays on this computer."
                    onClick={() => onOcr(f.id)}
                  >
                    Read scanned pages
                  </button>
                )}
              </li>
            ))}
            {files.length > 300 && <li className="muted small">…and {files.length - 300} more</li>}
          </ul>
        </>
      )}
    </section>
  )
}
