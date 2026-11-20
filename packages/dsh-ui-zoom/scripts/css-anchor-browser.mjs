/** DSH rc.5 menu CSS in real Chromium, without a DSH runtime or React mount. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

export async function runCssAnchorBrowser({ evaluate, send, bootZoomStyle, viewport }) {
  const css = await readFile(new URL('../tests/fixtures/upstream-rc5-menu.css', import.meta.url), 'utf8')
  for (const percent of [100, 115, 150, 300, 50]) {
    const { frameTree } = await send('Page.getFrameTree')
    await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html><head><style>${css}
      body{margin:0;font:14px system-ui;background:#f2f4f6}.trigger{position:absolute;left:24px;top:10px;anchor-name:--test-menu}
      .portal{position-anchor:--test-menu}.list,.submenu{background:#fff}.menu-content{height:2000px;padding:8px;flex:none}
      </style><style>${bootZoomStyle(percent)}</style></head><body>
      <button class="trigger">Menu trigger</button>
      <div class="list portal scrollable" data-anchor-side="bottom" data-anchor-align="start">
      <div class="viewport"><div class="menu-content">Scrollable menu content</div></div><div class="footer" id="footer">Menu footer</div></div>
      </body></html>` })
    const sample = await evaluate(`(async () => {
      await new Promise(requestAnimationFrame);
      const menu = document.querySelector('.list');
      const scroller = document.querySelector('.viewport');
      scroller.scrollTop = 80;
      const box = element => element.getBoundingClientRect().toJSON();
      return { anchors: CSS.supports('position-anchor: --test-menu'), menu: box(menu), footer: box(document.querySelector('#footer')), scrollTop: scroller.scrollTop };
    })()`)
    console.log(JSON.stringify({ cssAnchor: percent, ...sample }))
    assert.ok(sample.anchors, 'Chromium must support CSS anchors')
    assert.ok(sample.menu.top >= 0 && sample.menu.left >= 0 && sample.menu.right <= viewport.width && sample.footer.bottom <= viewport.height,
      `${percent}%: CSS-anchored menu and footer must stay in the layout viewport`)
    assert.ok(sample.scrollTop >= 79, `${percent}%: tall menu must keep its internal scrolling`)
    if (percent === 150 && process.env.ZOOM_CSS_ANCHOR_SCREENSHOT) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(process.env.ZOOM_CSS_ANCHOR_SCREENSHOT, Buffer.from(screenshot.data, 'base64'))
    }
  }
}
