// Copies the pdf.js runtime assets (CMaps for CJK encodings, standard fonts,
// wasm decoders and ICC profiles) into public/pdfjs so the app works fully
// offline and renders Chinese PDFs without falling back to a CDN.
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'pdfjs-dist')
const to = join(root, 'public', 'pdfjs')
const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

if (!(await exists(from))) {
  console.error('[pdfjs-assets] node_modules/pdfjs-dist not found, run `npm install` first')
  process.exit(0)
}

await rm(to, { recursive: true, force: true })
await mkdir(to, { recursive: true })

for (const dir of dirs) {
  const src = join(from, dir)
  if (!(await exists(src))) continue
  await cp(src, join(to, dir), { recursive: true })
}

console.log('[pdfjs-assets] copied', dirs.join(', '), '-> public/pdfjs')
