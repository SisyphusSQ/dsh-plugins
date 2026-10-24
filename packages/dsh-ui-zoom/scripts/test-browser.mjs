#!/usr/bin/env node
/** Real Chrome layout regression for the built zoom stylesheet; NOT DSH E2E.
 * Run after building: node packages/dsh-ui-zoom/scripts/test-browser.mjs
 * Optional CHROME_BIN selects an existing Chrome/Chromium executable.
 * No server, dependency installation, business profile or source-plane imports.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = fileURLToPath(new URL('../', import.meta.url))
const artifact = new URL('../lib/zoom.js', import.meta.url)
const fixture = new URL('../tests/fixtures/browser-layout.html', import.meta.url)
const percentages = [50, 100, 115, 150, 300]
const viewport = { width: 1280, height: 900 }
const abort = new AbortController()
const deadline = setTimeout(() => abort.abort(new Error('Browser regression exceeded 90 seconds')), 90_000)
const onInterrupt = () => abort.abort(new Error('Browser regression interrupted'))
process.once('SIGINT', onInterrupt)
process.once('SIGTERM', onInterrupt)

let chrome
let chromeExit
let profile
let cdp
let stderr = ''
let cleanupError

async function chromeExecutable() {
  const candidates = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch { /* Try the next installed executable; never install one. */ }
  }
  throw new Error('No installed Chrome found; set CHROME_BIN to an existing executable')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let nextId = 0
    const fail = error => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error) }
      pending.clear()
      reject(error)
    }
    socket.addEventListener('error', () => fail(new Error('Chrome CDP WebSocket failed')))
    socket.addEventListener('close', () => fail(new Error('Chrome CDP WebSocket closed')))
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    })
    const onAbort = () => { fail(abort.signal.reason); socket.close() }
    abort.signal.addEventListener('abort', onAbort, { once: true })
    socket.addEventListener('open', () => resolve({
      async send(method, params = {}, sessionId) {
        abort.signal.throwIfAborted()
        return new Promise((resolveCommand, rejectCommand) => {
          const id = ++nextId
          const timer = setTimeout(() => {
            pending.delete(id)
            rejectCommand(new Error(`CDP command timed out: ${method}`))
          }, 10_000)
          pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer })
          socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
      },
      close() {
        abort.signal.removeEventListener('abort', onAbort)
        socket.close()
      },
    }), { once: true })
  })
}

function checkLayout(sample, label, failures) {
  const near = (actual, expected, name) => {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > 2) {
      failures.push(`${label}: ${name}=${actual}, expected ${expected} ±2px`)
    }
  }
  for (const name of ['body', 'frame', 'layer']) {
    near(sample[name].x, 0, `${name}.x`)
    near(sample[name].y, 0, `${name}.y`)
    near(sample[name].width, viewport.width, `${name}.width`)
    near(sample[name].height, viewport.height, `${name}.height`)
  }
  near(sample.panel.right, viewport.width, 'panel.right')
  near(sample.panel.bottom, viewport.height, 'panel.bottom')
  // A correct-looking body can coexist with html's own zoomed 100% height.
  // Inspect the actual scrolling element; do not hide overflow in the fixture.
  if (sample.html.scrollHeight > sample.html.clientHeight + 2
    || sample.html.scrollWidth > sample.html.clientWidth + 2) {
    failures.push(`${label}: document overflow ${sample.html.scrollWidth}x${sample.html.scrollHeight} > ${sample.html.clientWidth}x${sample.html.clientHeight} (html rect ${sample.html.width}x${sample.html.height}, overflow=${sample.html.overflow})`)
  }
  if (sample.degraded || sample.syncFrames > 0) failures.push(`${label}: unexpected Better Sidebar degraded loop (${sample.syncFrames} frames)`)
}

async function cleanup() {
  // Browser.close lets Chrome reap its own renderer/utility processes first.
  if (cdp && !abort.signal.aborted) {
    try { await cdp.send('Browser.close') } catch { /* Transport can close before its reply. */ }
  }
  cdp?.close()
  if (chrome?.pid) {
    const exited = await Promise.race([chromeExit.then(() => true), new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 2500)
      timer.unref()
    })])
    if (!exited) {
      try { process.kill(process.platform === 'win32' ? chrome.pid : -chrome.pid, 'SIGTERM') }
      catch (error) { if (error.code !== 'ESRCH') throw error }
      await Promise.race([chromeExit, new Promise(resolve => setTimeout(resolve, 1500))])
    }
    // Kill only the detached process group owned by this run, never an existing
    // user Chrome process. This also catches children left after a parent exit.
    try {
      process.kill(process.platform === 'win32' ? chrome.pid : -chrome.pid, 'SIGKILL')
    } catch (error) { if (error.code !== 'ESRCH') throw error }
    await chromeExit
  }
  if (profile) {
    // Verify the resolved deletion target belongs to this run's temporary root.
    const resolved = await realpath(profile)
    const tempRoot = await realpath(tmpdir())
    assert.equal(dirname(resolved), tempRoot)
    assert.ok(basename(resolved).startsWith('dsh-ui-zoom-browser-'))
    assert.equal(resolved, profile)
    await rm(resolved, { recursive: true, force: true })
  }
  console.log('CLEANUP Chrome process group released; temporary profile removed')
}

try {
  assert.equal(typeof WebSocket, 'function', 'Use Node 22+ with built-in WebSocket')
  await access(artifact)
  const { bootZoomStyle } = await import(artifact.href)
  const html = await readFile(fixture, 'utf8')
  const artifactHash = createHash('sha256').update(await readFile(artifact)).digest('hex').slice(0, 12)
  const executable = await chromeExecutable()
  profile = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'dsh-ui-zoom-browser-')))
  chrome = spawn(executable, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { cwd: packageDir, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'] })
  chromeExit = new Promise(resolve => { chrome.once('exit', resolve); chrome.once('error', resolve) })
  const endpoint = await new Promise((resolve, reject) => {
    const onAbort = () => reject(abort.signal.reason)
    abort.signal.addEventListener('abort', onAbort, { once: true })
    chrome.once('error', reject)
    chrome.once('exit', code => reject(new Error(`Chrome exited before CDP was ready (${code}): ${stderr.slice(-1000)}`)))
    chrome.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-4000)
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { abort.signal.removeEventListener('abort', onAbort); resolve(match[1]) }
    })
  })
  cdp = await connect(endpoint)
  const version = await cdp.send('Browser.getVersion')
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => cdp.send(method, params, sessionId)
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(`Fixture exception: ${JSON.stringify(result.exceptionDetails)}`)
    return result.result.value
  }
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })
  console.log(`Browser layout regression ONLY (not full DSH E2E); ${version.product}; built lib/zoom.js sha256=${artifactHash}`)
  const failures = []
  for (const percent of percentages) {
    await evaluate('window.layoutRegression?.stop()')
    const { frameTree } = await send('Page.getFrameTree')
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: html.replace('/*__ZOOM_CSS__*/', bootZoomStyle(percent)) })
    await evaluate('layoutRegression.frames(16)')
    const before = await evaluate('layoutRegression.measure()')
    assert.deepEqual(before.viewport, viewport, 'CDP viewport must match the independent expected dimensions')
    checkLayout(before, `${percent}% initial`, failures)
    const positions = await evaluate('layoutRegression.probeDocumentScroll()')
    const maxScroll = Math.max(...positions.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]))
    if (maxScroll > 2) failures.push(`${percent}%: repeated document scroll moved ${maxScroll}px`)
    const inner = await evaluate('layoutRegression.probeInnerScroll()')
    for (const [name, steps] of Object.entries(inner)) {
      if (steps.length !== 4 || steps.some((value, index) => value < (index + 1) * 79)) {
        failures.push(`${percent}%: inner ${name} stopped scrolling: ${JSON.stringify(steps)}`)
      }
    }
    const wheel = {}
    for (const [name, point] of [
      ['mainScroll', { x: 40, y: 60 }],
      ['panelScroll', { x: (before.panel.x + before.panel.right) / 2, y: (before.panel.y + before.panel.bottom) / 2 }],
    ]) {
      const start = (await evaluate('layoutRegression.measure()'))[name]
      for (let step = 0; step < 4; step += 1) {
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 80 })
        await evaluate('layoutRegression.frames(6)')
      }
      wheel[name] = (await evaluate('layoutRegression.measure()'))[name] - start
      if (wheel[name] <= 0) failures.push(`${percent}%: real CDP wheel did not scroll ${name}`)
    }
    const after = await evaluate('layoutRegression.measure()')
    checkLayout(after, `${percent}% after scrolling`, failures)
    // Deliberately narrow evidence: no screenshots, full DOM, profile data or logs.
    console.log(JSON.stringify({ percent, viewport: before.viewport, frame: before.frame, layer: before.layer, panel: before.panel, html: before.html, degraded: before.degraded, syncFrames: after.syncFrames, maxDocumentScroll: maxScroll, inner, wheel }))
  }
  // Exercise live replacement without a reload, including return to neutral.
  for (const percent of [150, 50, 300, 115, 100]) {
    await evaluate(`layoutRegression.update(${JSON.stringify(bootZoomStyle(percent))})`)
    checkLayout(await evaluate('layoutRegression.measure()'), `${percent}% live update`, failures)
  }
  if (failures.length) throw new Error(`Layout regression failed (${failures.length} assertions):\n${failures.join('\n')}`)
  console.log(`PASS ${percentages.join('/')}% initial + live updates, viewport/panel/document geometry, repeated document scroll, main/panel inner scrolling`)
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  try { await cleanup() } catch (error) { cleanupError = error; console.error('CLEANUP FAILED:', error); process.exitCode = 1 }
  clearTimeout(deadline)
  process.removeListener('SIGINT', onInterrupt)
  process.removeListener('SIGTERM', onInterrupt)
  if (cleanupError) console.error('Inspect the Chrome process/profile resources reported above before retrying')
}
