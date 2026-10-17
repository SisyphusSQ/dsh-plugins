import { readFile, writeFile } from 'node:fs/promises'

// Only the fixed package-local browser output is wrapped. Do not bundle the Host
// reader, transport/process plugins or prompt/config data into the browser entry.
const source = await readFile(new URL('../.client-build/index.cjs', import.meta.url), 'utf8')
const wrapped = [
  'window.__ModuleLoader__.load({ id: "@suqingsq/dsh-codex-bridge", factory: (require) => {',
  'var module = { exports: {} }; var exports = module.exports;',
  source,
  'return module.exports; } });',
  '',
].join('\n')
await writeFile(new URL('../lib/client.js', import.meta.url), wrapped)
