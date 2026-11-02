import type { PageSize } from '@/types'

/**
 * The editor works against a "source document" instead of a raw PDF, so a set
 * of images can flow through exactly the same viewer, mask and export pipeline.
 */
export type DocKind = 'pdf' | 'image'

/** One renderable page. All geometry is expressed in points (1pt = 1px at 100%). */
export interface DocPage {
  readonly pageNumber: number
  /** page box in points; images map one source pixel to one point */
  readonly size: PageSize
  /** draw the page onto `canvas` at `scale` (scale 1 = 72 dpi) */
  render(canvas: HTMLCanvasElement, scale: number): Promise<void>
  /** abandon an in-flight render; safe to call when nothing is running */
  cancel(): void
}

export interface SourceDoc {
  readonly kind: DocKind
  readonly numPages: number
  getPage(pageNumber: number): Promise<DocPage>
  getPageSize(pageNumber: number): Promise<PageSize>
  /** file name behind a page, when the source has one (images) */
  pageLabel(pageNumber: number): string | null
  destroy(): Promise<void>
}

/**
 * Advertised in the OS picker. `image/*` covers the common cases; explicit
 * extensions keep the dialog friendly on platforms that match by suffix.
 */
export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'jfif',
  'webp',
  'gif',
  'bmp',
  'avif',
  'svg',
  'ico',
  'heic',
  'heif',
] as const

const IMAGE_EXT = new RegExp(`\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i')

export const FILE_ACCEPT = [
  'application/pdf',
  'image/*',
  '.pdf',
  ...IMAGE_EXTENSIONS.map((extension) => `.${extension}`),
].join(',')

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name)
}

/**
 * A drop can mix anything. A PDF wins (it is a whole document already),
 * otherwise every image becomes one page, ordered by name so IMG_2 sorts
 * before IMG_10.
 */
export function selectInputFiles(files: File[]): { pdf: File | null; images: File[] } {
  const pdf = files.find(isPdfFile) ?? null
  const images = files
    .filter(isImageFile)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return { pdf, images }
}
