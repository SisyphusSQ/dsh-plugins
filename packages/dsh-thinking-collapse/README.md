# dsh-thinking-collapse

English | [中文](README.zh.md)

Codex-style live activity collapse for the DeepSeek Harness Web chat view.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## Install

Requires Node.js 22 or later and `pnpm` on `PATH`:

```bash
dsh plugin --profile web add dsh-thinking-collapse@0.2.0
```

Remove it with `dsh plugin --profile web remove dsh-thinking-collapse`.

## What it does

The plugin replaces the chat view's `assistant-step` and `tool-call` renderers so each assistant turn has one outer activity row.

While the turn is still running — thoughts are streaming, or ordinary tools in this turn are still running, and no visible answer has appeared yet — the outer row stays open. Inner thoughts keep the DSH Think row: Think icon, title `Think`, first-line preview when collapsed, and the latest line while streaming. Official tool cards appear in time order. The outer title ticks as compact elapsed time, for example `已处理 2s`.

When the turn settles — the answer appears, or every tool in the turn has finished — the outer row folds to a duration title such as `耗时 2秒`. Expanding it still does not preview thoughts in the outer header; each inner Think row stays collapsed until you open it.

![Collapsed activity row](screenshots/collapsed.png)

![Expanded activity row](screenshots/expanded.png)

## Behavior

- One outer activity row per turn. All thoughts and ordinary tool calls in that turn go inside it.
- Inner thoughts keep the DSH Think row. They stay collapsed by default, including while streaming, and never show an inner elapsed title.
- Duration starts when thinking or the first tool in the turn starts, and continues until the last tool result or the answer appears. Time keeps counting while tools are still running.
- Ordinary tools (bash, read, search, web, todo, and similar) are drawn inside the outer activity body from the start of the stream. They do not first appear as standalone chat rows and then get absorbed.
- `ask_user_question` and approval prompts stay in the editor or their original chat seat.
- A tools-only turn still gets an activity row. When history cannot recover a duration, the title is `工具调用` / `Tool calls`; when there was thinking but no duration, it is `思考过程` / `Thoughts`.
- The outer collapsed row uses a trailing chevron and a header divider, without a thinking icon. Inner thoughts keep the DSH Think icon.
- Inner Think bodies match the upstream plain think text. Answers reuse DSH `MarkdownText`. Tools reuse the official `tool.call.toolview` cards, including Markdown, images, unknown blocks, file mentions, and interrupted markers.
- The assistant answer stays outside the activity row.
- The trajectory view, model requests, and session log are unchanged.

## Verification

The compatibility boundary and verification evidence are recorded in the [design document](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-thinking-collapse.md). The current compatibility baseline is `@deepseek-ai/dsh@0.1.0-rc.6`.

## License

MIT. Upstream notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
