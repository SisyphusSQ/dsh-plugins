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
| `src/client/AssistantNodeView.tsx` | `packages/client/ui-conversation/src/client/chat/AssistantNodeView.tsx` | Reads plugin-owned Step timing and passes it to the Markdown renderer. |
| `src/client/AssistantMarkdown.tsx` | `packages/client/ui-conversation/src/client/chat/AssistantMarkdown.tsx` | Passes block timing and live state to the replacement ReasoningRow. |
| `src/client/image-labels.ts` | `packages/client/ui-conversation/src/client/image-labels.ts` | Keeps only the historical message-image label bridge used by this renderer. |
| `src/client/AssistantMarkdown.module.css` | upstream file with the same basename | Keeps the visible Assistant body and interruption marker rules. |
| `src/client/ReasoningRow.module.css` | upstream file with the same basename | Removes reasoning preview behavior and namespaces the running animation. |
| `src/client/accessibility.module.css` | upstream file with the same basename | Unchanged visually-hidden utility. |

`ReasoningRow.tsx` is a replacement implementation rather than an unchanged
copy. It keeps the upstream `DisclosureRow` composition but implements the
plugin's forced-live and content-free collapsed states.

## Upgrade checklist

1. Pin the target DSH version and source commit.
2. Compare every upstream source listed above.
3. Compare `/client` public types and the `conversation.chat.node` slot contract.
4. Confirm keyed-slot lowest-priority shadowing still applies.
5. Reapply only the documented local deltas.
6. Run automated checks and a real DSH Web streaming verification.
