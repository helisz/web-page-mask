import { spawn } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Launch headless Chrome with CDP attached and hand a small API to `task`.
 * `options.downloadPath` enables downloads into that folder.
 */
export async function withChrome(url, options, task) {
  const port = 9500 + Math.floor(Math.random() * 400)
  const profile = await mkdtemp(join(tmpdir(), 'chrome-qa-'))
  const width = options.width ?? 1440
  const height = options.height ?? 900

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ]
  if (options.downloadPath) await mkdir(options.downloadPath, { recursive: true })

  const chrome = spawn(CHROME, args, { stdio: 'ignore' })

  let target = null
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await response.json()
      target = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) break
    } catch {
      /* not up yet */
    }
    await sleep(150)
  }
  if (!target) throw new Error('could not reach Chrome DevTools')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })

  let nextId = 1
  const pending = new Map()
  const consoleLog = []

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
      return
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      consoleLog.push(
        `${message.params.type}: ${message.params.args
          .map((arg) => arg.value ?? arg.description ?? arg.type)
          .join(' ')}`,
      )
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      consoleLog.push(
        `exception: ${details.exception?.description ?? details.text ?? 'unknown'}`.slice(0, 800),
      )
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('DOM.enable')

  if (options.emulate) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: options.emulate.width,
      height: options.emulate.height,
      deviceScaleFactor: options.emulate.dpr ?? 2,
      mobile: options.emulate.mobile ?? true,
    })
    await send('Emulation.setTouchEmulationEnabled', { enabled: options.emulate.mobile ?? true })
  }

  if (options.downloadPath) {
    try {
      await send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: options.downloadPath,
        eventsEnabled: true,
      })
    } catch (error) {
      console.warn('setDownloadBehavior failed:', error.message)
    }
  }

  const rawEvaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          'evaluation failed',
      )
    }
    return result.result.value
  }

  // the first evaluate can land in the about:blank context, which disappears
  // on navigation; retry a few times before giving up
  const evaluate = async (expression) => {
    let lastError = null
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await rawEvaluate(expression)
      } catch (error) {
        lastError = error
        if (!/context was destroyed|Cannot find context|Inspected target navigated/i.test(String(error))) {
          throw error
        }
        await sleep(250)
      }
    }
    throw lastError
  }

  const api = {
    send,
    evaluate,
    consoleLog,
    width,
    height,
    async waitFor(expression, timeout = 30_000) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        if (await evaluate(expression)) return true
        await sleep(200)
      }
      return false
    },
  }

  // navigate once emulation is in place so that media queries see the device
  await send('Page.navigate', { url })
  await api.waitFor(`document.readyState === 'complete'`, 20_000)
  await sleep(150)

  try {
    return await task(api)
  } finally {
    socket.close()
    chrome.kill()
  }
}
