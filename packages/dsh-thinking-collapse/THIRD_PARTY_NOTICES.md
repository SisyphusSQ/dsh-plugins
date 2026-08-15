# Third-party notices

Parts of the browser renderer preserve behavior and structure from DeepSeek
Harness's `@deepseek-ai/dsh-client-ui-conversation` and
`@deepseek-ai/dsh-client-ui-tool` packages:

- `AssistantNodeView.tsx`
- `AssistantMarkdown.tsx`
- `ToolCallTree.tsx`
- `image-labels.ts`
- the CSS geometry used by the Assistant, reasoning, and tool-call rows

Source: <https://github.com/deepseek-ai/deepseek-harness>

Pinned source commit: `47f943859bef60e4160492346772ded9b24f765a`

DeepSeek Harness is distributed under the MIT License. Its copyright and
license terms are available in the upstream repository:
<https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/LICENSE>

The local changes replace reasoning summary and expansion behavior, absorb
ordinary tool-call Chat Nodes into the activity row, add a reasoning and
tool-activity timing projection, and rename CSS identifiers. See `UPSTREAM.md`
for the exact provenance and maintenance procedure.
