/** Exact DSH 0.2.2-rc.1 placement in real Chromium, with a controlled effect/state adapter.
 * This is NOT a real DSH mount or React rendering test. See tests/fixtures/README.md.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const fixture = name => new URL(`../tests/fixtures/${name}`, import.meta.url)
const compiled = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

export async function runAnchoredBrowser({ evaluate, send, bootZoomStyle }) {
  const hook = await readFile(fixture('upstream-anchored-position.ts.txt'), 'utf8')
  const topMargin = await readFile(fixture('overlay-top-margin.ts.txt'), 'utf8')
  const menuCss = await readFile(fixture('upstream-menu.css'), 'utf8')
  const modules = {
    hook: compiled(hook),
    './overlay-top-margin.ts': compiled(topMargin),
    '../zoom.js': compiled(await readFile(new URL('../lib/zoom.js', import.meta.url), 'utf8')),
    './settings.js': compiled(await readFile(new URL('../lib/settings.js', import.meta.url), 'utf8')),
    corrector: compiled(await readFile(new URL('../lib/client/fixed-offsets.js', import.meta.url), 'utf8')),
  }
  console.log(`Exact target anchored hook sha256=${createHash('sha256').update(hook).digest('hex')}; controlled React adapter, NOT product E2E`)
  const failures = []
  for (const percent of [100, 150, 50, 300, 115]) {
    await evaluate('window.anchorRegression?.stop()')
    const { frameTree } = await send('Page.getFrameTree')
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html><head><style>
      html,body{margin:0;height:100%}body{font:14px system-ui;color:#17202a;background:#f2f4f6}
      ${menuCss}
      .anchor{position:absolute;left:100px;top:120px;width:160px;height:30px}
      .list{background:white;border:1px solid #aaa}.viewport{flex-shrink:1}.footer{height:28px;background:#e5edf7}
      .content{height:1400px;flex:none;padding:8px}.description{padding:20px}
      </style><style>${bootZoomStyle(percent)}</style></head><body><div class="description">DSH target anchor regression — ${percent}% (not product E2E)</div><button class="anchor">Menu anchor</button><div id="panel" class="list portal scrollable"><div class="viewport"><div class="content">Scrollable menu content</div></div><div class="footer">Pinned footer</div></div></body></html>` })
    await evaluate(`(() => {
      const sources = ${JSON.stringify(modules)};
      const exports = {};
      const panel = document.querySelector('#panel');
      const anchor = document.querySelector('.anchor');
      let cleanHook;
      let position = null;
      const react = {
        useState() { return [position, update => {
          position = typeof update === 'function' ? update(position) : update;
          if (position) { panel.style.left = position.left + 'px'; panel.style.top = position.top + 'px'; }
        }]; },
        useLayoutEffect(install) { cleanHook = install(); },
      };
      const load = name => {
        if (name === 'react') return react;
        if (exports[name]) return exports[name];
        const out = exports[name] = {};
        new Function('exports', 'require', sources[name])(out, load);
        return out;
      };
      // Simulated visual viewport dimensions/offsets isolate the keyboard-sized
      // viewport contract; no browser pinch-zoom engine is claimed here.
      const viewport = new EventTarget();
      Object.assign(viewport, { width: 800, height: 600, offsetLeft: 20, offsetTop: 40 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      const correction = load('corrector').installFixedOffsetCorrection(document, () => ${percent / 100});
      const place = (options = {}) => {
        cleanHook?.();
        position = null;
        panel.style.removeProperty('left'); panel.style.removeProperty('top');
        panel.style.width = options.stressWidth ? '1600px' : '';
        load('hook').useAnchoredPosition({ open:true, anchorRef:{current:anchor}, panelRef:{current:panel},
          side:'bottom', align:'start', gap:4, margin:12, frameClearance:false, ...options });
      };
      const rect = element => { const {left,top,right,bottom,width,height} = element.getBoundingClientRect(); return {left,top,right,bottom,width,height}; };
      window.anchorRegression = {
        place,
        async measure(options) {
          place(options);
          for (let i=0;i<8;i++) await new Promise(requestAnimationFrame);
          const scroller = panel.querySelector('.viewport');
          scroller.scrollTop = 80;
          const scrolled = scroller.scrollTop;
          scroller.scrollTop = 0;
          return { scrolled, placement:{side:options?.side ?? 'bottom',align:options?.align ?? 'start'}, panel:rect(panel), anchor:rect(anchor), heightLimit:panel.style.getPropertyValue('--dsh-anchored-max-height'),
            widthLimit:panel.style.getPropertyValue('--dsh-anchored-max-width'), minWidth:panel.style.minWidth, viewport:{width:viewport.width,height:viewport.height,left:viewport.offsetLeft,top:viewport.offsetTop,right:viewport.offsetLeft+viewport.width,bottom:viewport.offsetTop+viewport.height},
            scrollHeight:panel.querySelector('.viewport').scrollHeight, clientHeight:panel.querySelector('.viewport').clientHeight };
        },
        stop() { cleanHook?.(); correction.dispose(); },
        disposeCorrection() { correction.dispose(); },
      };
    })()`)
    const sample = await evaluate('anchorRegression.measure()')
    console.log(JSON.stringify({ anchored: percent, ...sample }))
    if (sample.panel.height > 578) failures.push(`${percent}%: anchored menu height ${sample.panel.height} exceeds 576px visual viewport capacity`)
    if (sample.panel.width > 778) failures.push(`${percent}%: anchored menu width ${sample.panel.width} exceeds 776px visual viewport capacity`)
    if (sample.clientHeight >= sample.scrollHeight || sample.scrolled < 79) failures.push(`${percent}%: tall menu must keep its internal scrolling`)
    const wide = await evaluate('anchorRegression.measure({stressWidth:true})')
    if (wide.panel.width > 778) failures.push(`${percent}%: wide menu ${wide.panel.width}px exceeds 776px visual viewport capacity`)
    console.log(JSON.stringify({ anchored:percent, stressWidth:true, ...wide }))
    await evaluate('anchorRegression.measure()')
    if (percent === 150 && process.env.ZOOM_BROWSER_SCREENSHOT) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(process.env.ZOOM_BROWSER_SCREENSHOT, Buffer.from(screenshot.data, 'base64'))
      console.log(`Fixture screenshot: ${process.env.ZOOM_BROWSER_SCREENSHOT}`)
    }
    // Geometry is reported separately rather than rewriting the host algorithm.
    for (const options of [{side:'top'}, {align:'end'}, {side:'right'}, {minWidthFromAnchor:true}]) {
      const result = await evaluate(`anchorRegression.measure(${JSON.stringify(options)})`)
      console.log(JSON.stringify({ anchored:percent, options, ...result }))
      if (options.minWidthFromAnchor && Math.abs(Number.parseFloat(result.minWidth) - 160) > 0.1) {
        failures.push(`${percent}%: anchor-derived min-width ${result.minWidth} must remain 160 CSS pixels`)
      }
    }
  }
  await evaluate('anchorRegression.stop()')
  assert.deepEqual(failures, [], 'target anchored viewport caps')
  console.log('PASS exact target hook viewport caps and internal scrolling')
}
