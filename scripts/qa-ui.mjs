/**
 * UI / layout / interaction QA in headless Chrome.
 * Usage: node scripts/qa-ui.mjs [url] [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sleep, withChrome } from './lib/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5179/?demo=1'
const outDir = process.argv[3] ?? 'shots'

const script = String.raw`
(async () => {
  const results = []
  const check = (name, pass, detail) => results.push({ name, pass, detail })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, timeout = 15000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try { if (fn()) return true } catch {}
      await wait(100)
    }
    return false
  }
  const $ = (selector) => document.querySelector(selector)
  const $$ = (selector) => Array.from(document.querySelectorAll(selector))
  const text = (el) => (el ? (el.textContent || '').trim() : '')
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }

  await waitFor(() => ($('[data-testid="page-canvas"]')?.width ?? 0) > 10)
  await wait(400)

  const stage = $('[data-testid="page-stage"]')
  const canvas = $('[data-testid="page-canvas"]')
  const overlay = $('[data-testid="mask-canvas"]')
  const header = $('header')
  const asides = $$('aside')
  const sidebar = asides.find((el) => el.className.includes('w-[156px]'))
  const panel = asides.find((el) => el.className.includes('md:w-72'))
  const viewer = stage ? stage.parentElement.parentElement : null

  check('page stage present', !!stage, stage ? rectOf(stage) : null)
  check('canvas matches stage box', !!canvas && Math.abs(rectOf(canvas).w - rectOf(stage).w) <= 2 && Math.abs(rectOf(canvas).h - rectOf(stage).h) <= 2, { canvas: canvas ? rectOf(canvas) : null, stage: stage ? rectOf(stage) : null })
  check('overlay canvas aligned', !!overlay && rectOf(overlay).w === rectOf(stage).w, overlay ? rectOf(overlay) : null)

  check('no horizontal page overflow', document.documentElement.scrollWidth <= window.innerWidth + 1, { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })
  check('header height sane', header && rectOf(header).h >= 48 && rectOf(header).h <= 64, header ? rectOf(header) : null)
  check('sidebar visible', !!sidebar && rectOf(sidebar).w >= 120, sidebar ? rectOf(sidebar) : null)
  check('mask panel visible', !!panel && rectOf(panel).w >= 240, panel ? rectOf(panel) : null)
  check('panel docked to the right', !!panel && Math.abs(panel.getBoundingClientRect().right - window.innerWidth) <= 1, panel ? rectOf(panel) : null)
  check('viewer not overlapped by panel', !!viewer && viewer.getBoundingClientRect().right <= panel.getBoundingClientRect().left + 1, viewer ? rectOf(viewer) : null)
  check('page fits the viewer width', !!stage && rectOf(stage).w <= (viewer ? viewer.getBoundingClientRect().width : 0), { stage: stage ? rectOf(stage).w : null, viewer: viewer ? Math.round(viewer.getBoundingClientRect().width) : null })

  // ---- i18n sanity ------------------------------------------------
  const visible = document.body.innerText
  const missing = visible.match(/\b(app|header|drop|panel|export|toolbar|shortcuts|thumb|viewer|common|pdf)\.[a-zA-Z][a-zA-Z.]*/g) || []
  const placeholders = visible.match(/\{[a-zA-Z]+\}/g) || []
  check('no missing i18n keys', missing.length === 0, missing.slice(0, 5))
  check('no unresolved placeholders', placeholders.length === 0, placeholders.slice(0, 5))

  // ---- keyboard page navigation -----------------------------------
  const pageInput = $('header') && $('input[inputmode="numeric"]')
  const beforePage = pageInput ? pageInput.value : null
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await wait(250)
  const afterNext = pageInput ? pageInput.value : null
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  await wait(250)
  const afterPrev = pageInput ? pageInput.value : null
  check('ArrowRight goes to next page', afterNext === '2', { beforePage, afterNext })
  check('ArrowLeft returns', afterPrev === '1', { afterPrev })

  // ---- zoom keys ---------------------------------------------------
  const widthBefore = stage.getBoundingClientRect().width
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
  await wait(350)
  const widthZoomed = stage.getBoundingClientRect().width
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
  await wait(350)
  const widthFit = stage.getBoundingClientRect().width
  check('zoom in grows the page', widthZoomed > widthBefore + 5, { widthBefore: Math.round(widthBefore), widthZoomed: Math.round(widthZoomed) })
  check('0 refits the width', Math.abs(widthFit - widthBefore) <= 2, { widthBefore: Math.round(widthBefore), widthFit: Math.round(widthFit) })

  // ---- draw a mask, then delete it with the keyboard ---------------
  const r = stage.getBoundingClientRect()
  const point = (nx, ny) => ({ clientX: r.left + r.width * nx, clientY: r.top + r.height * ny })
  const from = point(0.2, 0.3)
  const to = point(0.6, 0.38)
  stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...from }))
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, ...to }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...to }))
  await wait(350)
  const listItems = () => $$('aside')[1] ? $$('aside')[1].querySelectorAll('li').length : 0
  const afterDraw = listItems()
  const overlayPainted = (() => {
    const ctx = overlay.getContext('2d')
    const d = ctx.getImageData(Math.round(overlay.width * 0.4), Math.round(overlay.height * 0.34), 1, 1).data
    return d[3] > 0
  })()
  check('mask created via drag', afterDraw === 1, { listItems: afterDraw })
  check('overlay painted', overlayPainted, {})

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
  await wait(350)
  check('Delete removes the mask', listItems() === 0, { listItems: listItems() })

  // ---- masks are per page -------------------------------------------
  const alphaAt = (nx, ny) => {
    const ctx = overlay.getContext('2d')
    return ctx.getImageData(Math.round(overlay.width * nx), Math.round(overlay.height * ny), 1, 1).data[3]
  }
  const dragMask = async (x1, y1, x2, y2) => {
    const box = stage.getBoundingClientRect()
    const p = (nx, ny) => ({ clientX: box.left + box.width * nx, clientY: box.top + box.height * ny })
    const a = p(x1, y1)
    const b = p(x2, y2)
    stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...a }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, ...b }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...b }))
    await wait(400)
  }

  await dragMask(0.2, 0.3, 0.6, 0.38)
  const p1Painted = alphaAt(0.4, 0.34) > 0
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await wait(700)
  const p2Clean = alphaAt(0.4, 0.34) === 0
  await dragMask(0.3, 0.5, 0.7, 0.56)
  const p2Count = listItems()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  await wait(700)
  const backPainted = alphaAt(0.4, 0.34) > 0
  const backCount = listItems()
  check('masks stay on their page', p1Painted && p2Clean && p2Count === 1 && backPainted && backCount === 1, {
    p1Painted,
    p2Clean,
    p2Count,
    backPainted,
    backCount,
  })

  // ---- mask shape ----------------------------------------------------
  const panelEl = $$('aside').find((el) => el.className.includes('md:w-72'))
  const firstItem = panelEl ? panelEl.querySelector('li > div') : null
  if (firstItem) firstItem.click()
  await wait(300)

  const circleButton = panelEl
    ? Array.from(panelEl.querySelectorAll('button')).find((b) => /circle|圆|圓/i.test(text(b)))
    : null
  if (circleButton) circleButton.click()
  await wait(500)

  const selectedBox = stage.querySelector('.border-2')
  const boxRect = selectedBox ? selectedBox.getBoundingClientRect() : null
  const canvasRect = overlay.getBoundingClientRect()
  const readAlpha = (clientX, clientY) => {
    const ctx = overlay.getContext('2d')
    const x = Math.round(((clientX - canvasRect.left) / canvasRect.width) * overlay.width)
    const y = Math.round(((clientY - canvasRect.top) / canvasRect.height) * overlay.height)
    return ctx.getImageData(x, y, 1, 1).data[3]
  }
  const inset = boxRect ? Math.min(boxRect.width, boxRect.height) * 0.015 : 0
  const centerAlpha = boxRect ? readAlpha(boxRect.left + boxRect.width / 2, boxRect.top + boxRect.height / 2) : -1
  const cornerAlpha = boxRect ? readAlpha(boxRect.left + inset, boxRect.top + inset) : -1
  const listText = panelEl ? text(panelEl.querySelector('li')) : ''
  check(
    'circle shape clips the mosaic',
    !!selectedBox && centerAlpha > 0 && cornerAlpha === 0,
    { centerAlpha, cornerAlpha, hasBox: !!selectedBox },
  )
  check(
    'circle shape is rounded and listed',
    !!selectedBox && selectedBox.className.includes('rounded-full') && /circle|圆|圓/i.test(listText),
    { className: selectedBox ? selectedBox.className.slice(0, 80) : null, listText },
  )

  // switching back to a rectangle restores the corners
  const rectButton = panelEl
    ? Array.from(panelEl.querySelectorAll('button')).find((b) => /rect|长方|長方/i.test(text(b)))
    : null
  if (rectButton) rectButton.click()
  await wait(400)
  const cornerAfterRect = boxRect ? readAlpha(boxRect.left + inset, boxRect.top + inset) : -1
  check('rectangle restores the corners', cornerAfterRect > 0, { cornerAfterRect })

  // ---- export dialog ------------------------------------------------
  const headerButtons = $$('header button')
  const exportButton = headerButtons.find((b) => text(b).toLowerCase().includes('export'))
  check('export button in header', !!exportButton, exportButton ? text(exportButton) : null)
  exportButton.click()
  await waitFor(() => !!$('[role="dialog"]'), 5000)
  await wait(250)
  const dialog = $('[role="dialog"]')
  check('export dialog opens', !!dialog, dialog ? rectOf(dialog) : null)
  if (dialog) {
    const dr = dialog.getBoundingClientRect()
    check('dialog fits viewport', dr.top >= 0 && dr.bottom <= window.innerHeight + 1 && dr.left >= 0 && dr.right <= window.innerWidth + 1, { top: Math.round(dr.top), bottom: Math.round(dr.bottom), height: Math.round(dr.height) })
    check('dialog shows output size', /[\d,]+\s*×\s*[\d,]+\s*px/.test(text(dialog)), text(dialog).match(/[\d,]+\s*×\s*[\d,]+\s*px/g))

    const scopeButtons = Array.from(dialog.querySelectorAll('button')).filter((b) =>
      /^(current|masked|all\b|range)/i.test(text(b)),
    )
    const maskedButton = scopeButtons.find((b) => /masked/i.test(text(b)))
    check('export scope has 4 options', scopeButtons.length === 4, {
      labels: scopeButtons.map((b) => text(b)),
    })
    check('masked scope counts masked pages', !!maskedButton && /2/.test(text(maskedButton)), {
      label: maskedButton ? text(maskedButton) : null,
    })

    if (maskedButton) {
      maskedButton.click()
      await wait(300)
      const maskedHint = text(dialog)
      check('masked scope explains itself', /only pages that have masks/i.test(maskedHint), {
        lines: maskedHint.split('\n').filter((line) => /mask/i.test(line)).slice(0, 3),
      })
      const startButton = Array.from(dialog.querySelectorAll('button')).find(
        (b) => text(b).trim().toLowerCase() === 'export',
      )
      check('masked scope is exportable', !!startButton && !startButton.disabled, {
        disabled: startButton ? startButton.disabled : null,
      })
      const currentButton = scopeButtons.find((b) => /current/i.test(text(b)))
      if (currentButton) currentButton.click()
      await wait(200)
    }

    const pdfButton = Array.from(dialog.querySelectorAll('button')).find((b) => /pdf/i.test(text(b)))
    check('pdf format offered', !!pdfButton, { label: pdfButton ? text(pdfButton) : null })
    if (pdfButton) {
      pdfButton.click()
      await wait(300)
      check('pdf hint shown', /not selectable|lossless/i.test(text(dialog)), {
        lines: text(dialog).split('\n').filter((line) => /pdf|lossless|selectable/i.test(line)).slice(0, 3),
      })
      const pngButton = Array.from(dialog.querySelectorAll('button')).find((b) => /png/i.test(text(b)))
      if (pngButton) pngButton.click()
      await wait(200)
    }
    const close = dialog.querySelector('button[aria-label="Close"]')
    if (close) close.click()
    await wait(400)
    check('dialog closes', !$('[role="dialog"]'), {})
  }

  // ---- thumbnails ----------------------------------------------------
  await wait(600)
  const sidebarCanvases = sidebar ? sidebar.querySelectorAll('canvas').length : 0
  const thumbRendered = sidebar ? Array.from(sidebar.querySelectorAll('canvas')).some((c) => c.width > 50) : false
  check('thumbnails rendered', sidebarCanvases >= 3 && thumbRendered, { sidebarCanvases, thumbRendered })

  // ---- language switch ----------------------------------------------
  const select = $('header select')
  if (select) {
    select.value = 'zh-TW'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(400)
  }
  const title = $('header .text-sm.font-semibold')
  check('language switches to zh-TW', text(title) === 'PDF 打碼工具', { title: text(title), lang: document.documentElement.lang })
  const missingAfter = (document.body.innerText.match(/\b(app|header|drop|panel|export|toolbar|shortcuts|thumb|viewer|common|pdf)\.[a-zA-Z][a-zA-Z.]*/g) || [])
  check('zh-TW strings complete', missingAfter.length === 0, missingAfter.slice(0, 5))

  // ---- theme toggle ---------------------------------------------------
  const themeButton = $$('header button').find((b) => (b.getAttribute('aria-label') || '').match(/theme|主題|主题/i))
  const darkBefore = document.documentElement.classList.contains('dark')
  if (themeButton) themeButton.click()
  await wait(300)
  const darkAfter = document.documentElement.classList.contains('dark')
  check('theme toggles', darkBefore !== darkAfter, { darkBefore, darkAfter })

  return {
    ok: results.every((x) => x.pass),
    failures: results.filter((x) => !x.pass).map((x) => x.name),
    results,
    metrics: {
      viewport: [window.innerWidth, window.innerHeight],
      header: header ? rectOf(header) : null,
      sidebar: sidebar ? rectOf(sidebar) : null,
      panel: panel ? rectOf(panel) : null,
      stage: stage ? rectOf(stage) : null,
      zoom: window.__zoom ?? null,
    },
  }
})()
`

await mkdir(outDir, { recursive: true })

await withChrome(url, { width: 1440, height: 900 }, async (api) => {
  const report = await api.evaluate(script)
  console.log(JSON.stringify(report, null, 2))
  console.log('--- console ---')
  console.log(api.consoleLog.slice(-15).join('\n') || '(clean)')

  const shot = await api.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, 'ui-check.png'), Buffer.from(shot.data, 'base64'))
  await writeFile(join(outDir, 'ui-check.json'), JSON.stringify(report, null, 2))
  await sleep(100)
  process.exitCode = report.ok ? 0 : 1
})
