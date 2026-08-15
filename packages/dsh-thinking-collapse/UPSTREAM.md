# Upstream provenance

## Compatibility snapshot

- DSH package line: `0.1.0-rc.6`
- Source repository: `deepseek-ai/deepseek-harness`
- Source commit: `47f943859bef60e4160492346772ded9b24f765a`
- Conversation npm integrity: `sha512-pKDKZYTRvO9pBTyHvVOtPDuTzNfCHwy7GmeIaRLjyCORLPM3uv0BuMc1qIHVI6LcK54l+cRGIuSSGah3bO/0vw==`
- Slots npm integrity: `sha512-F4VZA60bMRi4DAbZvNipM4E/Jl01QC0cQCPpeIEIh1/lq/y/bpc7IqujtzWESHPe3qSljTURip3hkANfsYs3UA==`

## Compatibility files

| Local file | Upstream source | Local delta |
| --- | --- | --- |
| `src/client/AssistantNodeView.tsx` | `packages/client/ui-conversation/src/client/chat/AssistantNodeView.tsx` | Reads plugin-owned Step timing and forwards `ctx.slots` plus the session kit so absorbed tools can dispatch official `tool.call.toolview` entries. |
| `src/client/AssistantMarkdown.tsx` | `packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx` | Groups consecutive reasoning and absorbable tool-call blocks into one activity row; leaves answer text outside; returns null for tools-only steps so the absorbed tool node can host the row. |
| `src/client/toolview.tsx` | (plugin-owned) | Looks up official keyed `tool.call.toolview` entries at runtime; does not re-declare that child slot. |
| `src/client/ToolCallTree.tsx` | `packages/client/ui-tool/src/client/tool/ToolCallTree.tsx` | Same subcall layout; uses runtime keyed lookup instead of `renderSlot`; unknown tools fall back to `JsonBlock` because `GenericToolCard` is not exported. |
| `src/client/image-labels.ts` | `packages/client/ui-conversation/src/client/image-labels.ts` | Keeps only the historical message-image label bridge used by this renderer. |
| `src/client/AssistantMarkdown.module.css` | upstream file with the same basename | Keeps the visible Assistant body and interruption marker rules. |
| `src/client/ReasoningRow.module.css` | upstream file with the same basename | Removes reasoning preview behavior, namespaces the running animation, and adds the activity/tool body layout. |
| `src/client/ToolCallTree.module.css` | `packages/client/ui-tool/src/client/tool/ToolCallTree.module.css` | Copies the official call-row and nested-subcall geometry. |
| `src/client/accessibility.module.css` | upstream file with the same basename | Unchanged visually-hidden utility. |

`ReasoningRow.tsx` is a replacement implementation rather than an unchanged
copy. It keeps the upstream `DisclosureRow` composition but implements the
plugin's forced-live and content-free collapsed states, and can host both
reasoning Markdown and absorbed tool trees.

`ToolCallNodeView.tsx` shadows the official `tool-call` Chat Node: absorbed
calls return `null` when the assistant-step already hosts the activity row;
a tools-only hidden assistant-step is hosted by the first absorbed root.

## Upgrade checklist

1. Pin the target DSH version and source commit.
2. Compare every upstream source listed above.
3. Compare `/client` public types and the `conversation.chat.node` slot contract, including `tool.call.toolview`.
4. Confirm keyed-slot lowest-priority shadowing still applies to both `assistant-step` and `tool-call`.
5. Reapply only the documented local deltas.
6. Run automated checks and a real DSH Web streaming verification that includes ordinary tool calls.
