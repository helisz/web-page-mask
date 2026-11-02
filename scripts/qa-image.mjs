/**
 * Image input end-to-end test: drops two in-memory images (PNG + JPEG) on the
 * empty state, checks they become pages, draws a mask, switches pages, exports
 * page 1 as PNG at native resolution, and rejects an unsupported file.
 *
 * Usage: node scripts/qa-image.mjs [url]
 */
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { sleep, withChrome } from './lib/cdp.mjs'

const target = new URL(process.argv[2] ?? 'http://localhost:5179/?demo=1')
target.search = ''
const url = target.toString()
const downloadDir = join(process.cwd(), 'shots', 'downloads-image')

const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

async function waitForFile(dir, match, timeout = 45_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const files = await readdir(dir).catch(() => [])
    const hit = files.find((name) => match(name) && !name.endsWith('.crdownload'))
    if (hit) return hit
    await sleep(250)
  }
  return null
}

function pngSize(buffer) {
  if (buffer.length < 24) return null
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

await rm(downloadDir, { recursive: true, force: true })
await mkdir(downloadDir, { recursive: true })

await withChrome(url, { downloadPath: downloadDir }, async (api) => {
  // ---------------- drop two images, check the pages ----------------
  const setup = await api.evaluate(String.raw`
  (async () => {
    const results = []
    const check = (name, pass, detail) => results.push({ name, pass, detail })
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const waitFor = async (fn, timeout = 15000) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        try { if (fn()) return true } catch {}
        await wait(80)
      }
      return false
    }
    const $ = (selector) => document.querySelector(selector)
    const $$ = (selector) => Array.from(document.querySelectorAll(selector))
    const aspect = (el) => (el ? el.getBoundingClientRect().width / el.getBoundingClientRect().height : 0)
    const pixel = (element, nx, ny) => {
      const ctx = element.getContext('2d')
      const x = Math.min(element.width - 1, Math.max(0, Math.round(nx * element.width)))
      const y = Math.min(element.height - 1, Math.max(0, Math.round(ny * element.height)))
      return Array.from(ctx.getImageData(x, y, 1, 1).data)
    }
    const makeFile = async (width, height, color, name, type) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = color
      ctx.fillRect(0, 0, width, height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92))
      return new File([blob], name, { type })
    }

    const dropZone = document.querySelector('[data-testid="page-canvas"]')
    check('starts on the empty state', !dropZone, { hadCanvas: !!dropZone })

    const mounted = await waitFor(() => !!document.querySelector('[data-testid="drop-zone"]'), 20000)
    check('app is ready for a drop', mounted, {})
    if (!mounted) return { results }
    // a cold Vite start can still trigger a dependency reload right after mount
    await wait(600)

    const png = await makeFile(400, 250, '#22c55e', 'image-a.png', 'image/png')
    const jpg = await makeFile(240, 180, '#3b82f6', 'image-b.jpg', 'image/jpeg')
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(png)
    dataTransfer.items.add(jpg)
    window.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))

    const loaded = await waitFor(() => ($('[data-testid="page-canvas"]')?.width ?? 0) > 100)
    check('dropping images opens a document', loaded, {})
    if (!loaded) return { results }

    const stage = $('[data-testid="page-stage"]')
    const canvas = $('[data-testid="page-canvas"]')
    const overlay = $('[data-testid="mask-canvas"]')
    const pageInput = $('input[inputmode="numeric"]')
    const pageTotal = pageInput && pageInput.nextElementSibling ? pageInput.nextElementSibling.textContent.trim() : ''
    check('two images become two pages', /\/\s*2/.test(pageTotal), { pageTotal })
    check('page 1 keeps the png aspect ratio', Math.abs(aspect(stage) - 1.6) < 0.02, { aspect: aspect(stage) })

    await waitFor(() => {
      const value = pixel(canvas, 0.5, 0.5)
      return value[1] > 120 && value[0] < 140
    })
    const first = pixel(canvas, 0.5, 0.5)
    check('png pixels are painted', first[1] > 120 && first[0] < 140, { pixel: first })

    await waitFor(() => $$('aside button').some((button) => button.getAttribute('title') === 'image-b.jpg'))
    const titles = $$('aside button').map((button) => button.getAttribute('title')).filter(Boolean)
    check(
      'thumbnails carry the image file names',
      titles.includes('image-a.png') && titles.includes('image-b.jpg'),
      { titles },
    )

    // draw a mask like on a PDF
    const rect = stage.getBoundingClientRect()
    const point = (nx, ny) => ({ clientX: rect.left + rect.width * nx, clientY: rect.top + rect.height * ny })
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...point(0.25, 0.25) }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, ...point(0.75, 0.75) }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...point(0.75, 0.75) }))
    await wait(200)
    check('mask can be drawn on an image', pixel(overlay, 0.5, 0.5)[3] > 0, {
      alpha: pixel(overlay, 0.5, 0.5)[3],
    })

    // second page renders the jpeg at its own aspect ratio
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await waitFor(() => Math.abs(aspect($('[data-testid="page-stage"]')) - 4 / 3) < 0.02)
    await waitFor(() => {
      const value = pixel($('[data-testid="page-canvas"]'), 0.5, 0.5)
      return value[2] > 150 && value[0] < 140
    })
    const second = pixel($('[data-testid="page-canvas"]'), 0.5, 0.5)
    check('jpeg page renders at its own size', Math.abs(aspect(stage) - 4 / 3) < 0.02 && second[2] > 150, {
      aspect: aspect(stage),
      pixel: second,
    })
    check('masks stay on their own page', pixel($('[data-testid="mask-canvas"]'), 0.5, 0.5)[3] === 0, {
      alpha: pixel($('[data-testid="mask-canvas"]'), 0.5, 0.5)[3],
    })

    // back to page 1 for the export
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await waitFor(() => Math.abs(aspect($('[data-testid="page-stage"]')) - 1.6) < 0.02)
    await wait(150)

    return { results }
  })()
  `)

  const setupResults = setup?.results ?? []
  for (const item of setupResults) check(item.name, item.pass, item.detail)

  // ---------------- export page 1 at native resolution ----------------
  const exported = await api.evaluate(String.raw`
  (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const $ = (selector) => document.querySelector(selector)
    const $$ = (selector) => Array.from(document.querySelectorAll(selector))
    const headerExport = $$('header button').find((button) => /export/i.test(button.textContent || ''))
    if (!headerExport) return { opened: false }
    headerExport.click()
    await wait(350)
    const dialog = $('[role="dialog"]')
    if (!dialog) return { opened: false }

    const native = $$('button').find((button) => /^native 72/i.test(button.textContent.trim()))
    if (native) native.click()
    await wait(250)
    const output = dialog.innerText

    const buttons = $$('button').filter((button) => button.textContent.trim().toLowerCase() === 'export')
    const start = buttons[buttons.length - 1]
    if (!start) return { opened: true, output, clicked: false }
    start.click()
    return { opened: true, output, clicked: true }
  })()
  `)

  check('export dialog opens for images', exported?.opened === true, { exported })
  check('image export defaults to native resolution', /400\s*×\s*250\s*px/.test(String(exported?.output)), {
    output: String(exported?.output).split('\n').filter((line) => /px|dpi/i.test(line)).slice(0, 4),
  })
  check('export started', exported?.clicked === true, {})

  const pngName = await waitForFile(downloadDir, (name) => name.endsWith('.png'))
  check('png downloaded', !!pngName, { pngName })
  if (pngName) {
    const buffer = await readFile(join(downloadDir, pngName))
    const info = pngSize(buffer)
    check('png keeps the source pixels at 72 dpi', !!info && info.width === 400 && info.height === 250, info)
    check('png is named after the first image', /^image-a-p1\.png$/.test(pngName), { pngName })
  }

  check(
    'dialog closes after exporting',
    await api.waitFor(`!document.querySelector('[role="dialog"]')`, 5000),
    {},
  )

  // ---------------- unsupported file stays a friendly error ----------------
  const rejection = await api.evaluate(String.raw`
  (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const waitFor = async (fn, timeout = 5000) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        try { if (fn()) return true } catch {}
        await wait(80)
      }
      return false
    }
    // drop the "exported" toast so only the rejection can be on screen
    Array.from(document.querySelectorAll('[class*="pointer-events-auto"] button')).forEach((button) => button.click())
    await wait(200)

    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))

    const toastText = () => {
      const toast = document.querySelector('[class*="pointer-events-auto"]')
      return toast ? (toast.textContent || '').trim() : ''
    }
    await waitFor(() => /PDF/.test(toastText()))
    const pageInput = document.querySelector('input[inputmode="numeric"]')
    return {
      toast: toastText(),
      pageTotal: pageInput && pageInput.nextElementSibling ? pageInput.nextElementSibling.textContent.trim() : '',
    }
  })()
  `)
  check('unsupported file shows an error toast', /PDF/.test(String(rejection?.toast)), rejection)
  check('open document survives a bad drop', /\/\s*2/.test(String(rejection?.pageTotal)), rejection)

  const consoleErrors = api.consoleLog.filter(
    (line) => line.startsWith('exception') || line.startsWith('error'),
  )
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5))
})

const report = {
  ok: results.every((item) => item.pass),
  failures: results.filter((item) => !item.pass).map((item) => item.name),
  results,
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.ok ? 0 : 1
