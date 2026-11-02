// Copies the pdf.js runtime assets (CMaps for CJK encodings, standard fonts,
// wasm decoders and ICC profiles) into public/pdfjs so the app works fully
// offline and renders Chinese PDFs without falling back to a CDN.
//
// The copy is ~5 MB of files and runs on every `dev` / `build`, so it is
// skipped when the stamp still matches: same pdfjs-dist version, same folders.
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'pdfjs-dist')
const to = join(root, 'public', 'pdfjs')
const stampPath = join(to, '.stamp')
const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readVersion() {
  try {
    return JSON.parse(await readFile(join(from, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

if (!(await exists(from))) {
  console.error('[pdfjs-assets] node_modules/pdfjs-dist not found, run `npm install` first')
  process.exit(0)
}

const version = await readVersion()

if (version) {
  try {
    const stamp = JSON.parse(await readFile(stampPath, 'utf8'))
    const sameVersion = stamp.version === version
    const sameDirs = dirs.every((dir) => (stamp.dirs ?? []).includes(dir))
    const allPresent = (await Promise.all(dirs.map((dir) => exists(join(to, dir))))).every(Boolean)
    if (sameVersion && sameDirs && allPresent) {
      console.log(`[pdfjs-assets] up to date (pdfjs-dist ${version})`)
      process.exit(0)
    }
  } catch {
    // no stamp yet: fall through and copy
  }
}

await rm(to, { recursive: true, force: true })
await mkdir(to, { recursive: true })

const copied = []
for (const dir of dirs) {
  const src = join(from, dir)
  if (!(await exists(src))) continue
  await cp(src, join(to, dir), { recursive: true })
  copied.push(dir)
}

if (version) {
  await writeFile(stampPath, JSON.stringify({ version, dirs: copied }, null, 2) + '\n')
}

console.log('[pdfjs-assets] copied', copied.join(', '), '-> public/pdfjs')
