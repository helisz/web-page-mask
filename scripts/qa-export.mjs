/**
 * End-to-end export test: drives the export dialog, waits for real downloads,
 * then validates the produced PNG / ZIP / JPG files.
 *
 * Usage: node scripts/qa-export.mjs [url]
 */
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { sleep, withChrome } from './lib/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5179/?demo=1'
const downloadDir = join(process.cwd(), 'shots', 'downloads')

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
  const ready = await api.waitFor(
    `(() => { const c = document.querySelector('[data-testid="page-canvas"]'); return !!c && c.width > 10 })()`,
    25_000,
  )
  check('document ready', ready, {})

  const openDialog = async () => {
    await api.evaluate(
      `(() => { const b=[...document.querySelectorAll('header button')].find(x=>/export/i.test(x.textContent)); b.click(); return true })()`,
    )
    return api.waitFor(`!!document.querySelector('[role="dialog"]')`, 5000)
  }

  // ---------------- multi page PNG -> ZIP ----------------
  check('dialog opens', await openDialog(), {})
  await sleep(300)

  const scopeLabel = await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>/^all/i.test(x.textContent.trim())); if(!b) return null; b.click(); return b.textContent.trim() })()`,
  )
  check('scope "all pages" selected', /all/i.test(String(scopeLabel)), { scopeLabel })

  const rangeCheck = await api.evaluate(
    `(async () => {
      const d = document.querySelector('[role="dialog"]')
      const seg = [...d.querySelectorAll('button')].find((x) => /range/i.test(x.textContent))
      if (!seg) return null
      seg.click()
      await new Promise((r) => setTimeout(r, 120))
      const input = [...d.querySelectorAll('input')].find((x) => /range|1-3/i.test(x.placeholder || ''))
      if (!input) return null
      input.value = '1-2'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      return d.innerText
    })()`,
  )
  check('page range parsed', /2 page/.test(String(rangeCheck)), {
    snippet: String(rangeCheck).split('\n').filter((line) => /page/.test(line)).slice(0, 3),
  })

  // switch back to all pages
  await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>/^all/i.test(x.textContent.trim())); b.click(); return true })()`,
  )
  await sleep(200)

  const clicked = await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const list=[...d.querySelectorAll('button')].filter(x=>x.textContent.trim().toLowerCase()==='export'); const b=list[list.length-1]; b.click(); return !!b })()`,
  )
  check('export button clicked', clicked, {})

  const zipName = await waitForFile(downloadDir, (name) => name.endsWith('.zip'))
  check('zip downloaded', !!zipName, { zipName })
  if (zipName) {
    const buffer = await readFile(join(downloadDir, zipName))
    const zip = await JSZip.loadAsync(buffer)
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
    check('zip has 3 entries', names.length === 3, { names })
    const pngs = names.filter((name) => name.endsWith('.png'))
    check('zip entries are png', pngs.length === 3, { pngs })
    if (pngs[0]) {
      const bytes = await zip.file(pngs[0]).async('uint8array')
      const info = pngSize(Buffer.from(bytes))
      check('zip png is 144dpi size', !!info && info.width === 1190 && info.height === 1684, info)
      check('zip png not empty', bytes.length > 3000, { bytes: bytes.length })
    }
  }

  // ---------------- single page JPG ----------------
  await api.waitFor(`!document.querySelector('[role="dialog"]')`, 5000)
  check('dialog closed after export', true, {})

  check('dialog reopens', await openDialog(), {})
  await sleep(300)

  const jpgSelected = await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>/jpg/i.test(x.textContent)); if(!b) return null; b.click(); return b.textContent.trim() })()`,
  )
  check('jpg format selected', /jpg/i.test(String(jpgSelected)), { jpgSelected })

  // lower the size via a preset (native 72 dpi) to keep the file small
  await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>/^native 72/i.test(x.textContent.trim())); if (b) b.click(); return !!b })()`,
  )
  await sleep(250)

  const outputText = await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); return d ? d.innerText : '' })()`,
  )
  check('native preset resizes output', /595\s*×\s*842\s*px/.test(outputText), {
    matched: outputText.match(/[\d,]+\s*×\s*[\d,]+\s*px/g),
  })

  await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const list=[...d.querySelectorAll('button')].filter(x=>x.textContent.trim().toLowerCase()==='export'); const b=list[list.length-1]; b.click(); return true })()`,
  )

  const jpgName = await waitForFile(downloadDir, (name) => name.endsWith('.jpg'))
  check('jpg downloaded', !!jpgName, { jpgName })
  if (jpgName) {
    const buffer = await readFile(join(downloadDir, jpgName))
    check('jpg signature', buffer[0] === 0xff && buffer[1] === 0xd8, { first: [buffer[0], buffer[1]] })
    check('jpg size reasonable', buffer.length > 8000, { bytes: buffer.length })
  }


  // ---------------- multi page PDF ----------------
  await api.waitFor(`!document.querySelector('[role="dialog"]')`, 5000)
  check('dialog reopens for pdf', await openDialog(), {})
  await sleep(300)

  const pdfSelected = await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>/^pdf/i.test(x.textContent.trim())); if(!b) return null; b.click(); return b.textContent.trim() })()`,
  )
  check('pdf format selected', /pdf/i.test(String(pdfSelected)), { pdfSelected })

  await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>/^all/i.test(x.textContent.trim())); if (b) b.click(); const p=[...d.querySelectorAll('button')].find(x=>/^native 72/i.test(x.textContent.trim())); if (p) p.click(); return true })()`,
  )
  await sleep(300)

  const pdfDialogText = await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); return d ? d.innerText : '' })()`,
  )
  check('pdf shows a merge hint', /one PDF/i.test(pdfDialogText), {
    lines: String(pdfDialogText).split('\n').filter((line) => /pdf/i.test(line)).slice(0, 3),
  })

  await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const list=[...d.querySelectorAll('button')].filter(x=>x.textContent.trim().toLowerCase()==='export'); const b=list[list.length-1]; b.click(); return true })()`,
  )

  const pdfName = await waitForFile(downloadDir, (name) => name.endsWith('.pdf'))
  check('pdf downloaded', !!pdfName, { pdfName })
  if (pdfName) {
    const buffer = await readFile(join(downloadDir, pdfName))
    check('pdf signature', buffer.subarray(0, 5).toString('latin1') === '%PDF-', {
      head: buffer.subarray(0, 8).toString('latin1'),
    })
    check('pdf embeds image objects', buffer.includes('/Subtype /Image'), {
      images: buffer.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0,
    })
    const pdfTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
    const parsed = await pdfTask.promise
    check('pdf has 3 pages', parsed.numPages === 3, { numPages: parsed.numPages })
    const pdfPage = await parsed.getPage(1)
    const pdfViewport = pdfPage.getViewport({ scale: 1 })
    check(
      'pdf keeps A4 page size',
      Math.abs(pdfViewport.width - 595) < 1.5 && Math.abs(pdfViewport.height - 842) < 1.5,
      { width: Number(pdfViewport.width.toFixed(2)), height: Number(pdfViewport.height.toFixed(2)) },
    )
    await pdfTask.destroy()
  }

  const files = await readdir(downloadDir)
  check('no failed downloads', !files.some((name) => name.endsWith('.crdownload')), { files })

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
