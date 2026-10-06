# dsh-ui-zoom

English | [中文](README.zh.md)

Whole-interface zoom for the DeepSeek Harness GUI, driven from the keyboard and from a Settings row.

Verified with `@deepseek-ai/dsh@0.2.0-rc.2` on the macOS Desktop profile: cold start loads the row, and the whole interface scales from it.

## What it does

DeepSeek Harness ships one typography control — Appearance → Font size — and that one is scoped to conversation content only (`--dsh-content-font-size`, 10–22 px). Sidebars, settings pages, buttons and menus read a separate fixed `--dsw-*` token set that nothing scales.

This plugin scales the **entire interface** instead, from 50% to 300%, driven from **Settings → General → Interface zoom**: the row shows the current percentage with −/+ buttons and a reset. The setting is durable — it lives in the Host user-settings document, so it survives reloads and travels with the profile.

## How the zoom is applied

The document element receives a CSS `zoom`:

```css
:root { zoom: 1.25 }
```

Two details are deliberate.

**The document element, not the application root.** Menus, modals, hover cards, toasts and the lightbox all mount through `createPortal` onto `document.body`. A rule scoped to `#root` would leave every overlay at its original size, so the zoom is applied one level higher where the whole page is inside it.

**`zoom`, not `transform: scale`.** `zoom` multiplies used values, so layout, hit-testing, anchor positioning and the drag regions resolve inside the same coordinate space. `transform: scale` would leave layout math in unzoomed space and create a new containing block for fixed-position descendants.

**Viewport units are divided back.** `zoom` multiplies absolute lengths, and viewport units are absolute: inside a subtree zoomed by `z`, a `100vh` box is laid out at the viewport height and then rendered `z x` taller, so the shell overflows by `(z - 1) x viewport` and bottom-anchored controls are pushed past the window edge. The injected sheet therefore sizes the shell to `100vh / z` and caps viewport-sized children, which cancels the multiplication exactly.

**Script-positioned overlays are rescaled.** A `getBoundingClientRect()` result is reported in the rendered space, so writing one into the inline `left`/`top`/`bottom`/`right` of a `position: fixed` box applies the factor a second time and the overlay drifts from its trigger. A `MutationObserver` divides those inline offsets by the factor, once per external write; anything positioned from a stylesheet carries no inline offset and is never touched.

The Host half injects the stylesheet through `webserver/index-inject` before any browser plugin runs, so the first paint is already zoomed and the shell never flashes at 100%.

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

Type-checking, bundling and the unit/registration suites run in this repository. The compatibility boundary, the verification record and the known limits are kept in [`docs/design/dsh-ui-zoom.md`](../../docs/design/dsh-ui-zoom.md).

## License

MIT — see [LICENSE](LICENSE).
