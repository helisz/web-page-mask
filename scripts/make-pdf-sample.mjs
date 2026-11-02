/**
 * Produces a demo artifact: opens the seeded demo, exports a 3-page masked PDF
 * at 144 DPI, and stores it as `shots/masked-sample.pdf`.
 *
 * Usage: node scripts/make-pdf-sample.mjs [url]
 */
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { sleep, withChrome } from './lib/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5179/?demo=1&seed=1'
const downloadDir = join(process.cwd(), 'shots', 'downloads')
const target = join(process.cwd(), 'shots', 'masked-sample.pdf')

await rm(downloadDir, { recursive: true, force: true })
await mkdir(downloadDir, { recursive: true })

await withChrome(url, { downloadPath: downloadDir }, async (api) => {
  await api.waitFor(
    `(() => { const c = document.querySelector('[data-testid="page-canvas"]'); return !!c && c.width > 10 })()`,
    25_000,
  )

  await api.evaluate(
    `(() => { const b=[...document.querySelectorAll('header button')].find(x=>/export/i.test(x.textContent)); b.click(); return true })()`,
  )
  await api.waitFor(`!!document.querySelector('[role="dialog"]')`, 5000)
  await sleep(300)

  await api.evaluate(
    `(() => {
      const d = document.querySelector('[role="dialog"]')
      const pdf = [...d.querySelectorAll('button')].find((x) => /^pdf/i.test(x.textContent.trim()))
      pdf.click()
      const all = [...d.querySelectorAll('button')].find((x) => /^all/i.test(x.textContent.trim()))
      all.click()
      return true
    })()`,
  )
  await sleep(300)

  await api.evaluate(
    `(() => { const d=document.querySelector('[role="dialog"]'); const list=[...d.querySelectorAll('button')].filter(x=>x.textContent.trim().toLowerCase()==='export'); list[list.length-1].click(); return true })()`,
  )

  const start = Date.now()
  let file = null
  while (Date.now() - start < 60_000 && !file) {
    const files = await readdir(downloadDir).catch(() => [])
    file = files.find((name) => name.endsWith('.pdf') && !name.endsWith('.crdownload')) ?? null
    if (!file) await sleep(250)
  }
  if (!file) throw new Error('no PDF was downloaded')
  await copyFile(join(downloadDir, file), target)
  console.log(JSON.stringify({ ok: true, file: target }, null, 2))
})

await rm(downloadDir, { recursive: true, force: true })
