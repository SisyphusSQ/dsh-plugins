import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const run = promisify(execFile)
const require = createRequire(import.meta.url)

test('public factory types accept the original service shape without workingDirectory', async () => {
  await run(process.execPath, [
    require.resolve('typescript/lib/tsc.js'),
    '-p', fileURLToPath(new URL('./fixtures/tsconfig.legacy.json', import.meta.url)),
    '--noEmit',
  ])
})
