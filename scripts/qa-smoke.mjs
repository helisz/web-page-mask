/**
 * Fast gate for the iteration loop (~10s instead of ~3min).
 *
 * Loads the app once and walks the golden path: render -> draw mask -> undo ->
 * open export dialog. It deliberately stays locale-agnostic and coarse: it
 * answers "did I break the app", not "is every pixel right". Run the full
 * suites (`npm run qa`) before pushing.
 *
 * Usage: node scripts/qa-smoke.mjs [url]
 */
import { sleep, withChrome } from './lib/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5179/?demo=1'
const started = Date.now()

const script = String.raw`
(async () => {
  const results = []
  const check = (name, pass, detail) => results.push({ name, pass, detail })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, timeout = 20000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try { if (fn()) return true } catch {}
      await wait(80)
    }
    return false
  }
  const $ = (selector) => document.querySelector(selector)
  const $$ = (selector) => Array.from(document.querySelectorAll(selector))

  const ready = await waitFor(() => ($('[data-testid="page-canvas"]')?.width ?? 0) > 400)
  check('page rendered', ready, {})
  if (!ready) return { results }

  await wait(150)

  const stage = $('[data-testid="page-stage"]')
  const overlay = $('[data-testid="mask-canvas"]')
  const panel = $$('aside').find((el) => el.className.includes('md:w-72'))
  const maskCount = () => (panel ? panel.querySelectorAll('li').length : 0)
  const alphaAt = (nx, ny) => {
    const ctx = overlay.getContext('2d')
    const x = Math.min(overlay.width - 1, Math.floor(overlay.width * nx))
    const y = Math.min(overlay.height - 1, Math.floor(overlay.height * ny))
    return ctx.getImageData(x, y, 1, 1).data[3]
  }

  // draw a mask across the upper-left quadrant of the page
  const r = stage.getBoundingClientRect()
  const point = (nx, ny) => ({ clientX: r.left + r.width * nx, clientY: r.top + r.height * ny })
  const from = point(0.2, 0.26)
  const to = point(0.62, 0.34)
  stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...from }))
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, ...to }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...to }))
  await wait(250)
  const painted = alphaAt(0.4, 0.3) > 0
  const drawn = maskCount()
  check('drag draws a mask', painted && drawn === 1, { painted, count: drawn })

  // undo restores a clean page
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
  await wait(250)
  const afterUndo = maskCount()
  check('ctrl+z undoes it', afterUndo === 0 && alphaAt(0.4, 0.3) === 0, { count: afterUndo })

  // export dialog opens and offers the three formats
  const exportButton = $$('header button').find((b) => /导出|匯出|Export/i.test(b.textContent || ''))
  if (exportButton) exportButton.click()
  await wait(300)
  const dialog = $('[role="dialog"]') || $$('div').find((el) => el.className.includes('max-w') && /PDF/.test(el.textContent || ''))
  const dialogText = dialog ? dialog.textContent || '' : ''
  check('export dialog opens', !!dialog, { found: !!dialog })
  check('dialog offers PDF', /PDF/.test(dialogText), { text: dialogText.slice(0, 120) })
  check('dialog offers 4 scopes', dialog ? dialog.querySelectorAll('button').length >= 4 : false, {
    buttons: dialog ? dialog.querySelectorAll('button').length : 0,
  })

  return { results }
})()
`

const output = await withChrome(url, {}, async (api) => {
  const report = await api.evaluate(script)
  return { report, errors: api.consoleLog.filter((line) => /^(error|exception):/.test(line)) }
})

const results = [...(output.report?.results ?? [])]
results.push({ name: 'no console errors', pass: output.errors.length === 0, detail: output.errors.slice(0, 3) })

const failed = results.filter((item) => !item.pass)
const seconds = ((Date.now() - started) / 1000).toFixed(1)

for (const item of results) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}${item.pass ? '' : ` :: ${JSON.stringify(item.detail)}`}`)
}
console.log(`\nok=${failed.length === 0} checks=${results.length} seconds=${seconds}`)

await sleep(0)
process.exit(failed.length === 0 ? 0 : 1)
