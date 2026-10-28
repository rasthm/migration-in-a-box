import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversionPage, FileEntry } from '../types'
import { readPdf } from '../engine/pdfExtract'
import { isSheet, readSheet } from '../engine/sheetExtract'
import { regexKey, runTemplate, type RegexResults } from '../engine/runTemplate'
import { runPatterns } from '../engine/regexRunner'
import { checkPattern } from '../engine/patternCheck'
import { readPdfWithOcr } from '../engine/ocr'

// Files being read right now, across remounts (switching pages keeps reading going).
const inFlight = new Set<string>()
const FLUSH_MS = 200

// Reads a page's files, runs its template and returns the output table. Used by both the
// simple step-by-step screen and the advanced screen.
export function usePageEngine(page: ConversionPage, onChange: (update: (p: ConversionPage) => ConversionPage) => void) {
  const reading = useRef(false)
  const [tick, setTick] = useState(0)
  const pending = useRef(new Map<string, Partial<FileEntry>>())
  const flushTimer = useRef<number | null>(null)

  // Status updates are batched so a big folder re-renders a few times a second, not once per file.
  const flush = () => {
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current)
    flushTimer.current = null
    const patches = pending.current
    if (patches.size === 0) return
    pending.current = new Map()
    onChange((p) => ({ ...p, files: p.files.map((f) => (patches.has(f.id) ? { ...f, ...patches.get(f.id) } : f)) }))
  }
  const queuePatch = (id: string, patch: Partial<FileEntry>) => {
    pending.current.set(id, { ...pending.current.get(id), ...patch })
    if (flushTimer.current === null) flushTimer.current = window.setTimeout(flush, FLUSH_MS)
  }

  // Read queued PDFs one at a time so a big folder doesn't fill memory.
  useEffect(() => {
    if (reading.current) return
    const queue = page.files.filter((f) => f.status === 'queued' && f.file && !inFlight.has(f.id))
    if (queue.length === 0) return
    reading.current = true
    ;(async () => {
      for (const entry of queue) {
        inFlight.add(entry.id)
        try {
          const parsed = isSheet(entry.name) ? await readSheet(entry.file!) : await readPdf(entry.file!)
          const noText = parsed.pagesWithoutText.length
          const allScanned = noText === parsed.pageCount
          queuePatch(entry.id, {
            status: allScanned ? 'needs-ocr' : 'done',
            parsed: allScanned ? undefined : parsed,
            file: allScanned ? entry.file : undefined, // kept so it can be read with OCR
            message: allScanned
              ? 'Looks scanned (no text layer). Press "Read scanned pages" to read it with OCR.'
              : noText > 0
                ? `Page ${parsed.pagesWithoutText.join(', ')} has no text layer (needs OCR)`
                : undefined,
          })
        } catch (err) {
          queuePatch(entry.id, { status: 'error', file: undefined, message: err instanceof Error ? err.message : String(err) })
        } finally {
          inFlight.delete(entry.id)
        }
      }
      flush()
      reading.current = false
      setTick((t) => t + 1) // pick up files added while this batch was running
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.files, tick])

  // OCR for a scanned file, only when the user asks for it.
  const ocrFile = async (id: string) => {
    const entry = page.files.find((f) => f.id === id)
    if (!entry?.file) return
    const set = (patch: Partial<FileEntry>) => onChange((p) => ({ ...p, files: p.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
    set({ status: 'reading', message: 'Reading with OCR… (first time: downloading the reading engine)' })
    try {
      const parsed = await readPdfWithOcr(entry.file, (n, of) => set({ message: `Reading page ${n} of ${of} with OCR…` }))
      set({ status: 'done', parsed, file: undefined, message: 'Read by OCR: please check the numbers' })
    } catch (err) {
      set({ status: 'needs-ocr', message: `OCR failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  // The template panel and preview only update once reading has finished, so they
  // don't re-run over every file on each progress update.
  const busy = page.files.some((f) => f.status === 'queued' || f.status === 'reading')
  const [settledFiles, setSettledFiles] = useState(page.files)
  if (!busy && settledFiles !== page.files) setSettledFiles(page.files)

  // Patterns run in a worker with a time limit; the preview fills in when they finish.
  const [regex, setRegex] = useState<RegexResults>(() => new Map())
  const patterns = [...new Set(page.template.columns.flatMap((c) => (c.extractor.kind === 'regex' && c.extractor.pattern && !checkPattern(c.extractor.pattern) ? [c.extractor.pattern] : [])))]
  const patternKey = patterns.join('')
  useEffect(() => {
    if (patterns.length === 0) return
    let cancelled = false
    const jobs = settledFiles.flatMap((f) => (f.parsed ? patterns.map((p) => ({ key: regexKey(f.id, p), pattern: p, text: f.parsed!.fullText })) : []))
    void runPatterns(jobs).then((r) => !cancelled && setRegex(r))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternKey, settledFiles])

  const table = useMemo(() => runTemplate(page.template, settledFiles, regex), [page.template, settledFiles, regex])

  return { busy, settledFiles, table, ocrFile }
}
