import { copyFile } from 'node:fs/promises'

// Ship the same compatibility record as the repository, so packaged README
// links remain usable without referring to paths outside the installed package.
await copyFile(
  new URL('../../../docs/design/codex-home-bridge.md', import.meta.url),
  new URL('../lib/compatibility.md', import.meta.url),
)
