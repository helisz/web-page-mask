/**
 * Verifies the demo seed masks actually cover the sample document's text rows.
 * Usage: node scripts/qa-demo.mjs [base url]
 */
import { withChrome } from './lib/cdp.mjs'

const base = process.argv[2] ?? 'http://localhost:5179/'

const probe = String.raw`
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, timeout = 20000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try { if (fn()) return true } catch {}
      await wait(100)
    }
    return false
  }
  await waitFor(() => ($('[data-testid="page-canvas"]')?.width ?? 0) > 10)
  await wait(900)

  const stage = document.querySelector('[data-testid="page-stage"]')
  const page = document.querySelector('[data-testid="page-canvas"]')
  const overlay = document.querySelector('[data-testid="mask-canvas"]')

  const outlines = Array.from(stage.querySelectorAll(':scope > div.pointer-events-none > div'))
    .filter((el) => el.style.left && el.style.width)

  const results = []
  for (const el of outlines) {
    const rect = {
      x: parseFloat(el.style.left) / 100,
      y: parseFloat(el.style.top) / 100,
      w: parseFloat(el.style.width) / 100,
      h: parseFloat(el.style.height) / 100,
    }
    const px = Math.round(rect.x * page.width)
    const py = Math.round(rect.y * page.height)
    const pw = Math.max(2, Math.round(rect.w * page.width))
    const ph = Math.max(2, Math.round(rect.h * page.height))
    const data = page.getContext('2d').getImageData(px, py, pw, ph).data
    let dark = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 200 && data[i + 1] < 200) dark++
    }
    const alpha = overlay.getContext('2d').getImageData(px, py, pw, ph).data
    let painted = 0
    for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 0) painted++
    results.push({
      rect: [rect.x, rect.y, rect.w, rect.h].map((v) => Number(v.toFixed(3))),
      darkRatio: Number((dark / (pw * ph)).toFixed(3)),
      paintedRatio: Number((painted / (pw * ph)).toFixed(3)),
      coversText: dark / (pw * ph) > 0.03,
      painted: painted / (pw * ph) > 0.9,
    })
  }

  return { count: outlines.length, results, ok: results.length === 3 && results.every((r) => r.coversText && r.painted) }
})()
`

const report = await withChrome(base, { width: 1440, height: 900 }, async (api) => api.evaluate(probe))
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.ok ? 0 : 1
