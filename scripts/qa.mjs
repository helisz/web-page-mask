/**
 * Runs the in-page self test (src/dev/selftest.ts) and prints its report.
 * Usage: node scripts/qa.mjs [url] [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withChrome } from './lib/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5179/?demo=1&selftest=1'
const outDir = process.argv[3] ?? 'shots'

await mkdir(outDir, { recursive: true })

await withChrome(url, {}, async (api) => {
  const done = await api.waitFor('!!window.__SELFTEST__', 60_000)
  if (!done) {
    console.error('self test did not finish')
    console.log(api.consoleLog.slice(-25).join('\n'))
    const shot = await api.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(outDir, 'qa-fail.png'), Buffer.from(shot.data, 'base64'))
    process.exitCode = 1
    return
  }

  const report = await api.evaluate('window.__SELFTEST__')
  console.log(JSON.stringify(report, null, 2))
  if (api.consoleLog.length) {
    console.log('--- console ---')
    console.log(api.consoleLog.slice(-20).join('\n'))
  }

  const shot = await api.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, 'qa-selftest.png'), Buffer.from(shot.data, 'base64'))
  await writeFile(join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2))
  process.exitCode = report.ok ? 0 : 1
})
