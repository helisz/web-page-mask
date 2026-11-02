/**
 * Runs the QA suites in parallel instead of one after another.
 *
 * Each suite starts its own headless Chrome, so they are independent; the only
 * shared resource is CPU (canvas rendering + pdf.js), hence the default
 * concurrency of 2.
 *
 * Usage:
 *   node scripts/qa-all.mjs                      # every suite
 *   node scripts/qa-all.mjs --only ui,mobile     # focused subset
 *   node scripts/qa-all.mjs --url http://localhost:5179/?demo=1 --concurrency 3
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const suites = {
  selftest: { script: 'scripts/qa.mjs', label: 'self-test (pixel pipeline + pdf)' },
  ui: { script: 'scripts/qa-ui.mjs', label: 'ui / interaction' },
  export: { script: 'scripts/qa-export.mjs', label: 'export (zip / pdf downloads)' },
  image: { script: 'scripts/qa-image.mjs', label: 'image input + export' },
  mobile: { script: 'scripts/qa-mobile.mjs', label: 'responsive (phone + tablet)' },
  demo: { script: 'scripts/qa-demo.mjs', label: 'demo seeding' },
}

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}

const url = flag('url', 'http://localhost:5179/?demo=1')
const concurrency = Math.max(1, Number(flag('concurrency', '2')))
const only = flag('only', '')
const names = only ? only.split(',').map((name) => name.trim()).filter(Boolean) : Object.keys(suites)

for (const name of names) {
  if (!suites[name]) {
    console.error(`unknown suite "${name}", pick from: ${Object.keys(suites).join(', ')}`)
    process.exit(2)
  }
}

function runSuite(name) {
  const { script } = suites[name]
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [script, url], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('close', (code) => {
      // every suite prints its own summary line; keep the last few for context
      const lines = output.trim().split(/\r?\n/).filter(Boolean)
      const summary = lines.reverse().find((line) => /ok[=:]|PASS|FAIL|steps?=/.test(line)) ?? ''
      resolve({ name, code, ms: Date.now() - started, summary, output, lines: lines.length })
    })
  })
}

const results = []
let cursor = 0
const workers = Array.from({ length: Math.min(concurrency, names.length) }, async () => {
  while (cursor < names.length) {
    const name = names[cursor++]
    const result = await runSuite(name)
    results.push(result)
    const mark = result.code === 0 ? 'PASS' : 'FAIL'
    console.log(`${mark} ${name.padEnd(8)} ${(result.ms / 1000).toFixed(1)}s  ${result.summary.slice(0, 90)}`)
  }
})

const started = Date.now()
await Promise.all(workers)
const total = ((Date.now() - started) / 1000).toFixed(1)

const failed = results.filter((result) => result.code !== 0)
if (failed.length > 0) {
  for (const result of failed) {
    console.log(`\n--- ${result.name} output ---`)
    console.log(result.output.trim().split(/\r?\n/).slice(-25).join('\n'))
  }
}

console.log(
  `\nok=${failed.length === 0} suites=${results.length} failed=${failed.map((result) => result.name).join(',') || 'none'} wall=${total}s`,
)
process.exit(failed.length === 0 ? 0 : 1)
