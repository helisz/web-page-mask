import { readFile } from 'node:fs/promises'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const file = process.argv[2] ?? 'public/sample.pdf'
const data = new Uint8Array(await readFile(file))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise

for (let pageNumber = 1; pageNumber <= Math.min(3, doc.numPages); pageNumber++) {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  console.log(`\n== page ${pageNumber} (${viewport.width.toFixed(1)} x ${viewport.height.toFixed(1)}) ==`)
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue
    const [a, b, c, d, e, f] = item.transform
    const height = Math.hypot(b, d)
    console.log(
      JSON.stringify({
        text: item.str.slice(0, 28),
        x: Number(e.toFixed(1)),
        yTop: Number((viewport.height - f - height).toFixed(1)),
        w: Number(item.width.toFixed(1)),
        h: Number(height.toFixed(1)),
        nx: Number((e / viewport.width).toFixed(4)),
        ny: Number(((viewport.height - f - height) / viewport.height).toFixed(4)),
        nw: Number((item.width / viewport.width).toFixed(4)),
        nh: Number((height / viewport.height).toFixed(4)),
      }),
    )
  }
}
