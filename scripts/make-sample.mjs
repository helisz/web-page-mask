/**
 * Rebuilds public/sample.pdf from scripts/sample-source.html using headless
 * Chrome. Usage: node scripts/make-sample.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'scripts', 'sample-source.html')
const output = join(root, 'public', 'sample.pdf')

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const chrome = candidates.find((path) => existsSync(path))
if (!chrome) {
  console.error('No Chrome/Edge binary found. Set CHROME_PATH to one.')
  process.exit(1)
}

if (existsSync(output)) rmSync(output)

const result = spawnSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-pdf-header-footer',
    `--print-to-pdf=${output}`,
    pathToFileURL(source).href,
  ],
  { stdio: 'ignore' },
)

if (!existsSync(output)) {
  console.error('PDF generation failed', result.error ?? result.status)
  process.exit(1)
}

console.log(`sample.pdf written (${statSync(output).size.toLocaleString()} bytes)`)
