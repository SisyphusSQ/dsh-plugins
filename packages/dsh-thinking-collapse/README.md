# dsh-thinking-collapse

English | [中文](README.zh.md)

Codex-style live activity collapse for the DeepSeek Harness Web chat view.

Verified with `@deepseek-ai/dsh@0.1.0-rc.6`.

## Install

Requires Node.js 22 or later and `pnpm` on `PATH`:

```bash
dsh plugin --profile web add dsh-thinking-collapse@0.1.0
```

Remove it with `dsh plugin --profile web remove dsh-thinking-collapse`.

## What it does

The plugin replaces the chat view's `assistant-step` and `tool-call` renderers so each model step has at most one activity row.

While the step is still running — thoughts are streaming, or ordinary tools in this step are still running, and no visible answer has appeared yet — the row stays open. It shows thinking Markdown and the official tool tree in block order. The title ticks as compact elapsed time, for example `已处理 2s`.

When the step settles — the answer appears, or every tool in the step has finished — the row folds to a duration title such as `耗时 2秒`. The collapsed header does not preview thoughts or commands.

Click the row to expand it. The title stays the duration; thoughts and official tool cards appear below a divider. Click again to collapse.

![Collapsed activity row](screenshots/collapsed.png)

![Expanded activity row](screenshots/expanded.png)

## Behavior

- One activity row per step. A turn with several steps can show several duration rows.
- Duration starts when thinking or the first tool in the step starts, and continues until the last tool result or the answer appears. Time keeps counting while tools are still running.
- Ordinary tools (bash, read, search, web, todo, and similar) are drawn inside the activity body from the start of the stream. They do not first appear as standalone chat rows and then get absorbed.
- `ask_user_question` and approval prompts stay in the editor or their original chat seat.
- A tools-only step still gets an activity row. When history cannot recover a duration, the title is `工具调用` / `Tool calls`; when there was thinking but no duration, it is `思考过程` / `Thoughts`.
- Collapsed rows use a trailing chevron and a header divider, without a thinking icon.
- Expanded content reuses DSH `MarkdownText` and the official `tool.call.toolview` cards, including Markdown, images, unknown blocks, file mentions, and interrupted markers.
- The assistant answer stays outside the activity row.
- The trajectory view, model requests, and session log are unchanged.

## Verification

The compatibility boundary and verification evidence are recorded in the [design document](https://github.com/SisyphusSQ/dsh-plugins/blob/main/docs/design/dsh-thinking-collapse.md). The current compatibility baseline is `@deepseek-ai/dsh@0.1.0-rc.6`.

## License

MIT. Upstream notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
