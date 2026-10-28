import { getDocument } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { ParsedDoc } from '../types'
import { detectTable, docFields, groupIntoLines, worker, type Line } from './pdfExtract'

const SCALE = 2 // render pages at twice their size so small print reads well

// Reads scanned (image-only) PDF pages with OCR, in the browser. The reading engine and the
// English word data are downloaded once; the file itself never leaves this computer.
// Each word OCR finds becomes a text piece at its position, then the same line, table and
// document-detail logic as for normal PDFs runs on it.
export async function readPdfWithOcr(file: File, onProgress?: (page: number, pages: number) => void): Promise<ParsedDoc> {
  const { createWorker } = await import('tesseract.js')
  const ocr = await createWorker('eng')
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), worker: worker(), disableFontFace: true })
  const doc = await task.promise
  const lines: Line[] = []
  const textParts: string[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress?.(p, doc.numPages)
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const { data } = await ocr.recognize(canvas, {}, { blocks: true })
      const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((para) => para.lines.flatMap((l) => l.words)))
      // Canvas y grows downwards; PDF y grows upwards, which is what groupIntoLines expects.
      const items = words
        .filter((w) => w.text.trim() !== '' && w.confidence > 30)
        .map((w) => {
          const h = (w.bbox.y1 - w.bbox.y0) / SCALE
          return {
            str: w.text,
            width: (w.bbox.x1 - w.bbox.x0) / SCALE,
            height: h,
            transform: [1, 0, 0, h, w.bbox.x0 / SCALE, (canvas.height - w.bbox.y1) / SCALE],
          } as unknown as TextItem
        })
      const pageLines = groupIntoLines(items, p)
      lines.push(...pageLines)
      textParts.push(pageLines.map((l) => l.cells.map((c) => c.text).join('  ')).join('\n'))
      page.cleanup()
    }
  } finally {
    await task.destroy()
    await ocr.terminate()
  }
  const { headers, rows, headerIndex } = detectTable(lines)
  return {
    pageCount: textParts.length,
    pagesWithoutText: [],
    headers,
    rows,
    fields: docFields(headerIndex === -1 ? lines : lines.slice(0, headerIndex), rows),
    fullText: textParts.join('\n'),
    ocr: true,
  }
}
