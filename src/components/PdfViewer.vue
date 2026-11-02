<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import {
  addMask,
  doc,
  fitTo,
  masksOf,
  recordChange,
  selectMask,
  snapshotMasks,
  state,
  updateMask,
} from '@/stores/editor'
import { exclusiveRender } from '@/lib/pdf'
import { paintMasks } from '@/lib/mosaic'
import { clamp } from '@/lib/utils'
import type { Mask, MaskShape } from '@/types'

const MIN_SIZE = 0.008
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const scrollEl = ref<HTMLDivElement | null>(null)
const stageEl = ref<HTMLDivElement | null>(null)
const pageCanvas = ref<HTMLCanvasElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)

const pageMasks = computed(() => masksOf(state.page))
const selected = computed<Mask | null>(
  () => pageMasks.value.find((mask) => mask.id === state.selectedId) ?? null,
)
const cssWidth = computed(() => Math.max(1, state.pageSize.width * state.zoom))
const cssHeight = computed(() => Math.max(1, state.pageSize.height * state.zoom))
const interactive = computed(() => state.tool === 'select' && !state.spacePan)
const stageClass = computed(() =>
  interactive.value ? 'cursor-crosshair' : 'cursor-grab',
)

const draft = ref<Rect | null>(null)

let pdfPage: PDFPageProxy | null = null
let loadedPageNumber = 0
let renderTask: RenderTask | null = null
let token = 0
let frame = 0
let resizeObserver: ResizeObserver | null = null

/* ---------------------------------------------------------------- */
/* rendering                                                         */
/* ---------------------------------------------------------------- */

function deviceRatio() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = state.pageSize.width * state.zoom * dpr
  const h = state.pageSize.height * state.zoom * dpr
  const maxPixels = 30_000_000
  if (w * h <= maxPixels) return dpr
  return Math.max(0.4, dpr * Math.sqrt(maxPixels / (w * h)))
}

async function ensurePage(): Promise<PDFPageProxy | null> {
  const current = doc.value
  if (!current) return null
  if (pdfPage && loadedPageNumber === state.page) return pdfPage
  const next = await current.getPage(state.page)
  if (!doc.value) return null
  pdfPage = next
  loadedPageNumber = next.pageNumber
  const viewport = next.getViewport({ scale: 1 })
  state.pageSize = { width: viewport.width, height: viewport.height }
  return next
}

function drawMasks() {
  const canvas = maskCanvas.value
  const source = pageCanvas.value
  if (!canvas || !source || !source.width || !source.height) return
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width
    canvas.height = source.height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const masks = pageMasks.value
  if (!masks.length) return
  paintMasks(ctx, source, masks, canvas.width / state.pageSize.width)
}

async function renderPage() {
  const canvas = pageCanvas.value
  const overlay = maskCanvas.value
  if (!canvas || !overlay || !doc.value) return

  const local = ++token
  const page = await ensurePage()
  if (!page || local !== token) return

  const scale = state.zoom * deviceRatio()
  const viewport = page.getViewport({ scale })
  const width = Math.max(1, Math.floor(viewport.width))
  const height = Math.max(1, Math.floor(viewport.height))

  canvas.width = width
  canvas.height = height
  overlay.width = width
  overlay.height = height

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  if (renderTask) {
    try {
      renderTask.cancel()
    } catch {
      /* ignore */
    }
    renderTask = null
  }

  await exclusiveRender(async () => {
    if (local !== token) return
    const task = page.render({ canvas, viewport })
    renderTask = task
    try {
      await task.promise
    } catch (error) {
      if ((error as { name?: string })?.name !== 'RenderingCancelledException') {
        console.error('[viewer] render failed', error)
      }
    } finally {
      if (renderTask === task) renderTask = null
    }
  })

  if (local !== token) return
  drawMasks()
}

function schedule() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0
    void renderPage()
  })
}

function clearCanvases() {
  for (const canvas of [pageCanvas.value, maskCanvas.value]) {
    if (!canvas) continue
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    canvas.width = 1
    canvas.height = 1
  }
}

/* ---------------------------------------------------------------- */
/* layout                                                            */
/* ---------------------------------------------------------------- */

function measure() {
  const el = scrollEl.value
  if (!el) return false
  const width = el.clientWidth
  const height = el.clientHeight
  const changed =
    Math.abs(width - state.containerWidth) >= 1 || Math.abs(height - state.containerHeight) >= 1
  state.containerWidth = width
  state.containerHeight = height
  return changed
}

function onResize() {
  if (!measure()) return
  if (state.fitMode !== 'custom' && doc.value) fitTo(state.fitMode)
}

onMounted(async () => {
  measure()
  const el = scrollEl.value
  if (el) {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(el)
    el.addEventListener('wheel', onWheel, { passive: false })
  }
  if (doc.value) {
    await ensurePage()
    if (state.fitMode !== 'custom') fitTo(state.fitMode)
    schedule()
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  scrollEl.value?.removeEventListener('wheel', onWheel)
  if (frame) cancelAnimationFrame(frame)
  token++
  if (renderTask) {
    try {
      renderTask.cancel()
    } catch {
      /* ignore */
    }
  }
  detachDrag()
  detachPan()
})

watch(
  () => doc.value,
  async (value) => {
    pdfPage = null
    loadedPageNumber = 0
    token++
    if (!value) {
      clearCanvases()
      return
    }
    await ensurePage()
    if (state.fitMode !== 'custom') fitTo(state.fitMode)
    schedule()
  },
)

watch(
  () => state.page,
  async () => {
    pdfPage = null
    loadedPageNumber = 0
    const el = scrollEl.value
    if (el) {
      el.scrollTop = 0
      el.scrollLeft = 0
    }
    await ensurePage()
    if (state.fitMode !== 'custom') fitTo(state.fitMode)
    schedule()
  },
)

watch(
  () => state.zoom,
  () => schedule(),
)

watch(
  () => state.masks,
  () => drawMasks(),
  { deep: true },
)

/* ---------------------------------------------------------------- */
/* zoom with ctrl/cmd + wheel                                        */
/* ---------------------------------------------------------------- */

async function onWheel(event: WheelEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  const el = scrollEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const pointX = event.clientX - rect.left
  const pointY = event.clientY - rect.top
  const before = { left: el.scrollLeft, top: el.scrollTop, zoom: state.zoom }
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  const next = clamp(state.zoom * factor, 0.1, 8)
  if (next === state.zoom) return
  state.zoom = next
  state.fitMode = 'custom'
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const ratio = state.zoom / before.zoom
  el.scrollLeft = (before.left + pointX) * ratio - pointX
  el.scrollTop = (before.top + pointY) * ratio - pointY
}

/* ---------------------------------------------------------------- */
/* panning                                                           */
/* ---------------------------------------------------------------- */

let pan: { x: number; y: number; left: number; top: number } | null = null

function onPanMove(event: PointerEvent) {
  const el = scrollEl.value
  if (!pan || !el) return
  el.scrollLeft = pan.left - (event.clientX - pan.x)
  el.scrollTop = pan.top - (event.clientY - pan.y)
}

function onPanEnd() {
  pan = null
  detachPan()
}

function detachPan() {
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', onPanEnd)
  window.removeEventListener('pointercancel', onPanEnd)
}

function onScrollPointerDown(event: PointerEvent) {
  const el = scrollEl.value
  if (!el) return
  // touch already scrolls natively; only pointers need the manual pan
  if (event.pointerType === 'touch') return
  const wantsPan = state.tool === 'pan' || state.spacePan || event.button === 1
  if (!wantsPan) return
  event.preventDefault()
  pan = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop }
  window.addEventListener('pointermove', onPanMove)
  window.addEventListener('pointerup', onPanEnd)
  window.addEventListener('pointercancel', onPanEnd)
}

/* ---------------------------------------------------------------- */
/* mask editing                                                      */
/* ---------------------------------------------------------------- */

interface DragState {
  mode: 'create' | 'move' | 'resize'
  start: { x: number; y: number }
  origin: Rect
  id: string
  handle: Handle | null
  shape: MaskShape
  before: Mask[]
  changed: boolean
}

let drag: DragState | null = null

function normalize(event: PointerEvent) {
  const el = stageEl.value!
  const rect = el.getBoundingClientRect()
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
}

function hitTest(x: number, y: number): Mask | null {
  const list = pageMasks.value
  for (let index = list.length - 1; index >= 0; index--) {
    const mask = list[index]!
    if (x >= mask.x && x <= mask.x + mask.w && y >= mask.y && y <= mask.y + mask.h) return mask
  }
  return null
}

function attachDrag() {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function detachDrag() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onStagePointerDown(event: PointerEvent) {
  if (!interactive.value || !doc.value) return
  if (event.button !== 0) return
  event.preventDefault()

  const point = normalize(event)
  const hit = hitTest(point.x, point.y)
  if (hit) {
    selectMask(hit.id)
    drag = {
      mode: 'move',
      start: point,
      origin: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
      id: hit.id,
      handle: null,
      shape: hit.shape,
      before: snapshotMasks(),
      changed: false,
    }
  } else {
    selectMask(null)
    drag = {
      mode: 'create',
      start: point,
      origin: { x: point.x, y: point.y, w: 0, h: 0 },
      id: '',
      handle: null,
      shape: state.defaultShape,
      before: snapshotMasks(),
      changed: false,
    }
    draft.value = { x: point.x, y: point.y, w: 0, h: 0 }
  }
  attachDrag()
}

function startResize(event: PointerEvent, handle: Handle) {
  const mask = selected.value
  if (!mask || event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  drag = {
    mode: 'resize',
    start: normalize(event),
    origin: { x: mask.x, y: mask.y, w: mask.w, h: mask.h },
    id: mask.id,
    handle,
    shape: mask.shape,
    before: snapshotMasks(),
    changed: false,
  }
  attachDrag()
}

function onPointerMove(event: PointerEvent) {
  const current = drag
  if (!current) return
  const point = normalize(event)

  if (current.mode === 'create') {
    const dx = point.x - current.start.x
    const dy = point.y - current.start.y
    draft.value = squareFromAnchor(
      current.start.x,
      current.start.y,
      dx * state.pageSize.width,
      dy * state.pageSize.height,
      dx,
      dy,
      current.shape,
    )
    return
  }

  const dx = point.x - current.start.x
  const dy = point.y - current.start.y
  if (!current.changed && Math.abs(dx) + Math.abs(dy) < 0.0015) return
  current.changed = true

  if (current.mode === 'move') {
    updateMask(current.id, {
      x: clamp(current.origin.x + dx, 0, 1 - current.origin.w),
      y: clamp(current.origin.y + dy, 0, 1 - current.origin.h),
    })
    return
  }

  const handle = current.handle!
  const origin = current.origin
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.w
  let bottom = origin.y + origin.h

  if (handle.includes('w')) left = clamp(origin.x + dx, 0, right - MIN_SIZE)
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_SIZE, 1)
  if (handle.includes('n')) top = clamp(origin.y + dy, 0, bottom - MIN_SIZE)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_SIZE, 1)

  updateMask(
    current.id,
    squareFromResize(handle, left, top, right, bottom, current.shape),
  )
}

function onPointerUp() {
  const current = drag
  drag = null
  detachDrag()
  if (!current) return

  if (current.mode === 'create') {
    const rect = draft.value
    draft.value = null
    if (rect && rect.w >= MIN_SIZE * 1.4 && rect.h >= MIN_SIZE * 1.4) {
      const mask = addMask({ page: state.page, ...rect, shape: current.shape })
      recordChange(current.before)
      selectMask(mask.id)
    }
    return
  }

  if (current.changed) recordChange(current.before)
}

/* ---------------------------------------------------------------- */
/* template helpers                                                  */
/* ---------------------------------------------------------------- */

function rectStyle(rect: Rect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  }
}

function shapeClass(shape: MaskShape) {
  return shape === 'circle' ? 'rounded-full' : ''
}

/** points → normalized units on each axis */
const K = () => state.pageSize.width / state.pageSize.height

/**
 * Square/circle masks keep the same size in PDF points on both axes, so they
 * stay visually square whatever the page aspect ratio is.
 */
function squareFromAnchor(
  anchorX: number,
  anchorY: number,
  widthPts: number,
  heightPts: number,
  dirX: number,
  dirY: number,
  shape: MaskShape,
): Rect {
  const pageW = state.pageSize.width
  const pageH = state.pageSize.height

  if (shape === 'rect') {
    const w = Math.abs(widthPts) / pageW
    const h = Math.abs(heightPts) / pageH
    return { x: dirX >= 0 ? anchorX : anchorX - w, y: dirY >= 0 ? anchorY : anchorY - h, w, h }
  }

  const roomX = Math.abs(dirX >= 0 ? 1 - anchorX : anchorX) * pageW
  const roomY = Math.abs(dirY >= 0 ? 1 - anchorY : anchorY) * pageH
  const side = Math.max(0, Math.min(Math.max(Math.abs(widthPts), Math.abs(heightPts)), roomX, roomY))
  const w = side / pageW
  const h = side / pageH
  return { x: dirX >= 0 ? anchorX : anchorX - w, y: dirY >= 0 ? anchorY : anchorY - h, w, h }
}

/** Grow a resized box into a square/circle while keeping the untouched edges fixed. */
function squareFromResize(
  handle: Handle,
  left: number,
  top: number,
  right: number,
  bottom: number,
  shape: MaskShape,
): Rect {
  if (shape === 'rect') return { x: left, y: top, w: right - left, h: bottom - top }

  const pageW = state.pageSize.width
  const pageH = state.pageSize.height
  const k = K()

  const anchorX = handle.includes('w') ? right : handle.includes('e') ? left : (left + right) / 2
  const anchorY = handle.includes('n') ? bottom : handle.includes('s') ? top : (top + bottom) / 2

  let sidePts
  if (handle === 'n' || handle === 's') sidePts = (bottom - top) * pageH
  else if (handle === 'e' || handle === 'w') sidePts = (right - left) * pageW
  else sidePts = Math.max((right - left) * pageW, (bottom - top) * pageH)

  sidePts = Math.max(sidePts, MIN_SIZE * Math.max(pageW, pageH))

  const roomX = handle.includes('w')
    ? anchorX
    : handle.includes('e')
      ? 1 - anchorX
      : 2 * Math.min(anchorX, 1 - anchorX)
  const roomY = handle.includes('n')
    ? anchorY
    : handle.includes('s')
      ? 1 - anchorY
      : 2 * Math.min(anchorY, 1 - anchorY)

  // h = w * k, so the width is bounded by both axes of available room
  const maxW = Math.max(0, Math.min(roomX, roomY / k))
  const w = Math.min(sidePts / pageW, maxW)
  const h = w * k

  return {
    x: handle.includes('w') ? anchorX - w : handle.includes('e') ? anchorX : anchorX - w / 2,
    y: handle.includes('n') ? anchorY - h : handle.includes('s') ? anchorY : anchorY - h / 2,
    w,
    h,
  }
}

const handleClass: Record<Handle, string> = {
  nw: '-top-1.5 -left-1.5 cursor-nwse-resize',
  n: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
  ne: '-top-1.5 -right-1.5 cursor-nesw-resize',
  e: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
  s: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  w: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize',
}
</script>

<template>
  <div
    ref="scrollEl"
    class="stage-bg scroll-thin relative min-h-0 flex-1 overflow-auto"
    @pointerdown="onScrollPointerDown"
  >
    <div class="flex min-h-full w-max min-w-full items-start justify-center p-6 sm:p-8">
      <div
        ref="stageEl"
        data-testid="page-stage"
        class="page-shadow relative shrink-0 bg-white select-none"
        :class="[stageClass, interactive ? 'touch-none' : 'touch-auto']"
        :style="{ width: `${cssWidth}px`, height: `${cssHeight}px` }"
        @pointerdown="onStagePointerDown"
      >
        <canvas ref="pageCanvas" data-testid="page-canvas" class="block h-full w-full" />
        <canvas ref="maskCanvas" data-testid="mask-canvas" class="pointer-events-none absolute inset-0 block h-full w-full" />

        <div class="pointer-events-none absolute inset-0">
          <div
            v-for="mask in pageMasks"
            :key="mask.id"
            class="absolute"
            :class="[
              mask.id === state.selectedId
                ? 'outline-2 outline-primary'
                : 'outline outline-foreground/25',
              shapeClass(mask.shape),
            ]"
            :style="rectStyle(mask)"
          />

          <div
            v-if="selected"
            class="absolute border-2 border-primary"
            :class="shapeClass(selected.shape)"
            :style="rectStyle(selected)"
          >
            <span
              v-for="handle in HANDLES"
              :key="handle"
              class="absolute size-2.5 rounded-[2px] border border-primary bg-white shadow-sm"
              :class="handleClass[handle]"
              :style="{ pointerEvents: interactive ? 'auto' : 'none' }"
              @pointerdown="startResize($event, handle)"
            />
          </div>

          <div
            v-if="draft"
            class="absolute border-2 border-dashed border-primary bg-primary/10"
            :class="shapeClass(state.defaultShape)"
            :style="rectStyle(draft)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
