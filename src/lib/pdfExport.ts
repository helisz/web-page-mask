/**
 * Minimal, dependency-free PDF writer for image-only pages.
 *
 * Each page embeds one bitmap that already has the masks baked in:
 * - `CompressionStream('deflate')` + FlateDecode for lossless RGB (default)
 * - JPEG + DCTDecode as a fallback where CompressionStream is unavailable
 *
 * The output keeps the original page size in PDF points, so a 144 DPI bitmap
 * still prints/zooms as an A4 page.
 */
import type { PageSize } from '@/types'

export type PdfImageFilter = 'FlateDecode' | 'DCTDecode'

export interface PdfImage {
  bytes: Uint8Array
  filter: PdfImageFilter
  width: number
  height: number
}

const encoder = new TextEncoder()

function canDeflate(): boolean {
  return typeof CompressionStream !== 'undefined'
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([bytes as unknown as BlobPart])
  const stream = blob.stream().pipeThrough(new CompressionStream('deflate'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

/** Lossless RGB is the default; browsers without CompressionStream fall back to JPEG. */
export async function encodePdfImage(canvas: HTMLCanvasElement, quality = 0.92): Promise<PdfImage> {
  const { width, height } = canvas

  if (canDeflate()) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    const rgba = ctx.getImageData(0, 0, width, height).data

    // Plain RGB rows, no PNG predictor: /Length then matches width * 3 * height
    // exactly, and deflate can still exploit repeated rows across the page.
    const stride = width * 3
    const raw = new Uint8Array(stride * height)
    let out = 0
    for (let y = 0; y < height; y++) {
      let src = y * width * 4
      for (let x = 0; x < width; x++) {
        raw[out++] = rgba[src]!
        raw[out++] = rgba[src + 1]!
        raw[out++] = rgba[src + 2]!
        src += 4
      }
    }
    return { bytes: await deflate(raw), filter: 'FlateDecode', width, height }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('canvas.toBlob() returned null'))),
      'image/jpeg',
      quality,
    )
  })
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    filter: 'DCTDecode',
    width,
    height,
  }
}

function num(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

export class PdfBuilder {
  private readonly pages: { image: PdfImage; page: PageSize }[] = []

  get count(): number {
    return this.pages.length
  }

  add(image: PdfImage, page: PageSize) {
    this.pages.push({ image, page })
  }

  build(): Blob {
    if (!this.pages.length) throw new Error('a PDF needs at least one page')

    const chunks: BlobPart[] = []
    let offset = 0
    const push = (part: string | Uint8Array) => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part
      chunks.push(bytes as unknown as BlobPart)
      offset += bytes.length
    }

    push('%PDF-1.7\n')
    // binary marker, tells tools the file is not plain text
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    const pageIds = this.pages.map((_, index) => 3 + index * 3)
    const contentIds = this.pages.map((_, index) => 4 + index * 3)
    const imageIds = this.pages.map((_, index) => 5 + index * 3)
    const objects = 2 + this.pages.length * 3
    const offsets = new Array<number>(objects + 1).fill(0)

    const object = (id: number, body: string) => {
      offsets[id] = offset
      push(`${id} 0 obj\n`)
      push(body)
      push('\nendobj\n')
    }

    const stream = (id: number, dict: string, data: Uint8Array) => {
      offsets[id] = offset
      push(`${id} 0 obj\n<< ${dict}/Length ${data.length} >>\nstream\n`)
      push(data)
      push('\nendstream\nendobj\n')
    }

    object(1, '<< /Type /Catalog /Pages 2 0 R >>')
    object(
      2,
      `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds
        .map((id) => `${id} 0 R`)
        .join(' ')}] >>`,
    )

    for (let index = 0; index < this.pages.length; index++) {
      const { image, page } = this.pages[index]!
      const w = num(page.width)
      const h = num(page.height)
      const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
      object(
        pageIds[index]!,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageIds[index]} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
      )
      stream(contentIds[index]!, '', encoder.encode(content))
      stream(
        imageIds[index]!,
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} `,
        image.bytes,
      )
    }

    const xrefStart = offset
    let xref = `xref\n0 ${objects + 1}\n0000000000 65535 f \n`
    for (let id = 1; id <= objects; id++) {
      xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
    }
    push(xref)
    push(`trailer\n<< /Size ${objects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

    return new Blob(chunks, { type: 'application/pdf' })
  }
}
