import { reactive, shallowRef, watch } from 'vue'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Locale, Mask, MaskShape, MaskStyle, PageSize, Tool } from '@/types'
import type { MessageKey } from '@/i18n/messages'
import { destroyPdf, loadPdf, getPageSize, PdfOpenError } from '@/lib/pdf'
import { clamp, uid } from '@/lib/utils'

export type FitMode = 'width' | 'page' | 'custom'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

const PREFS_KEY = 'pdf-mask:prefs'

/** touch-first devices start in pan mode so a swipe scrolls instead of drawing */
let preferredTool: Tool = 'select'

interface Preferences {
  locale: Locale
  theme: 'light' | 'dark'
  defaultStyle: MaskStyle
  defaultShape: MaskShape
  defaultBlock: number
  defaultColor: string
}

interface EditorState {
  fileName: string
  fileSize: number
  pageCount: number
  page: number
  zoom: number
  fitMode: FitMode
  tool: Tool
  pageSize: PageSize
  containerWidth: number
  containerHeight: number

  masks: Mask[]
  selectedId: string | null

  defaultStyle: MaskStyle
  defaultShape: MaskShape
  defaultBlock: number
  defaultColor: string

  locale: Locale
  theme: 'light' | 'dark'

  loading: boolean
  loadErrorKey: MessageKey | null
  loadErrorDetail: string

  exportOpen: boolean
  helpOpen: boolean
  exporting: boolean
  spacePan: boolean
  panelOpen: boolean
}

export type { EditorState }

export const state = reactive<EditorState>({
  fileName: '',
  fileSize: 0,
  pageCount: 0,
  page: 1,
  zoom: 1,
  fitMode: 'width',
  tool: 'select',
  pageSize: { width: 595.28, height: 841.89 },
  containerWidth: 0,
  containerHeight: 0,

  masks: [],
  selectedId: null,

  defaultStyle: 'pixelate',
  defaultShape: 'rect',
  defaultBlock: 16,
  defaultColor: '#000000',

  locale: 'zh-CN',
  theme: 'dark',

  loading: false,
  loadErrorKey: null,
  loadErrorDetail: '',

  exportOpen: false,
  helpOpen: false,
  exporting: false,
  spacePan: false,
  panelOpen: false,
})

export const doc = shallowRef<PDFDocumentProxy | null>(null)

const past: Mask[][] = []
const future: Mask[][] = []

export const historyState = reactive({ canUndo: false, canRedo: false, count: 0 })

function syncHistory() {
  historyState.canUndo = past.length > 0
  historyState.canRedo = future.length > 0
  historyState.count = past.length
}

/* ------------------------------------------------------------------ */
/* preferences                                                         */
/* ------------------------------------------------------------------ */

function detectLocale(): Locale {
  const nav = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase()
  if (nav.startsWith('zh-hant') || nav.startsWith('zh-tw') || nav.startsWith('zh-hk') || nav.includes('hant')) {
    return 'zh-TW'
  }
  if (nav.startsWith('zh')) return 'zh-CN'
  return 'en'
}

export function applyTheme() {
  document.documentElement.classList.toggle('dark', state.theme === 'dark')
  document.documentElement.style.colorScheme = state.theme
}

export function setTheme(theme: 'light' | 'dark') {
  state.theme = theme
  applyTheme()
}

export function setLocale(locale: Locale) {
  state.locale = locale
  document.documentElement.lang = locale
}

export function initPreferences() {
  let saved: Partial<Preferences> | null = null
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) saved = JSON.parse(raw) as Partial<Preferences>
  } catch {
    saved = null
  }

  state.locale = saved?.locale ?? detectLocale()
  state.theme =
    saved?.theme ??
    (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  if (saved?.defaultStyle) state.defaultStyle = saved.defaultStyle
  if (saved?.defaultShape) state.defaultShape = saved.defaultShape
  if (Number.isFinite(saved?.defaultBlock)) state.defaultBlock = saved!.defaultBlock as number
  if (saved?.defaultColor) state.defaultColor = saved.defaultColor

  applyTheme()
  document.documentElement.lang = state.locale

  // touch devices scroll by default; drawing is one tap away in the toolbar
  if (window.matchMedia?.('(pointer: coarse)').matches) preferredTool = 'pan'
  state.tool = preferredTool

  watch(
    () => [
      state.locale,
      state.theme,
      state.defaultStyle,
      state.defaultShape,
      state.defaultBlock,
      state.defaultColor,
    ],
    () => {
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({
            locale: state.locale,
            theme: state.theme,
            defaultStyle: state.defaultStyle,
            defaultShape: state.defaultShape,
            defaultBlock: state.defaultBlock,
            defaultColor: state.defaultColor,
          } satisfies Preferences),
        )
      } catch {
        /* storage may be disabled */
      }
    },
  )
}

/* ------------------------------------------------------------------ */
/* document lifecycle                                                  */
/* ------------------------------------------------------------------ */

function resetEditor() {
  state.page = 1
  state.zoom = 1
  state.fitMode = 'width'
  state.tool = preferredTool
  state.masks = []
  state.selectedId = null
  past.length = 0
  future.length = 0
  syncHistory()
}

function setLoadError(key: MessageKey, detail = '') {
  state.loadErrorKey = key
  state.loadErrorDetail = detail
}

export async function openPdfFile(file: File): Promise<boolean> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) {
    setLoadError('drop.badFile')
    return false
  }

  state.loading = true
  state.loadErrorKey = null
  state.loadErrorDetail = ''

  const previous = doc.value
  doc.value = null
  if (previous) {
    await destroyPdf(previous)
  }

  try {
    const buffer = await file.arrayBuffer()
    const pdf = await loadPdf(buffer)
    doc.value = pdf
    state.fileName = file.name
    state.fileSize = file.size
    state.pageCount = pdf.numPages
    resetEditor()
    return true
  } catch (error) {
    if (error instanceof PdfOpenError) {
      if (error.kind === 'password') setLoadError('pdf.password')
      else if (error.kind === 'invalid') {
        setLoadError(error.message === 'empty' ? 'pdf.empty' : 'pdf.invalid')
      } else setLoadError('pdf.unknown', error.message)
    } else {
      setLoadError('pdf.unknown', error instanceof Error ? error.message : String(error))
    }
    state.pageCount = 0
    return false
  } finally {
    state.loading = false
  }
}

export async function openSamplePdf(): Promise<boolean> {
  const url = `${import.meta.env.BASE_URL}sample.pdf`
  state.loading = true
  state.loadErrorKey = null
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const file = new File([blob], 'sample.pdf', { type: 'application/pdf' })
    state.loading = false
    return await openPdfFile(file)
  } catch (error) {
    state.loading = false
    setLoadError('pdf.unknown', error instanceof Error ? error.message : String(error))
    return false
  }
}

export async function closePdf() {
  const previous = doc.value
  doc.value = null
  state.fileName = ''
  state.fileSize = 0
  state.pageCount = 0
  resetEditor()
  state.loadErrorKey = null
  if (previous) {
    await destroyPdf(previous)
  }
}

/* ------------------------------------------------------------------ */
/* navigation & zoom                                                   */
/* ------------------------------------------------------------------ */

export function setPage(page: number) {
  if (!state.pageCount) return
  state.page = clamp(Math.round(page), 1, state.pageCount)
}

export function nextPage() {
  setPage(state.page + 1)
}

export function prevPage() {
  setPage(state.page - 1)
}

export function setZoom(zoom: number, fitMode: FitMode = 'custom') {
  state.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  state.fitMode = fitMode
}

export function zoomBy(factor: number) {
  setZoom(state.zoom * factor)
}

export function fitTo(mode: 'width' | 'page') {
  const padX = 56
  const padY = 56
  const availableW = Math.max(140, state.containerWidth - padX)
  const availableH = Math.max(140, state.containerHeight - padY)
  const { width, height } = state.pageSize
  const scale =
    mode === 'width'
      ? availableW / width
      : Math.min(availableW / width, availableH / height)
  state.zoom = clamp(scale, MIN_ZOOM, MAX_ZOOM)
  state.fitMode = mode
}

export function zoomToActual() {
  setZoom(1, 'custom')
}

export function setTool(tool: Tool) {
  state.tool = tool
}

/* ------------------------------------------------------------------ */
/* masks                                                               */
/* ------------------------------------------------------------------ */

export function masksOf(page: number): Mask[] {
  return state.masks.filter((mask) => mask.page === page)
}

export function maskCountOf(page: number): number {
  let count = 0
  for (const mask of state.masks) if (mask.page === page) count++
  return count
}

export function totalMaskCount(): number {
  return state.masks.length
}

export const selectedMask = (): Mask | null =>
  state.masks.find((mask) => mask.id === state.selectedId) ?? null

export function selectMask(id: string | null) {
  state.selectedId = id
}

export function updateMask(id: string, patch: Partial<Omit<Mask, 'id' | 'page'>>) {
  const mask = state.masks.find((item) => item.id === id)
  if (!mask) return
  Object.assign(mask, patch)
}

/**
 * Switch a mask between rectangle / square / circle. Square and circle masks are
 * square in PDF points, so the stored box is snapped around the current centre.
 */
export function setMaskShape(id: string, shape: MaskShape) {
  const mask = state.masks.find((item) => item.id === id)
  if (!mask) return
  mask.shape = shape
  if (shape === 'rect') return

  const pageW = state.pageSize.width
  const pageH = state.pageSize.height
  const centerX = mask.x + mask.w / 2
  const centerY = mask.y + mask.h / 2
  const side = Math.min(Math.max(mask.w * pageW, mask.h * pageH), pageW, pageH)
  const w = side / pageW
  const h = side / pageH

  mask.w = w
  mask.h = h
  mask.x = clamp(centerX - w / 2, 0, 1 - w)
  mask.y = clamp(centerY - h / 2, 0, 1 - h)
}

export interface NewMaskInput {
  page: number
  x: number
  y: number
  w: number
  h: number
  style?: MaskStyle
  shape?: MaskShape
  block?: number
  color?: string
}

export function addMask(input: NewMaskInput): Mask {
  const mask: Mask = {
    id: uid(),
    page: input.page,
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.h,
    style: input.style ?? state.defaultStyle,
    shape: input.shape ?? state.defaultShape,
    block: input.block ?? state.defaultBlock,
    color: input.color ?? state.defaultColor,
  }
  state.masks.push(mask)
  state.selectedId = mask.id
  return mask
}

export function removeMask(id: string) {
  const index = state.masks.findIndex((mask) => mask.id === id)
  if (index === -1) return
  state.masks.splice(index, 1)
  if (state.selectedId === id) state.selectedId = null
}

export function clearPageMasks(page: number) {
  state.masks = state.masks.filter((mask) => mask.page !== page)
  if (!state.masks.some((mask) => mask.id === state.selectedId)) state.selectedId = null
}

export function clearAllMasks() {
  state.masks = []
  state.selectedId = null
}

/** Mask edits that should be undoable as a single step. */
export function deleteMask(id: string) {
  const before = snapshotMasks()
  removeMask(id)
  recordChange(before)
}

export function deleteSelectedMask() {
  if (state.selectedId) deleteMask(state.selectedId)
}

export function clearPage(page: number) {
  const before = snapshotMasks()
  clearPageMasks(page)
  recordChange(before)
}

export function clearAll() {
  const before = snapshotMasks()
  clearAllMasks()
  recordChange(before)
}

/* ------------------------------------------------------------------ */
/* history                                                             */
/* ------------------------------------------------------------------ */

export function snapshotMasks(): Mask[] {
  return state.masks.map((mask) => ({ ...mask }))
}

function sameMasks(a: Mask[], b: Mask[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (
      x.id !== y.id ||
      x.page !== y.page ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.w !== y.w ||
      x.h !== y.h ||
      x.style !== y.style ||
      x.block !== y.block ||
      x.color !== y.color
    ) {
      return false
    }
  }
  return true
}

/** Remember the state *before* a mutation so it can be undone. */
export function recordChange(before: Mask[], coalesceKey?: string) {
  if (sameMasks(before, state.masks)) return
  const now = Date.now()
  if (coalesceKey && coalesceKey === lastRecord.key && now - lastRecord.at < 700) {
    // part of the same continuous drag: keep the original snapshot
    lastRecord.at = now
    future.length = 0
    syncHistory()
    return
  }
  past.push(before)
  if (past.length > 120) past.shift()
  future.length = 0
  lastRecord.key = coalesceKey ?? ''
  lastRecord.at = now
  syncHistory()
}

const lastRecord = { key: '', at: 0 }

function applyMasks(masks: Mask[]) {
  state.masks = masks
  if (state.selectedId && !masks.some((mask) => mask.id === state.selectedId)) {
    state.selectedId = null
  }
}

export function undo() {
  const previous = past.pop()
  if (!previous) return
  future.push(snapshotMasks())
  applyMasks(previous)
  syncHistory()
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(snapshotMasks())
  applyMasks(next)
  syncHistory()
}

/* ------------------------------------------------------------------ */
/* misc helpers                                                        */
/* ------------------------------------------------------------------ */

export async function pageSizeFor(page: number): Promise<PageSize> {
  const current = doc.value
  if (!current) return state.pageSize
  return getPageSize(current, page)
}

export function openExportDialog() {
  if (doc.value) state.exportOpen = true
}

export function closeExportDialog() {
  state.exportOpen = false
}

export function openHelp() {
  state.helpOpen = true
}

export function closeHelp() {
  state.helpOpen = false
}
