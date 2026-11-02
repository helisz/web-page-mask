/**
 * Dev-only smoke test, enabled with `?selftest=1` (works together with
 * `?demo=1`). It drives the real store + renderer + exporter and writes a JSON
 * report into the DOM so a headless browser can assert on it.
 */
import {
  addMask,
  doc,
  masksOf,
  recordChange,
  redo,
  removeMask,
  selectMask,
  setMaskShape,
  setZoom,
  snapshotMasks,
  state,
  undo,
} from '@/stores/editor'
import { canvasToBlob, computeExportSize, renderPageBitmap } from '@/lib/export'
import type { PageSize } from '@/types'

interface Step {
  name: string
  pass: boolean
  detail?: unknown
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate: () => boolean, timeout = 15000) {
  const start = performance.now()
  while (performance.now() - start < timeout) {
    if (predicate()) return true
    await wait(60)
  }
  return false
}

function stage(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="page-stage"]')
}

function pageCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('[data-testid="page-canvas"]')
}

function maskCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('[data-testid="mask-canvas"]')
}

function drag(fromX: number, fromY: number, toX: number, toY: number) {
  const element = stage()
  if (!element) throw new Error('stage missing')
  const rect = element.getBoundingClientRect()
  const point = (nx: number, ny: number) => ({
    clientX: rect.left + rect.width * nx,
    clientY: rect.top + rect.height * ny,
  })
  const start = point(fromX, fromY)
  const end = point(toX, toY)
  element.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...start }),
  )
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, ...end }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...end }))
}

function pixelAt(canvas: HTMLCanvasElement, nx: number, ny: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return [0, 0, 0, 0]
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(nx * canvas.width)))
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(ny * canvas.height)))
  const data = ctx.getImageData(x, y, 1, 1).data
  return [data[0]!, data[1]!, data[2]!, data[3]!]
}

function darkRatio(canvas: HTMLCanvasElement, size = 320) {
  const ratio = size / canvas.width
  const temp = document.createElement('canvas')
  temp.width = size
  temp.height = Math.max(1, Math.round(canvas.height * ratio))
  const ctx = temp.getContext('2d')
  if (!ctx) return 0
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, temp.width, temp.height)
  ctx.drawImage(canvas, 0, 0, temp.width, temp.height)
  const data = ctx.getImageData(0, 0, temp.width, temp.height).data
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! < 210 || data[i + 1]! < 210 || data[i + 2]! < 210) dark++
  }
  return dark / (temp.width * temp.height)
}

async function pageOneSize(): Promise<PageSize> {
  const pdf = doc.value
  if (!pdf) throw new Error('no document')
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  return { width: viewport.width, height: viewport.height }
}

export async function runSelfTest(): Promise<void> {
  const steps: Step[] = []
  const errors: string[] = []
  const check = (name: string, pass: boolean, detail?: unknown) => {
    steps.push({ name, pass, detail })
  }

  window.addEventListener('error', (event) => errors.push(String(event.message)))
  window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)))

  const loaded = await waitFor(() => !!doc.value && state.pageCount > 0)
  check('document loaded', loaded, { pages: state.pageCount, name: state.fileName })
  if (!loaded) return finish(steps, errors)

  await waitFor(() => (pageCanvas()?.width ?? 0) > 400, 20000)

  const canvas = pageCanvas()!
  check('page canvas sized', canvas.width > 400, { width: canvas.width, height: canvas.height })

  // the bitmap is drawn a moment after the canvas is resized
  const painted = await waitFor(() => darkRatio(pageCanvas()!) > 0.004, 20000)
  const ratio = darkRatio(canvas)
  check('page content rendered', painted && ratio > 0.004, {
    darkRatio: Number(ratio.toFixed(4)),
  })

  check('fit width zoom applied', state.zoom > 0.2 && state.zoom < 4, {
    zoom: Number(state.zoom.toFixed(3)),
    container: [state.containerWidth, state.containerHeight],
  })

  // --- draw a real selection with pointer events ---------------------
  const before = state.masks.length
  drag(0.12, 0.2, 0.7, 0.26)
  await wait(80)
  const created = state.masks.length - before
  const mask = state.masks[state.masks.length - 1]
  check('drag creates a mask', created === 1 && !!mask, {
    count: state.masks.length,
    rect: mask ? [mask.x, mask.y, mask.w, mask.h].map((v) => Number(v.toFixed(3))) : null,
  })
  check(
    'mask rect matches drag',
    !!mask &&
      Math.abs(mask.x - 0.12) < 0.02 &&
      Math.abs(mask.y - 0.2) < 0.02 &&
      Math.abs(mask.w - 0.58) < 0.03 &&
      Math.abs(mask.h - 0.06) < 0.03,
    mask ? { x: mask.x, y: mask.y, w: mask.w, h: mask.h } : null,
  )

  await wait(120)
  const overlay = maskCanvas()!
  const inside = pixelAt(overlay, 0.4, 0.23)
  const outside = pixelAt(overlay, 0.9, 0.85)
  check('overlay paints inside selection', inside[3] > 0, { inside })
  check('overlay is clear outside', outside[3] === 0, { outside })

  // mohs: pixel comparison between page and composite
  const pageInside = pixelAt(canvas, 0.4, 0.23)
  check(
    'pixelate changes the pixels',
    Math.abs(pageInside[0] - inside[0]) > 2 || inside[3] > 200,
    { page: pageInside, mask: inside },
  )

  // --- history ------------------------------------------------------
  undo()
  await wait(40)
  check('undo removes the mask', state.masks.length === before, { count: state.masks.length })
  redo()
  await wait(40)
  check('redo restores the mask', state.masks.length === before + 1, { count: state.masks.length })

  // --- styles ---------------------------------------------------------
  const target = state.masks[0]!
  const solidBefore = snapshotMasks()
  target.style = 'solid'
  target.color = '#ff0000'
  recordChange(solidBefore)
  await wait(120)
  const solidPixel = pixelAt(maskCanvas()!, 0.4, 0.23)
  check('solid fill uses the chosen color', solidPixel[3] > 200 && solidPixel[0] > 200, {
    pixel: solidPixel,
  })

  const blurBefore = snapshotMasks()
  target.style = 'blur'
  target.block = 12
  recordChange(blurBefore)
  await wait(120)
  check('blur still paints', pixelAt(maskCanvas()!, 0.4, 0.23)[3] > 0, {})

  target.style = 'pixelate'
  target.block = 18
  await wait(60)

  // --- export ---------------------------------------------------------
  const size = await pageOneSize()
  const settings = {
    format: 'png' as const,
    sizeMode: 'dpi' as const,
    width: 0,
    height: 0,
    lockRatio: true,
    dpi: 144,
    quality: 0.92,
  }
  const output = computeExportSize(size, settings)
  check(
    'export size at 144dpi',
    output.width > 1150 && output.width < 1220 && output.height > 1650 && output.height < 1720,
    output,
  )

  const masks = masksOf(1)
  const withMasks = await renderPageBitmap(doc.value!, 1, masks, size, output.width, output.height)
  const withoutMasks = await renderPageBitmap(doc.value!, 1, [], size, output.width, output.height)
  const baked = pixelAt(withMasks, 0.4, 0.23)
  const clean = pixelAt(withoutMasks, 0.4, 0.23)
  const cornerBaked = pixelAt(withMasks, 0.95, 0.95)
  const cornerClean = pixelAt(withoutMasks, 0.95, 0.95)
  check('export bakes the mask', Math.abs(baked[0] - clean[0]) + Math.abs(baked[1] - clean[1]) > 6, {
    baked,
    clean,
  })
  check(
    'export leaves other areas untouched',
    Math.abs(cornerBaked[0] - cornerClean[0]) + Math.abs(cornerBaked[1] - cornerClean[1]) < 3,
    { cornerBaked, cornerClean },
  )
  check('export canvas dimensions', withMasks.width === output.width, {
    width: withMasks.width,
    height: withMasks.height,
  })

  const blob = await canvasToBlob(withMasks, 'image/png')
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
  check('png blob produced', blob.size > 10_000 && isPng, { bytes: blob.size, isPng })

  const jpeg = await canvasToBlob(withMasks, 'image/jpeg', 0.9)
  check('jpeg blob produced', jpeg.size > 5_000, { bytes: jpeg.size })

  // --- shapes ---------------------------------------------------------
  const shapeBefore = snapshotMasks()
  const circleMask = addMask({
    page: 1,
    x: 0.24,
    y: 0.56,
    w: 0.26,
    h: 0.1,
    style: 'solid',
    color: '#ff00ff',
  })
  setMaskShape(circleMask.id, 'circle')
  recordChange(shapeBefore)
  await wait(150)

  const sideDiff = Math.abs(circleMask.w * size.width - circleMask.h * size.height)
  check('circle mask is square in points', sideDiff < 1.5, {
    widthPt: Number((circleMask.w * size.width).toFixed(2)),
    heightPt: Number((circleMask.h * size.height).toFixed(2)),
  })

  const cx = circleMask.x + circleMask.w / 2
  const cy = circleMask.y + circleMask.h / 2
  const circleOverlay = maskCanvas()!
  const circleCenter = pixelAt(circleOverlay, cx, cy)
  const circleCorner = pixelAt(circleOverlay, circleMask.x + circleMask.w * 0.02, circleMask.y + circleMask.h * 0.02)
  check('circle overlay fills the centre', circleCenter[3] > 200 && circleCenter[0] > 200, {
    pixel: circleCenter,
  })
  check('circle overlay leaves the corners clear', circleCorner[3] === 0, { pixel: circleCorner })

  // switching back to rectangle must not clip the corners
  const rectBefore = snapshotMasks()
  setMaskShape(circleMask.id, 'rect')
  recordChange(rectBefore)
  await wait(120)
  const rectCorner = pixelAt(maskCanvas()!, circleMask.x + circleMask.w * 0.02, circleMask.y + circleMask.h * 0.02)
  check('rectangle shape fills the corners again', rectCorner[3] > 200, { pixel: rectCorner })

  const squareBefore = snapshotMasks()
  setMaskShape(circleMask.id, 'square')
  recordChange(squareBefore)
  await wait(120)
  const squareSideDiff = Math.abs(circleMask.w * size.width - circleMask.h * size.height)
  check('square mask keeps equal point size', squareSideDiff < 1.5, {
    diff: Number(squareSideDiff.toFixed(2)),
  })

  // export honours the circle (switch back before rendering)
  setMaskShape(circleMask.id, 'circle')
  await wait(120)
  const circular = await renderPageBitmap(
    doc.value!,
    1,
    [circleMask],
    size,
    output.width,
    output.height,
  )
  const cleanPage = await renderPageBitmap(doc.value!, 1, [], size, output.width, output.height)
  const exportedCenter = pixelAt(circular, circleMask.x + circleMask.w / 2, circleMask.y + circleMask.h / 2)
  const exportedCorner = pixelAt(circular, circleMask.x + circleMask.w * 0.02, circleMask.y + circleMask.h * 0.02)
  const cleanCorner = pixelAt(cleanPage, circleMask.x + circleMask.w * 0.02, circleMask.y + circleMask.h * 0.02)
  check('export paints inside the circle', exportedCenter[0] > 200 && exportedCenter[1] < 80, {
    pixel: exportedCenter,
  })
  check(
    'export leaves the circle corners untouched',
    Math.abs(exportedCorner[0] - cleanCorner[0]) + Math.abs(exportedCorner[1] - cleanCorner[1]) < 4,
    { exportedCorner, cleanCorner },
  )

  removeMask(circleMask.id)
  selectMask(target.id)
  await wait(120)

  // --- layout ---------------------------------------------------------
  setZoom(state.zoom)
  const panel = document.querySelector('aside.absolute, aside')
  check('panel mounted', !!panel, { html: panel ? panel.className.slice(0, 60) : null })
  check('no runtime errors', errors.length === 0, errors)

  selectMask(null)
  finish(steps, errors)
}

function finish(steps: Step[], errors: string[]) {
  const failed = steps.filter((step) => !step.pass).map((step) => step.name)
  const report = {
    ok: failed.length === 0 && errors.length === 0,
    failed,
    errors,
    steps,
    env: {
      dpr: window.devicePixelRatio,
      viewport: [window.innerWidth, window.innerHeight],
      userAgent: navigator.userAgent.slice(0, 80),
    },
  }
  const pre = document.createElement('pre')
  pre.id = 'selftest-report'
  pre.textContent = JSON.stringify(report)
  pre.style.display = 'none'
  document.body.appendChild(pre)
  document.title = report.ok ? 'SELFTEST PASS' : 'SELFTEST FAIL'
  ;(window as unknown as Record<string, unknown>).__SELFTEST__ = report
}
