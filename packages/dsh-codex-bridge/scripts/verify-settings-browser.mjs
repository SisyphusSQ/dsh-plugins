import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { once } from 'node:events'
import { build } from 'tsdown'

// Explicit opt-in browser fixture. No server/profile installation, real Home,
// cookies, accounts, secrets or network targets are needed.
const root = await mkdtemp(join(tmpdir(), 'codex-settings-browser-'))
const entry = fileURLToPath(new URL('../tests/fixtures/settings-browser.mjs', import.meta.url))
await build({ entry: { fixture: entry }, outDir: root, clean: false, format: 'iife', platform: 'browser', target: 'es2022', deps: { alwaysBundle: [/./] }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.MODE': '"production"', 'import.meta.env': '{"MODE":"production"}' }, logLevel: 'warn' })
const fixture = await readFile(join(root, 'fixture.iife.js'), 'utf8')
const shipped = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex Home 设置页 · fixture</title><style>
:root{--dsw-alias-label-primary:#171717;--dsw-alias-label-secondary:#666;--dsw-alias-label-tertiary:#888;--dsw-alias-border-l2:#e4e4e7;--dsw-alias-bg-layer-2:#fff;--dsw-alias-state-error-primary:#b42318;--dsw-alias-interactive-bg-hover:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}
:root.dark{--dsw-alias-label-primary:#f4f4f5;--dsw-alias-label-secondary:#b2b2b8;--dsw-alias-label-tertiary:#999;--dsw-alias-border-l2:#3d3d43;--dsw-alias-bg-layer-2:#202024;--dsw-alias-state-error-primary:#ff9990;--dsw-alias-interactive-bg-hover:#303035}
body{margin:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.shell{display:flex;max-width:1000px;margin:auto;min-height:100vh}.nav{width:188px;flex-shrink:0;padding:24px 12px;box-sizing:border-box;font-size:14px}.nav p{padding:10px 12px}.nav .selected{border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}main{flex:1;min-width:0;padding:28px 28px 40px}.fixture-label{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 16px}@media(max-width:600px){.nav{display:none}main{padding:20px 16px}}
</style><div class="shell"><aside class="nav"><h3>设置</h3><p>通用设置</p><p>模型</p><p>内置插件</p><p>Codex 订阅</p><p>Agent 预设</p><p class="selected">Codex Home</p></aside><main><p class="fixture-label">组件预览 · 模拟 Host 数据，非日常 GUI</p><div id="root"></div></main></div><script>${fixture.replace(/<\/script/giu, '<\\/script')}</script><script>${shipped.replace(/<\/script/giu, '<\\/script')}</script></html>`
await writeFile(join(root, 'preview.html'), html)

const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--remote-debugging-pipe', `--user-data-dir=${join(root, 'chrome-profile')}`], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
const exited = once(child, 'exit')
let stderr = ''
child.stderr.on('data', data => { stderr = (stderr + data).slice(-6000) })
const pending = new Map()
let sequence = 0, buffer = ''
child.stdio[4].setEncoding('utf8')
child.stdio[4].on('data', data => {
  buffer += data
  let separator
  while ((separator = buffer.indexOf('\0')) !== -1) {
    const row = JSON.parse(buffer.slice(0, separator)); buffer = buffer.slice(separator + 1)
    if (!row.id) continue
    const request = pending.get(row.id)
    if (!request) continue
    pending.delete(row.id); clearTimeout(request.timer)
    row.error ? request.reject(new Error(JSON.stringify(row.error))) : request.resolve(row.result)
  }
})
function send(method, params = {}, sessionId) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}; ${stderr}`)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
}
const checks = []
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const command = (method, params) => send(method, params, sessionId)
  await command('Page.enable')
  await command('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
  await command('Page.navigate', { url: pathToFileURL(join(root, 'preview.html')).href })
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception))
    return result.result.value
  }
  await evaluate(`new Promise((resolve,reject)=>{const limit=performance.now()+10000;function check(){if(window.settingsFixture?.store?.getSnapshot().catalogStatus==='ready')resolve(true);else if(performance.now()>limit)reject(Error('fixture not ready'));else requestAnimationFrame(check)}check()})`)
  const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  async function screenshot(name) {
    const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(join(root, `${name}.png`), Buffer.from(data, 'base64'))
  }
  assert.equal(await evaluate('document.querySelectorAll("[role=switch]").length'), 7)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await screenshot('light')
  checks.push('light layout: seven category switches, no horizontal overflow')

  await evaluate('document.querySelectorAll("[role=switch]")[5].click()')
  await settle()
  assert.deepEqual(await evaluate('[settingsFixture.writes.length,settingsFixture.confirms.length,document.querySelectorAll("[role=switch]")[5].checked]'), [0, 1, false])
  await evaluate('settingsFixture.authorize=true;document.querySelectorAll("[role=switch]")[5].click()')
  await settle()
  assert.deepEqual(await evaluate('settingsFixture.writes[0]'), ['connectMcp', true])
  assert.equal(await evaluate('document.querySelectorAll("[role=switch]")[5].checked'), true)
  checks.push('cancelled authorization never checks the switch; accepted category grant reaches Host boundary')

  await evaluate('settingsFixture.writeOutcome="refused";document.querySelectorAll("[role=switch]")[1].click()')
  await settle()
  assert.equal(await evaluate('document.querySelectorAll("[role=switch]")[1].checked'), true)
  assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /未被接受/)
  await evaluate('settingsFixture.writeOutcome="failed";document.querySelectorAll("[role=switch]")[1].click()')
  await settle()
  assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /保存失败/)
  checks.push('Host refusal and transport failure retain confirmed values and show actionable errors')

  await evaluate('settingsFixture.writeOutcome="accepted";settingsFixture.holdWrites=true;document.querySelectorAll("[role=switch]")[1].click()')
  await settle()
  assert.equal(await evaluate('[...document.querySelectorAll("input,button")].every(element=>element.disabled)'), true)
  await evaluate('settingsFixture.holdWrites=false;settingsFixture.releaseWrite()')
  await settle()
  checks.push('in-flight save disables all edits and diagnostic refresh')

  const writes = await evaluate('settingsFixture.writes.length')
  await evaluate(`(()=>{const input=document.querySelector('input[name=home]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'   ');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('button[type=submit]').click()})()`)
  await settle()
  assert.equal(await evaluate('settingsFixture.writes.length'), writes)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".ch-field-error")).display'), 'block')
  await evaluate(`(()=>{const input=document.querySelector('input[name=home]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'/new/fixture');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('button[type=submit]').click()})()`)
  await settle()
  assert.deepEqual(await evaluate('settingsFixture.writes.at(-1)'), ['home', '/new/fixture'])
  checks.push('whitespace directory is rejected inline; explicit valid save reaches Host boundary')

  await evaluate('settingsFixture.setConfig({writable:false})')
  await settle()
  assert.equal(await evaluate('[...document.querySelectorAll("input")].every(element=>element.disabled)'), true)
  assert.equal(await evaluate('document.querySelector(".ch-group-heading button").disabled'), false)
  await evaluate('settingsFixture.setConfig({writable:true});settingsFixture.readOutcome="loading"')
  await settle()
  await evaluate('document.querySelector(".ch-group-heading button").click()')
  await settle()
  assert.equal(await evaluate('document.querySelector("[aria-busy=true]")!==null && !document.querySelector(".ch-counts")'), true)
  await evaluate('settingsFixture.readOutcome="failed";settingsFixture.releaseRead()')
  await settle()
  assert.match(await evaluate('document.querySelector(".ch-diagnostics").textContent'), /读取失败/)
  await screenshot('failed')
  checks.push('read-only settings allow diagnostics; loading and failure hide stale counts')

  await evaluate('settingsFixture.readOutcome="ready";document.querySelector(".ch-group-heading button").click()')
  await settle()
  await evaluate('document.documentElement.classList.add("dark")')
  await screenshot('dark')
  const colors = await evaluate(`(()=>{const input=document.querySelector('[role=switch]:checked');return [getComputedStyle(input).backgroundColor,getComputedStyle(input,'::before').backgroundColor]})()`)
  const channel = value => value.match(/\d+/gu).slice(0,3).map(Number)
  assert.ok(Math.abs(channel(colors[0])[0] - channel(colors[1])[0]) > 100, `checked knob lacks contrast in dark theme: ${colors}`)
  checks.push('dark theme: switch thumb remains distinct from checked track')

  await command('Emulation.setDeviceMetricsOverride', { width: 360, height: 1200, deviceScaleFactor: 1, mobile: true })
  await evaluate('document.querySelectorAll("details").forEach(element=>element.open=true)')
  await settle()
  assert.equal(await evaluate('innerWidth'), 360, 'test must use a genuine mobile layout viewport, not the 980px default')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  assert.equal(await evaluate('document.querySelectorAll(".ch-list img").length'), 0)
  await screenshot('narrow')
  checks.push('360px expanded long paths/diagnostics wrap without overflow; untrusted markup remains text')

  await evaluate('document.querySelector("[role=switch]").focus()')
  const before = await evaluate('settingsFixture.writes.length')
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await settle()
  assert.equal(await evaluate('settingsFixture.writes.length'), before + 1)
  assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid')
  checks.push('keyboard Space toggles focused switch with a visible focus ring')
  await writeFile(join(root, 'report.json'), JSON.stringify({ scope: 'shipped browser wrapper + real React/store with fixture Host boundaries; not installed GUI E2E', checks, root }, null, 2))
  console.log(JSON.stringify({ status: 'passed', checks, artifacts: root }, null, 2))
} finally {
  for (const { timer } of pending.values()) clearTimeout(timer)
  if (child.exitCode === null) child.kill('SIGTERM')
  await exited
}
