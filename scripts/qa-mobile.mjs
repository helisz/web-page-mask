/**
 * Responsive layout QA: phone (390x844) and tablet (820x900).
 * Usage: node scripts/qa-mobile.mjs [url]
 */
import { withChrome } from './lib/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5179/?demo=1'

const probe = String.raw`
(async () => {
  const results = []
  const check = (name, pass, detail) => results.push({ name, pass, detail })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, timeout = 20000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try { if (fn()) return true } catch {}
      await wait(100)
    }
    return false
  }
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => Array.from(document.querySelectorAll(s))
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const vis = (el) => {
    if (!el) return false
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0
  }

  await waitFor(() => ($('[data-testid="page-canvas"]')?.width ?? 0) > 10)
  await wait(400)

  const stage = $('[data-testid="page-stage"]')
  const asides = $$('aside')
  const sidebar = asides.find((el) => el.className.includes('w-[156px]'))
  const panel = asides.find((el) => el.className.includes('md:static'))
  const viewer = stage.parentElement.parentElement
  const vw = window.innerWidth

  check('no horizontal overflow', document.documentElement.scrollWidth <= vw + 1, {
    scrollWidth: document.documentElement.scrollWidth,
    vw,
  })
  check('page fits width', stage.getBoundingClientRect().width <= viewer.getBoundingClientRect().width + 1, {
    stage: Math.round(stage.getBoundingClientRect().width),
    viewer: Math.round(viewer.getBoundingClientRect().width),
  })
  check('page fits height', stage.getBoundingClientRect().height <= 4000, {
    stageH: Math.round(stage.getBoundingClientRect().height),
  })

  const isNarrow = vw < 768
  const activeTool = (() => {
    const pressed = Array.from(document.querySelectorAll('[aria-pressed="true"]')).map((el) => el.textContent.trim())
    return pressed.join(' | ')
  })()
  check('touch defaults to pan tool', /pan/i.test(activeTool), { activeTool })
  if (isNarrow) {
    check('sidebar hidden on phone', !vis(sidebar), sidebar ? rectOf(sidebar) : null)
    check('panel off-canvas on phone', !!panel && panel.getBoundingClientRect().left >= vw - 2, panel ? rectOf(panel) : null)

    const toggle = $$('button').find((b) => b.getAttribute('aria-label') && b.className.includes('md:hidden'))
    check('panel toggle present', !!toggle, toggle ? toggle.getAttribute('aria-label') : null)
    if (toggle) {
      toggle.click()
      await wait(400)
      check('panel slides in', panel.getBoundingClientRect().left < vw - 40 && panel.getBoundingClientRect().right <= vw + 1, rectOf(panel))
      const backdrop = $$('div').find((el) => el.className.includes('fixed inset-0 z-30'))
      check('backdrop shown', !!backdrop, backdrop ? backdrop.className.slice(0, 40) : null)
      if (backdrop) backdrop.click()
      await wait(400)
      check('panel closes again', panel.getBoundingClientRect().left >= vw - 2, rectOf(panel))
    }
  } else {
    check('sidebar visible on tablet', vis(sidebar), sidebar ? rectOf(sidebar) : null)
    check('panel docked on tablet', vis(panel) && Math.abs(panel.getBoundingClientRect().right - vw) <= 1, panel ? rectOf(panel) : null)
  }

  // export dialog fits
  const exportButton = $$('header button').find((b) => /export/i.test(b.textContent))
  check('export button reachable', !!exportButton, exportButton ? exportButton.textContent.trim() : null)
  if (exportButton) {
    exportButton.click()
    await waitFor(() => !!$('[role="dialog"]'), 5000)
    await wait(300)
    const dialog = $('[role="dialog"]')
    check('dialog opens', !!dialog, dialog ? rectOf(dialog) : null)
    if (dialog) {
      const r = dialog.getBoundingClientRect()
      check('dialog within viewport', r.left >= -1 && r.right <= vw + 1 && r.width <= vw, {
        x: Math.round(r.left),
        w: Math.round(r.width),
        vw,
      })
      check('dialog scrollable when tall', dialog.scrollHeight > 0, { scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight })
      const close = dialog.querySelector('button[aria-label="Close"]')
      close.click()
    }
  }

  const header = $('header')
  check('header fits', header.getBoundingClientRect().width <= vw + 1, rectOf(header))

  return { ok: results.every((x) => x.pass), failures: results.filter((x) => !x.pass).map((x) => x.name), results, vw }
})()
`

for (const [label, width, height] of [
  ['phone', 390, 844],
  ['tablet', 820, 900],
]) {
  const report = await withChrome(
    url,
    { width, height, emulate: { width, height, dpr: 2, mobile: true } },
    async (api) => api.evaluate(probe),
  )
  console.log(`\n=== ${label} (${width}x${height}) ===`)
  for (const item of report.results) {
    console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}${item.pass ? '' : ' :: ' + JSON.stringify(item.detail)}`)
  }
  console.log(`ok=${report.ok} vw=${report.vw}`)
  if (!report.ok) process.exitCode = 1
}
