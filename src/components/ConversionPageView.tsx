import type { ConversionPage } from '../types'
import { FilePanel } from './FilePanel'
import { TemplateBuilder } from './TemplateBuilder'
import { PreviewPanel } from './PreviewPanel'
import { CheckList } from './CheckList'
import { usePageEngine } from './usePageEngine'
import { moveColumn } from '../engine/columnOrder'

interface Props {
  page: ConversionPage
  auto: boolean
  onChange: (update: (p: ConversionPage) => ConversionPage) => void
}

// The advanced screen: files, the full template builder and the preview side by side.
export function ConversionPageView({ page, auto, onChange }: Props) {
  const { busy, settledFiles, table, ocrFile } = usePageEngine(page, onChange)

  return (
    <div className="workspace">
      <FilePanel
        files={page.files}
        onAdd={(files) => onChange((p) => ({ ...p, files: [...p.files, ...files] }))}
        onClear={() => onChange((p) => ({ ...p, files: [] }))}
        onOcr={(id) => void ocrFile(id)}
        onRemove={(id) => onChange((p) => ({ ...p, files: p.files.filter((f) => f.id !== id) }))}
      />
      <TemplateBuilder
        template={page.template}
        files={settledFiles}
        auto={auto}
        onChange={(template) => onChange((p) => ({ ...p, template }))}
      />
      <div>
        <CheckList template={page.template} onChange={(template) => onChange((p) => ({ ...p, template }))} />
        <PreviewPanel
          table={table}
          defaultName={page.template.name || page.name}
          busy={busy}
          onMoveColumn={(from, to) => onChange((p) => ({ ...p, template: moveColumn(p.template, from, to) }))}
        />
      </div>
    </div>
  )
}
