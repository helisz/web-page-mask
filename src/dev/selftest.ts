/**
 * Dev-only smoke test, enabled with `?selftest=1` (works together with
 * `?demo=1`). It drives the real store + renderer + exporter and writes a JSON
 * report into the DOM so a headless browser can assert on it.
 */
import {
  addMask,
  doc,
  masksOf,
  openDocument,
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
import { getDocument } from 'pdfjs-dist'
import { canvasToBlob, computeExportSize, renderPageBitmap } from '@/lib/export'
import { encodePdfImage, PdfBuilder } from '@/lib/pdfExport'
import type { PageSize } from '@/types'

interface Step {
  name: string
  pass: boolean
  detail?: unknown
}

async function inflateBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
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
  const source = doc.value
  if (!source) throw new Error('no document')
  return source.getPageSize(1)
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
  const withMasks = await renderPageBitmap(doc.value!, 1, masks, output.width, output.height)
  const withoutMasks = await renderPageBitmap(doc.value!, 1, [], output.width, output.height)
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
    output.width,
    output.height,
  )
  const cleanPage = await renderPageBitmap(doc.value!, 1, [], output.width, output.height)
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

  // --- pdf export -----------------------------------------------------
  const firstSize = await doc.value!.getPageSize(1)
  const pdfTarget = computeExportSize(firstSize, { ...settings, format: 'pdf', dpi: 96 })
  const builder = new PdfBuilder()
  const pdfSources: HTMLCanvasElement[] = []
  const pdfImages = []
  for (const pageNumber of [1, 2]) {
    const pageSize = await doc.value!.getPageSize(pageNumber)
    const bitmap = await renderPageBitmap(
      doc.value!,
      pageNumber,
      masksOf(pageNumber),
      pdfTarget.width,
      pdfTarget.height,
    )
    const encoded = await encodePdfImage(bitmap)
    pdfImages.push(encoded)
    builder.add(encoded, pageSize)
    pdfSources.push(bitmap)
  }
  const pdfBlob = builder.build()
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
  const pdfText = new TextDecoder('latin1').decode(pdfBytes)
  check(
    'pdf blob produced',
    pdfBytes[0] === 0x25 &&
      pdfText.startsWith('%PDF-1.7') &&
      pdfText.trimEnd().endsWith('%%EOF') &&
      pdfBlob.type === 'application/pdf',
    { bytes: pdfBlob.size, type: pdfBlob.type },
  )
  check(
    'pdf holds one page and one image per page',
    (pdfText.match(/\/Type \/Page\b/g) ?? []).length === 2 &&
      (pdfText.match(/\/Subtype \/Image/g) ?? []).length === 2 &&
      (pdfText.match(/\/Filter \/FlateDecode/g) ?? []).length === 2,
    {
      pages: (pdfText.match(/\/Type \/Page\b/g) ?? []).length,
      images: (pdfText.match(/\/Subtype \/Image/g) ?? []).length,
    },
  )
  check(
    'pdf image streams carry no stray predictor data',
    !/\/DecodeParms/.test(pdfText) && !/\/Predictor/.test(pdfText),
    { headers: (pdfText.match(/\/DecodeParms[^\n]*/g) ?? []).slice(0, 2) },
  )

  // the embedded stream must decode back to exactly the exported bitmap,
  // otherwise every row shifts and the page looks sheared
  const encodedFirst = pdfImages[0]!
  const inflated = await inflateBytes(encodedFirst.bytes)
  const stride = encodedFirst.width * 3
  const expected = stride * encodedFirst.height
  const sourceCtx = pdfSources[0]!.getContext('2d')!
  const sourceData = sourceCtx.getImageData(0, 0, encodedFirst.width, encodedFirst.height).data

  let mismatch = 0
  let worstChannelDiff = 0
  for (let y = 0; y < encodedFirst.height; y += 3) {
    const base = y * stride
    for (let x = 0; x < encodedFirst.width; x += 5) {
      const src = (y * encodedFirst.width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        const diff = Math.abs(inflated[base + x * 3 + channel]! - sourceData[src + channel]!)
        if (diff > 0) mismatch++
        if (diff > worstChannelDiff) worstChannelDiff = diff
      }
    }
  }
  check('pdf image stream inflates to width x height x 3', inflated.length === expected, {
    inflated: inflated.length,
    expected,
  })
  check('pdf image stream decodes back to the bitmap', mismatch === 0 && worstChannelDiff === 0, {
    mismatch,
    worstChannelDiff,
  })

  const parsedTask = getDocument({ data: pdfBytes.slice() })
  const parsed = await parsedTask.promise
  check('pdf parses with pdf.js', parsed.numPages === 2, { numPages: parsed.numPages })

  const parsedPage = await parsed.getPage(1)
  const unitViewport = parsedPage.getViewport({ scale: 1 })
  check(
    'pdf keeps the page size in points',
    Math.abs(unitViewport.width - firstSize.width) < 0.5 &&
      Math.abs(unitViewport.height - firstSize.height) < 0.5,
    {
      pdf: [Number(unitViewport.width.toFixed(2)), Number(unitViewport.height.toFixed(2))],
      original: [firstSize.width, firstSize.height],
    },
  )

  // render the PDF page at the exact resolution of the embedded bitmap, so a
  // sheared / shifted image shows up immediately as a large pixel difference
  const renderScale = pdfSources[0]!.width / unitViewport.width
  const pdfViewport = parsedPage.getViewport({ scale: renderScale })
  const pdfCanvas = document.createElement('canvas')
  pdfCanvas.width = Math.round(pdfViewport.width)
  pdfCanvas.height = Math.round(pdfViewport.height)
  await parsedPage.render({ canvas: pdfCanvas, viewport: pdfViewport }).promise

  const pdfCtx = pdfCanvas.getContext('2d')!
  const pdfData = pdfCtx.getImageData(0, 0, pdfCanvas.width, pdfCanvas.height).data
  let totalDiff = 0
  let samples = 0
  let worstPixel = 0
  for (let gy = 1; gy <= 10; gy++) {
    for (let gx = 1; gx <= 10; gx++) {
      const x = Math.round((pdfCanvas.width * gx) / 11)
      const y = Math.round((pdfCanvas.height * gy) / 11)
      const sx = Math.round((encodedFirst.width * gx) / 11)
      const sy = Math.round((encodedFirst.height * gy) / 11)
      const source = (sy * encodedFirst.width + sx) * 4
      const target = (y * pdfCanvas.width + x) * 4
      const diff =
        Math.abs(pdfData[target]! - sourceData[source]!) +
        Math.abs(pdfData[target + 1]! - sourceData[source + 1]!) +
        Math.abs(pdfData[target + 2]! - sourceData[source + 2]!)
      totalDiff += diff
      worstPixel = Math.max(worstPixel, diff)
      samples++
    }
  }
  check(
    'pdf page renders like the source bitmap (no shear)',
    totalDiff / samples < 12 && worstPixel < 140,
    { meanDiff: Number((totalDiff / samples).toFixed(2)), worstPixel, samples },
  )

  const maskCenterX = target.x + target.w / 2
  const maskCenterY = target.y + target.h / 2
  const cleanBitmap = await renderPageBitmap(
    doc.value!,
    1,
    [],
    pdfTarget.width,
    pdfTarget.height,
  )
  const pdfMaskedPixel = pixelAt(pdfCanvas, maskCenterX, maskCenterY)
  const cleanPixel = pixelAt(cleanBitmap, maskCenterX, maskCenterY)
  check(
    'pdf page shows the baked mask',
    Math.abs(pdfMaskedPixel[0] - cleanPixel[0]) + Math.abs(pdfMaskedPixel[1] - cleanPixel[1]) > 6,
    { pdf: pdfMaskedPixel, clean: cleanPixel },
  )
  cleanBitmap.width = 0

  await parsedTask.destroy()
  for (const bitmap of pdfSources) {
    bitmap.width = 0
    bitmap.height = 0
  }
  pdfCanvas.width = 0
  await wait(60)

  // --- layout ---------------------------------------------------------
  setZoom(state.zoom)
  const panel = document.querySelector('aside.absolute, aside')
  check('panel mounted', !!panel, { html: panel ? panel.className.slice(0, 60) : null })

  // --- image input -----------------------------------------------------
  const imageFile = await makeImageFile(400, 250, '#22c55e')
  const openedImage = await openDocument([imageFile])
  check('image document opens', openedImage && doc.value?.kind === 'image', {
    opened: openedImage,
    kind: doc.value?.kind ?? null,
    pages: state.pageCount,
  })
  if (openedImage) {
    const imageSize = await doc.value!.getPageSize(1)
    check(
      'image page keeps its pixel size',
      imageSize.width === 400 && imageSize.height === 250,
      imageSize,
    )

    await waitFor(() => (pageCanvas()?.width ?? 0) > 100, 10000)
    await wait(120)

    const cleanImage = await renderPageBitmap(doc.value!, 1, [], 400, 250)
    const cleanPixel = pixelAt(cleanImage, 0.5, 0.5)
    check('image pixels reach the export canvas', cleanPixel[1] > 180 && cleanPixel[0] < 120, {
      pixel: cleanPixel,
    })

    const imageMaskBefore = snapshotMasks()
    addMask({ page: 1, x: 0.25, y: 0.25, w: 0.5, h: 0.5, style: 'solid', color: '#ff00ff' })
    recordChange(imageMaskBefore)

    const bakedImage = await renderPageBitmap(doc.value!, 1, masksOf(1), 400, 250)
    const imageCenter = pixelAt(bakedImage, 0.5, 0.5)
    const imageCorner = pixelAt(bakedImage, 0.05, 0.05)
    check('image export bakes the mask', imageCenter[0] > 200 && imageCenter[2] > 200, {
      center: imageCenter,
    })
    check(
      'image export leaves the rest untouched',
      Math.abs(imageCorner[1] - cleanPixel[1]) < 6 && Math.abs(imageCorner[0] - cleanPixel[0]) < 6,
      { corner: imageCorner, clean: cleanPixel },
    )

    const nativeSize = computeExportSize(imageSize, { ...settings, sizeMode: 'dpi', dpi: 72 })
    check(
      '72 dpi export equals native image resolution',
      nativeSize.width === 400 && nativeSize.height === 250,
      nativeSize,
    )

    bakedImage.width = 0
    cleanImage.width = 0
  }

  check('no runtime errors', errors.length === 0, errors)

  selectMask(null)
  finish(steps, errors)
}

async function makeImageFile(width: number, height: number, color: string): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  const blob = await canvasToBlob(canvas, 'image/png')
  return new File([blob], 'selftest.png', { type: 'image/png' })
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
