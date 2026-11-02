import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PageSize } from '@/types'
import type { DocPage, SourceDoc } from './source'

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

function pageSizeOf(page: PDFPageProxy): PageSize {
  const viewport = page.getViewport({ scale: 1 })
  return { width: viewport.width, height: viewport.height }
}

class PdfPage implements DocPage {
  private task: RenderTask | null = null

  constructor(private readonly page: PDFPageProxy) {}

  get pageNumber() {
    return this.page.pageNumber
  }

  get size(): PageSize {
    return pageSizeOf(this.page)
  }

  async render(canvas: HTMLCanvasElement, scale: number): Promise<void> {
    this.cancel()
    const viewport = this.page.getViewport({ scale })
    const task = this.page.render({ canvas, viewport })
    this.task = task
    try {
      await task.promise
    } catch (error) {
      // a cancelled render is an expected outcome, not a failure
      if ((error as { name?: string } | null)?.name === 'RenderingCancelledException') return
      throw error
    } finally {
      if (this.task === task) this.task = null
    }
  }

  cancel() {
    const task = this.task
    this.task = null
    if (!task) return
    try {
      task.cancel()
    } catch {
      /* the render may already be finished */
    }
  }
}

class PdfDocument implements SourceDoc {
  readonly kind = 'pdf'
  private readonly sizes = new Map<number, PageSize>()

  constructor(
    private readonly proxy: PDFDocumentProxy,
    private readonly task: ReturnType<typeof pdfjs.getDocument>,
  ) {}

  get numPages() {
    return this.proxy.numPages
  }

  /** PDF pages have no file name of their own. */
  pageLabel(): string | null {
    return null
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    const cached = this.sizes.get(pageNumber)
    if (cached) return cached
    const page = await this.proxy.getPage(pageNumber)
    const size = pageSizeOf(page)
    this.sizes.set(pageNumber, size)
    return size
  }

  async getPage(pageNumber: number): Promise<DocPage> {
    const page = await this.proxy.getPage(pageNumber)
    this.sizes.set(pageNumber, pageSizeOf(page))
    return new PdfPage(page)
  }

  async destroy(): Promise<void> {
    // pdf.js v6 dropped PDFDocumentProxy.destroy(); the loading task owns the worker
    try {
      await this.task.destroy()
    } catch {
      /* the worker may already be gone */
    }
  }
}

export async function loadPdf(data: ArrayBuffer): Promise<SourceDoc> {
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
    const proxy = await task.promise
    return new PdfDocument(proxy, task)
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
