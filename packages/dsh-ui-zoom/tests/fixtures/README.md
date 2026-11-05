# Zoom regression fixtures

These are development-checkout fixtures, not a DSH profile, product-entry E2E, or proof of Desktop/WebKit support.

## Exact DSH 0.2.2-rc.1 anchored placement

The following files are unmodified copies from `deepseek-ai/deepseek-harness`, tag `dsh-v0.2.2-rc.1`:

| Local file | Original source | SHA-256 |
|---|---|---|
| `upstream-anchored-position.ts.txt` | [useAnchoredPosition.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-primitives/src/useAnchoredPosition.ts) | `801eac078f963dbdabf51bc6742fd273ae3328cb3725d2c6b63466e8897cdd25` |
| `overlay-top-margin.ts.txt` | [overlay-top-margin.ts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-primitives/src/overlay-top-margin.ts) | `94c769ceb7337056030da13a24a5031c2abee62f7ebde993924e5a1181e67599` |
| `upstream-menu.css` | [Menu.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-primitives/src/Menu.module.css) | `832c783823216c61adeebec7c120efc71467d3ca7f829137c03e84ae71446f45` |
| `upstream-LICENSE` | [LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/LICENSE) | `ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be` |

Copyright (c) 2026 DeepSeek. The upstream MIT license is retained in `upstream-LICENSE` and applies to these copied files. The `.ts.txt` suffix keeps the original source outside this package's TypeScript compilation; the browser runner transpiles it without editing its placement algorithm.

`../../scripts/anchored-browser.mjs` executes the exact hook with a controlled React effect/state adapter in real Chrome, alongside this package's built fixed-overlay corrector and the target menu CSS. Only effect scheduling/state publication and visualViewport inputs are controlled; all element layout, offsets, sizing and scrolling are real Chromium. It asserts viewport size caps, anchor-derived min-width, and internal scrolling; side/align geometry is reported separately. The adapter is not React lifecycle coverage and the simulated visual viewport is not a real on-screen keyboard or WebKit pinch-zoom test.

### Migration evidence and boundary

On Chrome 156.0.8078.80, the original corrector rendered a `576px` target-hook height cap at `864px` with 150% zoom, `1728px` at 300%, and `662.39px` at 115%. The native 100% control rendered `576px`. This is the RED regression for correcting target viewport-pixel limits. The fixed-offset unit regressions separately reproduce repeated division of an untouched coordinate, percentage/em corruption, and stale styles after unload.

The target hook combines rendered anchor rects with unzoomed `panel.offsetWidth/offsetHeight`. End alignment therefore still drifts under CSS zoom: in the original 150% control, panel right was `480.83px` versus anchor right `390px` (100% right was `259.55px` versus `260px`). The plugin does not replace that algorithm, infer a trigger from focus, or monkey-patch DOM geometry. There is no public DOM anchor/placement association in the hook. Its top/end alignment and clamp behavior are **not fully verified or fixed** by a passing size-cap fixture.

## Existing sidebar layout fixture

`browser-layout.html` retains its own MIT attribution to Better Sidebar 0.28.0. It checks viewport/body/sidebar layer dimensions, repeated document scrolling, independent inner wheel scrolling, and live stylesheet replacement at 50/100/115/150/300%. It does not load DSH or the complete Better Sidebar plugin.

## Host configuration fixture

`../host-runtime.test.ts` uses the installed Cordis 4.1 and DSH Settings service with the actual Zoom Host plugin. Only Loader settlement and the configuration directory are in-memory boundaries. It covers schema defaults, raw versus effective config, live updates reaching boot CSS, settings presentation policy, index-inject disposal and remount. It does not open a profile or test persisted settings writes. `../settings-order.test.tsx` executes the published target settings client factory against a controlled Remote wire to exercise click intent, refusal, disconnect and pending-write unload.
