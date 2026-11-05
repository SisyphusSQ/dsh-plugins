# dsh-ui-zoom

English | [中文](README.zh.md)

Whole-interface zoom for the DeepSeek Harness GUI, driven from a Settings row.

Version `0.2.0` targets DSH `0.2.2-rc.1`, Cordis `4.1.0`, and Node `>=24.9.0`. The declared DSH range is `>=0.2.2-rc.1 <0.3.0`; repository checks use the exact `0.2.2-rc.1` DSH dependency cohort, not every version admitted by that range. Package and browser fixtures are not a real DSH profile startup or product E2E.

## What it does

DeepSeek Harness ships one typography control — Appearance → Font size — and that one is scoped to conversation content only (`--dsh-content-font-size`, 10–22 px). Sidebars, settings pages, buttons and menus read a separate fixed `--dsw-*` token set that nothing scales.

This plugin scales the **entire interface** instead, from 50% to 300%, driven from **Settings → General → Interface zoom**: the row shows the current percentage with −/+ buttons and a reset. The setting is durable — it lives in the active profile's `ui-zoom` plugin configuration, so it survives reloads and travels with the profile.

Changes apply immediately, including rapid consecutive clicks. While the latest choice is still being saved, earlier Host refreshes do not replace that choice. After the ordered write settles, the row reconciles with the Host value and accepts external settings changes again. A refused or disconnected save restores the last known Host setting and shows an inline error.

## How the zoom is applied

The document element receives a CSS `zoom`:

```css
:root { zoom: 1.25 }
```

Two details are deliberate.

**The document element, not the application root.** Menus, modals, hover cards, toasts and the lightbox all mount through `createPortal` onto `document.body`. A rule scoped to `#root` would leave every overlay at its original size, so the zoom is applied one level higher where the whole page is inside it.

**`zoom`, not `transform: scale`.** `zoom` scales layout and hit-testing along with the content. Script-emitted viewport coordinates still need the correction below; zoom alone does not convert them. `transform: scale` would leave layout math in unzoomed space and create a new containing block for fixed-position descendants.

**Viewport units are divided back.** `zoom` multiplies absolute lengths, and viewport units are absolute: inside a subtree zoomed by `z`, a `100vh` box is laid out at the viewport height and then rendered `z x` taller, so the shell overflows by `(z - 1) x viewport` and bottom-anchored controls are pushed past the window edge. The injected sheet therefore sizes the shell to `100vh / z` and caps viewport-sized children, which cancels the multiplication exactly.

**Script-owned viewport pixels are rescaled.** A `MutationObserver` corrects explicit `px` offsets on fixed overlays and DSH's `--dsh-anchored-max-width` / `--dsh-anchored-max-height` visual-viewport limits. Anchor-derived inline minimum widths follow the same correction; unrelated design minimums and relative lengths (`%`, `em`, `calc(...)`) stay untouched. Each property is tracked independently, recalculated on live zoom changes, and restored on unload unless an external writer has replaced it. This does not replace the Host's placement algorithm.

**Better Sidebar's viewport layer is compensated too.** Its nested `data-dsh-panel-host` uses `100vh`, so it receives the same inverse-height correction. This keeps the layer viewport-sized instead of triggering its degraded positioning loop and growing the document's scrollable area.

The Host half injects the stylesheet through `webserver/index-inject` before any browser plugin runs, so the first paint is already zoomed. The client takes ownership of that same sheet, moves it after the shell stylesheet, updates it on each zoom change, and removes it on unload. Returning to 100% therefore cannot reactivate stale startup compensation.

## Configuration

The plugin owns the `ui-zoom` settings namespace. Its Cordis row accepts one field:

| Field | Default | Range | Meaning |
|---|---|---|---|
| `zoomPercent` | `100` | 50–300 | Whole-interface zoom in percent |

Deployments that want the interface permanently larger can set it as the profile default instead of using the row:

```yaml
- id: ui-zoom
  name: '@suqingsq/dsh-ui-zoom'
  config:
    zoomPercent: 125
```

## Relationship to the Font size setting

They are independent and multiply. A 125% interface zoom with a 16 px conversation font renders conversation text at an effective 20 px. The Settings row says so, so the two controls are not mistaken for each other.

## Verification

On the exact DSH `0.2.2-rc.1` dependency cohort, typechecking, bundling and the unit/registration suites run in this repository. The Host fixture uses real Cordis/Settings services to check raw versus effective config, defaults, updates and cleanup. Ordered-write tests execute the published settings client factory with a controlled Remote wire.

After building, `pnpm --filter @suqingsq/dsh-ui-zoom test:browser` runs real Chromium layout regressions from the development checkout, using an installed Chrome/Chromium (`CHROME_BIN` can select it). This is a developer entry requiring the dev toolchain, including TypeScript; it is not a consumer runtime command. It checks 50/100/115/150/300%, repeated document scrolling, inner wheel scrolling and live zoom changes. The anchored fixture additionally executes the exact target hook and menu CSS with a controlled effect/state adapter and visual viewport inputs, checking size caps, anchor-derived minimum widths and scroll reachability. Sources, hashes, license and the narrow evidence boundary are in [`tests/fixtures/README.md`](tests/fixtures/README.md).

These checks do not establish a real DSH Web/Desktop startup, full menu placement correctness or product E2E. The broader compatibility record remains in [`docs/design/dsh-ui-zoom.md`](../../docs/design/dsh-ui-zoom.md).

## License

MIT — see [LICENSE](LICENSE).
