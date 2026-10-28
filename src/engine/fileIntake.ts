// Collects files from drag-and-drop, file pickers and folder pickers (including
// USB drives). Files are only opened locally; nothing is uploaded.

import type { FileEntry } from '../types'
import { isSheet } from './sheetExtract'

export interface PickedFile {
  file: File
  path: string
}

interface DirectoryHandle {
  name: string
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> } & DirectoryHandle>
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<DirectoryHandle>
  }
}

export const supportsDirectoryPicker = () => typeof window.showDirectoryPicker === 'function'

export async function pickDirectory(): Promise<PickedFile[]> {
  const root = await window.showDirectoryPicker!()
  const out: PickedFile[] = []
  const walk = async (dir: DirectoryHandle, prefix: string) => {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.getFile) out.push({ file: await entry.getFile(), path: `${prefix}/${entry.name}` })
      else if (entry.kind === 'directory') await walk(entry, `${prefix}/${entry.name}`)
    }
  }
  await walk(root, root.name)
  return out
}

export function fromInput(list: FileList | null): PickedFile[] {
  return Array.from(list ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}

export async function fromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e)
  if (entries.length === 0) return fromInput(dt.files)

  const out: PickedFile[] = []
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      out.push({ file, path })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // readEntries returns results in batches, so keep reading until it's empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (batch.length === 0) break
        for (const child of batch) await walk(child, path)
      }
    }
  }
  for (const entry of entries) await walk(entry, '')
  return out
}

export const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

export function toEntries(picked: PickedFile[]): FileEntry[] {
  return picked.map(({ file, path }) => {
    const ok = isPdf(file) || isSheet(file.name)
    return {
      id: crypto.randomUUID(),
      name: file.name,
      path,
      size: file.size,
      file: ok ? file : undefined,
      status: ok ? 'queued' : 'unsupported',
      message: ok ? undefined : 'Only PDF, Excel and CSV files are converted in this version',
    }
  })
}
