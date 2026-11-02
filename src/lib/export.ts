import JSZip from 'jszip'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ExportSettings, Mask, PageSize } from '@/types'
import { paintMasks } from './mosaic'
import { getPageSize } from './pdf'
import { sanitizeFileName, downloadBlob } from './utils'

/** Browsers refuse canvases beyond ~16k on a side and become unstable past a few hundred MPx. */
export const MAX_SIDE = 16384
export const MAX_PIXELS = 80_000_000

export interface SizeResult {
  width: number
  height: number
  clamped: boolean
  /** actual dots-per-inch achieved with this pixel size */
  dpi: number
}

export function computeExportSize(page: PageSize, settings: ExportSettings): SizeResult {
  let width: number
  let height: number

  if (settings.sizeMode === 'dpi') {
    const factor = settings.dpi / 72
    width = Math.round(page.width * factor)
    height = Math.round(page.height * factor)
  } else {
    width = Math.round(settings.width)
    height = settings.lockRatio
      ? Math.round((width * page.height) / page.width)
      : Math.round(settings.height)
  }

  width = Math.max(16, width)
  height = Math.max(16, height)

  let clamped = false
  if (width > MAX_SIDE) {
    width = MAX_SIDE
    clamped = true
  }
  if (height > MAX_SIDE) {
    height = MAX_SIDE
    clamped = true
  }
  const area = width * height
  if (area > MAX_PIXELS) {
    const factor = Math.sqrt(MAX_PIXELS / area)
    width = Math.floor(width * factor)
    height = Math.floor(height * factor)
    clamped = true
  }

  const dpi = Math.round((width / page.width) * 72)
  return { width, height, clamped, dpi }
}

/** Render one page plus its masks into a fresh canvas of exactly `width` x `height`. */
export async function renderPageBitmap(
  doc: PDFDocumentProxy,
  pageNumber: number,
  masks: Mask[],
  page: PageSize,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const pdfPage = await doc.getPage(pageNumber)
  const viewport = pdfPage.getViewport({ scale: width / page.width })

  const base = document.createElement('canvas')
  base.width = Math.max(1, Math.round(viewport.width))
  base.height = Math.max(1, Math.round(viewport.height))
  const baseCtx = base.getContext('2d')
  if (!baseCtx) throw new Error('2d context unavailable')
  baseCtx.fillStyle = '#ffffff'
  baseCtx.fillRect(0, 0, base.width, base.height)

  await pdfPage.render({ canvas: base, viewport }).promise

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(base, 0, 0, base.width, base.height, 0, 0, width, height)

  if (masks.length) paintMasks(ctx, base, masks, width / page.width)

  base.width = 0
  base.height = 0
  return out
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob() returned null'))),
      type,
      type === 'image/jpeg' ? quality : undefined,
    )
  })
}

export interface ExportRequest {
  doc: PDFDocumentProxy
  pages: number[]
  masks: Mask[]
  settings: ExportSettings
  fileName: string
  onProgress?: (done: number, total: number) => void
}

export interface ExportResult {
  count: number
  clamped: boolean
  fileName: string
  bytes: number
}

export async function exportPages(request: ExportRequest): Promise<ExportResult> {
  const { doc, pages, masks, settings } = request
  const isPng = settings.format === 'png'
  const mime = isPng ? 'image/png' : 'image/jpeg'
  const ext = isPng ? 'png' : 'jpg'
  const base = sanitizeFileName(request.fileName || 'page')
  const pad = String(doc.numPages).length

  const zip = pages.length > 1 ? new JSZip() : null
  let clamped = false
  let bytes = 0
  let downloaded = false

  for (let index = 0; index < pages.length; index++) {
    const pageNumber = pages[index]!
    const size = await getPageSize(doc, pageNumber)
    const target = computeExportSize(size, settings)
    if (target.clamped) clamped = true

    const bitmap = await renderPageBitmap(
      doc,
      pageNumber,
      masks.filter((mask) => mask.page === pageNumber),
      size,
      target.width,
      target.height,
    )
    const blob = await canvasToBlob(bitmap, mime, settings.quality)
    bitmap.width = 0
    bitmap.height = 0
    bytes += blob.size

    const name = `${base}-p${String(pageNumber).padStart(pad, '0')}.${ext}`
    if (zip) {
      zip.file(name, blob)
    } else {
      downloadBlob(blob, name)
      downloaded = true
    }

    request.onProgress?.(index + 1, pages.length)
    // let the UI paint between pages
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (zip) {
    const archive = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
      compressionOptions: { level: 0 },
    })
    const name = `${base}-${pages.length}p.zip`
    downloadBlob(archive, name)
    bytes = archive.size
    return { count: pages.length, clamped, fileName: name, bytes }
  }

  return {
    count: pages.length,
    clamped,
    fileName: downloaded ? `${base}-p${String(pages[0]).padStart(pad, '0')}.${ext}` : base,
    bytes,
  }
}
