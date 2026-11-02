export type MaskStyle = 'pixelate' | 'blur' | 'solid'

/** Outline of a mask region. `square`/`circle` keep equal width and height in points. */
export type MaskShape = 'rect' | 'square' | 'circle'

/** A masked region, stored in normalized page coordinates (0..1). */
export interface Mask {
  id: string
  page: number
  /** left, top, width, height as fractions of the page box */
  x: number
  y: number
  w: number
  h: number
  style: MaskStyle
  shape: MaskShape
  /** mosaic block size / blur strength, expressed in PDF points (1pt = 1px at 100% zoom) */
  block: number
  color: string
}

export interface PageSize {
  /** width in PDF points */
  width: number
  /** height in PDF points */
  height: number
}

export type ExportFormat = 'png' | 'jpeg'

export type SizeMode = 'px' | 'dpi'

export interface ExportSettings {
  format: ExportFormat
  sizeMode: SizeMode
  width: number
  height: number
  lockRatio: boolean
  dpi: number
  quality: number
}

export type Tool = 'select' | 'pan'

export type Locale = 'zh-CN' | 'zh-TW' | 'en'
