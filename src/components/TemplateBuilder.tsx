import { useState } from 'react'
import type { ClassifyWhat, Extractor, FileEntry, Template, TemplateColumn } from '../types'
import { normalizeHeader } from '../engine/pdfExtract'
import { checkPattern } from '../engine/patternCheck'
import { codeHeader, descriptionHeader } from '../engine/classify'
import { STARTERS } from '../engine/starterTemplates'
import { copyForPage } from '../engine/library'
import { suggestTemplate } from '../engine/autoTemplate'
import { AiHelper } from './AiHelper'

interface Field {
  label: string
  extractor: Extractor
  hint?: string
}

const BUILT_IN: Field[] = [
  { label: 'File name', extractor: { kind: 'fileName' } },
  { label: 'File path', extractor: { kind: 'filePath' } },
  { label: 'Page number', extractor: { kind: 'pageNumber' } },
  { label: 'Page count', extractor: { kind: 'pageCount' } },
]

const DRAG_TYPE = 'application/x-mib-field'

const newColumn = (name: string, extractor: Extractor): TemplateColumn => ({
  id: crypto.randomUUID(),
  name,
  type: 'text',
  extractor,
})

interface Props {
  template: Template
  files: FileEntry[]
  auto: boolean
  onChange: (t: Template) => void
}

export function TemplateBuilder({ template, files, auto, onChange }: Props) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Table columns found across all read files, with how many files have each one.
  const detected = new Map<string, { label: string; count: number }>()
  for (const f of files) {
    for (const h of f.parsed?.headers ?? []) {
      const key = normalizeHeader(h)
      const cur = detected.get(key)
      detected.set(key, { label: cur?.label ?? h, count: (cur?.count ?? 0) + 1 })
    }
  }
  const readCount = files.filter((f) => f.parsed).length
  const tableFields: Field[] = [...detected.values()].map((d) => ({
    label: d.label,
    extractor: { kind: 'tableColumn', header: d.label },
    hint: `in ${d.count} of ${readCount} files`,
  }))

  // Document details (Invoice No, GSTIN, Grand Total...) found around the tables.
  const details = new Map<string, { label: string; count: number }>()
  for (const f of files) {
    for (const d of f.parsed?.fields ?? []) {
      const key = normalizeHeader(d.label)
      const cur = details.get(key)
      details.set(key, { label: cur?.label ?? d.label, count: (cur?.count ?? 0) + 1 })
    }
  }
  const detailFields: Field[] = [...details.values()].map((d) => ({
    label: d.label,
    extractor: { kind: 'docField', label: d.label },
    hint: `in ${d.count} of ${readCount} files`,
  }))
  const descHeader = descriptionHeader(tableFields.map((f) => f.label))
  const smartFields: Field[] = descHeader
    ? [
        { label: 'Trade', extractor: { kind: 'classify', header: descHeader, what: 'trade' }, hint: `Electrical, Plumbing… from ${descHeader}` },
        { label: 'Item type', extractor: { kind: 'classify', header: descHeader, what: 'type' }, hint: `from ${descHeader}` },
        { label: 'Material', extractor: { kind: 'classify', header: descHeader, what: 'material' }, hint: `from ${descHeader}` },
        { label: 'S.No', extractor: { kind: 'rowNumber' }, hint: '1, 2, 3…' },
        {
          label: 'Item Code',
          extractor: { kind: 'itemCode', header: descHeader, ...(codeHeader(tableFields.map((f) => f.label)) ? { codeHeader: codeHeader(tableFields.map((f) => f.label)) } : {}) },
          hint: 'made by the app when blank',
        },
      ]
    : []

  const pickStarter = (id: string) => {
    const s = STARTERS.find((x) => x.template.id === id)
    if (!s) return
    if (template.columns.length > 0 && !window.confirm(`Replace this page's columns with the free template "${s.template.name}"?`)) return
    onChange(copyForPage(s.template))
  }

  const setColumns = (columns: TemplateColumn[]) => onChange({ ...template, columns })
  const updateColumn = (id: string, patch: Partial<TemplateColumn>) =>
    setColumns(template.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const move = (i: number, d: number) => {
    const cols = [...template.columns]
    const j = i + d
    if (j < 0 || j >= cols.length) return
    ;[cols[i], cols[j]] = [cols[j], cols[i]]
    setColumns(cols)
  }

  const readDrop = (e: React.DragEvent): Field | null => {
    try {
      return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Field
    } catch {
      return null
    }
  }

  const chip = (field: Field) => (
    <button
      key={field.label + field.extractor.kind}
      className="chip"
      draggable
      title={field.hint ? `Found ${field.hint}. Drag onto a column, or click to add.` : 'Drag onto a column, or click to add.'}
      onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(field))}
      onClick={() => setColumns([...template.columns, newColumn(field.label, field.extractor)])}
    >
      {field.label}
      {field.hint && <span className="chip-hint">{field.hint}</span>}
    </button>
  )

  const dropZone = (
    <div
      className={`add-zone ${dropTarget === 'new' ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDropTarget('new')
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => {
        e.preventDefault()
        setDropTarget(null)
        const f = readDrop(e)
        if (f) setColumns([...template.columns, newColumn(f.label, f.extractor)])
      }}
    >
      <strong>Drop a field here</strong> to add it as a new Excel column, or{' '}
      <button className="link" onClick={() => setColumns([...template.columns, newColumn('', { kind: 'constant', value: '' })])}>
        add an empty column
      </button>
    </div>
  )

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>2. Template</h2>
        <span className="muted small">{template.columns.length} Excel columns</span>
      </header>
      <p className="muted small step-intro">
        A template decides which columns your Excel gets and where each value comes from. Build it in four steps, top to bottom.
      </p>

      <div className="step">
        <h3>
          <span className="step-no">A</span> Start quickly <span className="muted small">(optional)</span>
        </h3>
        <p className="muted small">
          Pick a ready-made template, let Auto suggest one, or describe what you want to the AI helper. You can change everything after.
        </p>
        {auto && <AutoSuggest files={files} template={template} onChange={onChange} />}
        <label className="block">
          Free template{' '}
          <select value="" onChange={(e) => pickStarter(e.target.value)}>
            <option value="">Pick one…</option>
            {STARTERS.map((s) => (
              <option key={s.template.id} value={s.template.id} title={s.expects}>
                {s.template.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Each free template expects certain headings (hover an option to see which). Missing ones stay empty and the preview says so.
        </p>
        <AiHelper files={files} template={template} onChange={onChange} />
      </div>

      <div className="step">
        <h3>
          <span className="step-no">B</span> Settings
        </h3>
        <div className="form-row">
          <label>
            Template name
            <input
              value={template.name}
              placeholder="e.g. Sharma invoices"
              onChange={(e) => onChange({ ...template, name: e.target.value })}
            />
          </label>
          <label>
            One Excel row per
            <select
              value={template.rowMode}
              onChange={(e) => onChange({ ...template, rowMode: e.target.value as Template['rowMode'] })}
            >
              <option value="tableRows">table row (e.g. each item in a price list)</option>
              <option value="onePerFile">file (e.g. one row per document)</option>
            </select>
          </label>
        </div>
        <label className="block small">
          <input
            type="checkbox"
            checked={!!template.keepTotals}
            onChange={(e) => onChange({ ...template, keepTotals: e.target.checked })}
          />{' '}
          Keep total and tax lines (Grand Total, CGST…) as their own rows
        </label>
        <p className="muted small">
          Usually leave this off and add the totals as columns from “Document details” below, so every row is complete.
        </p>
      </div>

      <div className="step">
        <h3>
          <span className="step-no">C</span> Fields found in your files
        </h3>
        <p className="muted small">
          <strong>Click</strong> a field to add it as a column, or <strong>drag</strong> it onto the drop zone or onto an existing
          column in step D.
        </p>

        <h4>Table columns</h4>
        {tableFields.length === 0 ? (
          <p className="muted small">{readCount === 0 ? 'Add files to see their table columns here.' : 'No table columns detected.'}</p>
        ) : (
          <div className="chips">{tableFields.map(chip)}</div>
        )}

        <h4>Document details</h4>
        {detailFields.length === 0 ? (
          <p className="muted small">
            {readCount === 0
              ? 'Invoice No, Date, GSTIN, Taxable Value, CGST, Grand Total and other details printed around the table show up here.'
              : 'No document details found. (Files added before this update need to be added again.)'}
          </p>
        ) : (
          <>
            <p className="muted small">Printed once per document. Added as a column, they repeat on every item row.</p>
            <div className="chips">{detailFields.map(chip)}</div>
          </>
        )}

        {smartFields.length > 0 && (
          <>
            <h4>Worked out from the description</h4>
            <div className="chips">{smartFields.map(chip)}</div>
            <TeachWords template={template} onChange={onChange} />
          </>
        )}

        <h4>About the file</h4>
        <div className="chips">{BUILT_IN.map(chip)}</div>
      </div>

      <div className="step">
        <div className="row space">
          <h3>
            <span className="step-no">D</span> Excel columns
          </h3>
          <span className="row">
            {tableFields.length > 0 && (
              <button
                className="link"
                onClick={() => setColumns([...template.columns, ...tableFields.map((f) => newColumn(f.label, f.extractor))])}
              >
                Add all table columns
              </button>
            )}
            {template.columns.length > 0 && (
              <button
                className="link danger-link"
                onClick={() => window.confirm(`Remove all ${template.columns.length} Excel columns?`) && setColumns([])}
              >
                Remove all columns
              </button>
            )}
          </span>
        </div>
        <p className="muted small">
          Top to bottom here is left to right in the Excel. Use ↑ ↓ to reorder, ✕ to remove, and the type (Number, Date, Unit) to
          clean the values.
        </p>
        {dropZone}
        {template.columns.length === 0 && (
          <p className="muted small">No columns yet. Add fields from step C, or pick a template in step A.</p>
        )}
        <ol className="columns">
          {template.columns.map((col, i) => (
            <li
              key={col.id}
              className={`column ${dropTarget === col.id ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDropTarget(col.id)
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDropTarget(null)
                const f = readDrop(e)
                if (f) updateColumn(col.id, { extractor: f.extractor, name: col.name || f.label })
              }}
            >
              <div className="column-top">
                <span className="col-no">{i + 1}</span>
                <input
                  className="col-name"
                  placeholder="Column name"
                  value={col.name}
                  onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                />
                <select value={col.type} onChange={(e) => updateColumn(col.id, { type: e.target.value as TemplateColumn['type'] })}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date (DD-MM-YYYY)</option>
                  <option value="unit">Unit (one spelling)</option>
                </select>
                <button className="icon" title="Move up" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button className="icon" title="Move down" onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button
                  className="icon danger"
                  title="Remove column"
                  onClick={() => setColumns(template.columns.filter((c) => c.id !== col.id))}
                >
                  ✕
                </button>
              </div>
              <ExtractorEditor
                extractor={col.extractor}
                headers={tableFields.map((f) => f.label)}
                details={detailFields.map((f) => f.label)}
                onChange={(extractor) => updateColumn(col.id, { extractor })}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function ExtractorEditor({
  extractor,
  headers,
  details,
  onChange,
}: {
  extractor: Extractor
  headers: string[]
  details: string[]
  onChange: (e: Extractor) => void
}) {
  const setKind = (kind: Extractor['kind']) => {
    switch (kind) {
      case 'tableColumn':
        return onChange({ kind, header: headers[0] ?? '' })
      case 'docField':
        return onChange({ kind, label: details[0] ?? '' })
      case 'classify':
        return onChange({ kind, header: descriptionHeader(headers) ?? headers[0] ?? '', what: 'type' })
      case 'itemCode': {
        const code = codeHeader(headers)
        return onChange({ kind, header: descriptionHeader(headers) ?? headers[0] ?? '', ...(code ? { codeHeader: code } : {}) })
      }
      case 'regex':
        return onChange({ kind, pattern: '', group: 1 })
      case 'constant':
        return onChange({ kind, value: '' })
      default:
        return onChange({ kind })
    }
  }

  return (
    <div className="extractor">
      <select value={extractor.kind} onChange={(e) => setKind(e.target.value as Extractor['kind'])}>
        <option value="tableColumn">From table column</option>
        <option value="docField">Document detail (Invoice No, GSTIN, Grand Total…)</option>
        <option value="classify">Trade / item type / material from a column</option>
        <option value="rowNumber">S.No (1, 2, 3…)</option>
        <option value="itemCode">Item code (made by the app when blank)</option>
        <option value="regex">Find text by pattern</option>
        <option value="fileName">File name</option>
        <option value="filePath">File path</option>
        <option value="pageNumber">Page number</option>
        <option value="pageCount">Page count</option>
        <option value="constant">Fixed value</option>
      </select>
      {extractor.kind === 'tableColumn' && (
        <>
          <input
            list="detected-headers"
            value={extractor.header}
            placeholder="Header name"
            onChange={(e) => onChange({ ...extractor, header: e.target.value })}
          />
          <datalist id="detected-headers">
            {headers.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </>
      )}
      {extractor.kind === 'regex' && (
        <>
          <input
            value={extractor.pattern}
            placeholder="e.g. Quotation No[:.]?\s*(\S+)"
            onChange={(e) => onChange({ ...extractor, pattern: e.target.value })}
          />
          <span style={{ color: 'var(--warn)', fontSize: 12 }}>
            {checkPattern(extractor.pattern) ?? ''}
          </span>
          <span className="muted small">Checked for some slow shapes. Not a guarantee.</span>
          <input
            className="narrow"
            type="number"
            min={0}
            title="Which bracket group to keep (0 = whole match)"
            value={extractor.group}
            onChange={(e) => onChange({ ...extractor, group: Number(e.target.value) || 0 })}
          />
        </>
      )}
      {extractor.kind === 'docField' && (
        <>
          <input
            list="detected-details"
            value={extractor.label}
            placeholder="Detail name, e.g. Invoice No"
            onChange={(e) => onChange({ ...extractor, label: e.target.value })}
          />
          <datalist id="detected-details">
            {details.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </>
      )}
      {extractor.kind === 'classify' && (
        <>
          <select value={extractor.what} onChange={(e) => onChange({ ...extractor, what: e.target.value as ClassifyWhat })}>
            <option value="trade">Trade</option>
            <option value="type">Item type</option>
            <option value="material">Material</option>
          </select>
          <span className="muted small">from</span>
          <input
            list="detected-headers"
            value={extractor.header}
            placeholder="Description column"
            onChange={(e) => onChange({ ...extractor, header: e.target.value })}
          />
        </>
      )}
      {extractor.kind === 'itemCode' && (
        <>
          <span className="muted small">for</span>
          <input
            list="detected-headers"
            value={extractor.header}
            placeholder="Description column"
            onChange={(e) => onChange({ ...extractor, header: e.target.value })}
          />
          <span className="muted small">existing codes in</span>
          <input
            list="detected-headers"
            value={extractor.codeHeader ?? ''}
            placeholder="(none)"
            onChange={(e) => onChange({ kind: 'itemCode', header: extractor.header, ...(e.target.value ? { codeHeader: e.target.value } : {}) })}
          />
        </>
      )}
      {extractor.kind === 'constant' && (
        <input value={extractor.value} placeholder="Value" onChange={(e) => onChange({ ...extractor, value: e.target.value })} />
      )}
    </div>
  )
}

// The user's own words for trade / item type / material ("Tower bolt" is a "Door hardware"). Saved with the template.
// AI answers are kept in the same list but managed from "Please check", so they are not shown here.
function TeachWords({ template, onChange }: { template: Template; onChange: (t: Template) => void }) {
  const [word, setWord] = useState('')
  const [trade, setTrade] = useState('')
  const [type, setType] = useState('')
  const [material, setMaterial] = useState('')
  const all = template.words ?? []
  const words = all.filter((w) => !w.ai)
  const aiWords = all.filter((w) => w.ai)

  const add = () => {
    const w = word.trim()
    if (!w || (!trade.trim() && !type.trim() && !material.trim())) return
    const rest = words.filter((x) => x.word.toLowerCase() !== w.toLowerCase())
    const opt = (k: string, v: string) => (v.trim() ? { [k]: v.trim().slice(0, 60) } : {})
    const next = { word: w.slice(0, 60), ...opt('trade', trade), ...opt('type', type), ...opt('material', material) }
    onChange({ ...template, words: [...aiWords, ...[...rest, next].slice(-200)] })
    setWord('')
    setTrade('')
    setType('')
    setMaterial('')
  }

  return (
    <details className="small" style={{ margin: '8px 0' }}>
      <summary>Teach a word ({words.length} taught)</summary>
      <p className="muted">If a trade, item type or material comes out blank or wrong, teach the word here. It is saved with this template.</p>
      <div className="row">
        <input value={word} placeholder="Word in the description, e.g. Tower Bolt" onChange={(e) => setWord(e.target.value)} />
        <input value={trade} placeholder="Trade, e.g. Hardware" onChange={(e) => setTrade(e.target.value)} />
        <input value={type} placeholder="Item type, e.g. Door hardware" onChange={(e) => setType(e.target.value)} />
        <input value={material} placeholder="Material (optional)" onChange={(e) => setMaterial(e.target.value)} />
        <button onClick={add}>Add</button>
      </div>
      {words.length > 0 && (
        <ul className="lib-list">
          {words.map((w) => (
            <li key={w.word} className="row space">
              <span>
                <strong>{w.word}</strong> → {[w.trade, w.type, w.material].filter(Boolean).join(' · ')}
              </span>
              <button className="icon danger" title="Forget this word" onClick={() => onChange({ ...template, words: all.filter((x) => x !== w) })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

// Auto mode: the template that fits the loaded files best, ready to use with one click.
function AutoSuggest({ files, template, onChange }: { files: FileEntry[]; template: Template; onChange: (t: Template) => void }) {
  const s = suggestTemplate(files)
  if (!s) return <p className="small muted">Auto mode: add files and a template will be suggested here.</p>
  const use = () => {
    if (template.columns.length > 0 && !window.confirm(`Replace this page's columns with "${s.template.name}"?`)) return
    onChange(copyForPage(s.template))
  }
  return (
    <div className="small" role="status" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
      <strong>Suggested:</strong> {s.template.name}{' '}
      <span className="muted">
        {s.fromStarter ? `(${s.found} of ${s.total} columns found in your files)` : `(no free template fits, so ${s.total} columns from everything found)`}
      </span>{' '}
      <button className="primary" onClick={use}>
        Use it
      </button>
      <span className="muted"> You can change any column after.</span>
    </div>
  )
}
