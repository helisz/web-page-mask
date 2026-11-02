import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PageSize } from '@/types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`

export class PdfOpenError extends Error {
  constructor(
    message: string,
    readonly kind: 'password' | 'invalid' | 'unknown' = 'unknown',
  ) {
    super(message)
    this.name = 'PdfOpenError'
  }
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const bytes = new Uint8Array(data)
  if (!bytes.byteLength) throw new PdfOpenError('empty', 'invalid')

  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
    useSystemFonts: true,
  })

  try {
    const doc = await task.promise
    tasks.set(doc, task)
    return doc
  } catch (error) {
    void task.destroy().catch(() => undefined)
    const name = error instanceof Error ? error.name : ''
    if (name === 'PasswordException') throw new PdfOpenError('password', 'password')
    if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
      throw new PdfOpenError('invalid', 'invalid')
    }
    throw new PdfOpenError(error instanceof Error ? error.message : String(error), 'unknown')
  }
}

// pdf.js v6 dropped PDFDocumentProxy.destroy(); the loading task owns the worker
const tasks = new WeakMap<PDFDocumentProxy, ReturnType<typeof pdfjs.getDocument>>()

export async function destroyPdf(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  if (!doc) return
  const task = tasks.get(doc)
  tasks.delete(doc)
  if (!task) return
  try {
    await task.destroy()
  } catch {
    /* the worker may already be gone */
  }
}

export function pageSizeOf(page: PDFPageProxy): PageSize {
  const viewport = page.getViewport({ scale: 1 })
  return { width: viewport.width, height: viewport.height }
}

const sizeCache = new WeakMap<PDFDocumentProxy, Map<number, PageSize>>()

export async function getPageSize(doc: PDFDocumentProxy, pageNumber: number): Promise<PageSize> {
  let cache = sizeCache.get(doc)
  if (!cache) {
    cache = new Map()
    sizeCache.set(doc, cache)
  }
  const hit = cache.get(pageNumber)
  if (hit) return hit
  const page = await doc.getPage(pageNumber)
  const size = pageSizeOf(page)
  cache.set(pageNumber, size)
  return size
}

/**
 * pdf.js is happiest when only one render runs at a time, so the viewer,
 * thumbnails and the exporter share a single queue.
 */
let renderChain: Promise<unknown> = Promise.resolve()

export function exclusiveRender<T>(task: () => Promise<T>): Promise<T> {
  const run = renderChain.then(task, task)
  renderChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
