import type { PageSize } from '@/types'
import type { DocPage, SourceDoc } from './source'

export class ImageOpenError extends Error {
  constructor(
    readonly fileName: string,
    readonly cause?: unknown,
  ) {
    super(`cannot decode ${fileName}`)
    this.name = 'ImageOpenError'
  }
}

interface DecodedImage {
  image: HTMLImageElement
  size: PageSize
}

class ImagePage implements DocPage {
  constructor(
    private readonly doc: ImageDocument,
    readonly pageNumber: number,
    private readonly decoded: DecodedImage,
  ) {}

  get size(): PageSize {
    return this.decoded.size
  }

  async render(canvas: HTMLCanvasElement): Promise<void> {
    this.doc.draw(this.decoded, canvas)
  }

  cancel() {
    /* drawImage is synchronous, nothing to cancel */
  }
}

/**
 * A document made of one image per page. Images are decoded lazily (first use)
 * and kept for the lifetime of the document, so scrubbing pages stays instant.
 *
 * A source pixel maps to one point, which makes "72 dpi" export mean native
 * resolution and keeps the mask block size in the same unit as for PDFs.
 */
export class ImageDocument implements SourceDoc {
  readonly kind = 'image'
  readonly numPages: number

  private readonly names: string[]
  private readonly urls: string[]
  private readonly decoded = new Map<number, DecodedImage>()
  private readonly pending = new Map<number, Promise<DecodedImage>>()
  private destroyed = false

  constructor(files: File[]) {
    this.numPages = files.length
    this.names = files.map((file) => file.name)
    this.urls = files.map((file) => URL.createObjectURL(file))
  }

  pageLabel(pageNumber: number): string | null {
    return this.names[pageNumber - 1] ?? null
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    return (await this.decode(pageNumber)).size
  }

  async getPage(pageNumber: number): Promise<DocPage> {
    return new ImagePage(this, pageNumber, await this.decode(pageNumber))
  }

  draw(decoded: DecodedImage, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(decoded.image, 0, 0, canvas.width, canvas.height)
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    this.decoded.clear()
    this.pending.clear()
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.length = 0
  }

  private decode(pageNumber: number): Promise<DecodedImage> {
    const index = pageNumber - 1
    if (!Number.isInteger(index) || index < 0 || index >= this.numPages) {
      return Promise.reject(new RangeError(`page ${pageNumber} is out of range`))
    }
    const cached = this.decoded.get(index)
    if (cached) return Promise.resolve(cached)
    const running = this.pending.get(index)
    if (running) return running

    const job = this.load(index).then(
      (result) => {
        this.pending.delete(index)
        if (this.destroyed) throw new Error('document closed')
        this.decoded.set(index, result)
        return result
      },
      (error) => {
        this.pending.delete(index)
        throw error
      },
    )
    this.pending.set(index, job)
    return job
  }

  private async load(index: number): Promise<DecodedImage> {
    const image = new Image()
    image.decoding = 'async'
    image.src = this.urls[index]!

    try {
      await image.decode()
    } catch (error) {
      // decode() is missing / stricter than the <img> loader in some browsers
      if (!image.complete || image.naturalWidth === 0) {
        throw new ImageOpenError(this.names[index] ?? '', error)
      }
    }

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new ImageOpenError(this.names[index] ?? '')
    }

    return {
      image,
      size: { width: image.naturalWidth, height: image.naturalHeight },
    }
  }
}

/** Validate up front so a broken file fails while the loading overlay is still up. */
export async function loadImages(files: File[]): Promise<SourceDoc> {
  if (!files.length) throw new ImageOpenError('')
  const doc = new ImageDocument(files)
  try {
    // decode every page now — a bad file should surface as an error, not as an
    // empty page later — but one at a time so a big batch does not decode all
    // bitmaps into memory at once
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      await doc.getPageSize(pageNumber)
    }
    return doc
  } catch (error) {
    await doc.destroy()
    throw error
  }
}
