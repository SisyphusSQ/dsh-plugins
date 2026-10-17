// Opt-in source fixture preparation, not installation or product startup.
// Usage: node scripts/prepare-native-role.mjs /absolute/path/to/app.asar
import { open, readFile, mkdir, writeFile, mkdtemp, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const archive = process.argv[2]
if (!archive || !isAbsolute(archive)) throw new Error('Supply an explicit absolute desktop app.asar path; no default profile or credential access.')
// 0.2.1 folds the former in-process driver into the spawn provider.
const names = ['dsh-agent-loop', 'dsh-subagent-spawn-in-process']
const require = createRequire(new URL('../package.json', import.meta.url))
const bridge = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const target = bridge.devDependencies['@deepseek-ai/dsh-agent']
if (typeof target !== 'string') throw new Error('The bridge must pin its exact DSH target in devDependencies')
const locations = new Map(), seen = new Set()
async function visit(from, name) {
  let path
  try { path = from.resolve(name + '/package.json') } catch { return }
  if (seen.has(path)) return
  seen.add(path)
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  if (name.startsWith('@deepseek-ai/dsh-') && manifest.version !== target) throw new Error('Mixed DSH version: ' + name)
  locations.set(name, dirname(path))
  for (const child of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) await visit(createRequire(path), child)
}
for (const name of Object.keys({ ...bridge.dependencies, ...bridge.devDependencies, ...bridge.peerDependencies })) await visit(require, name)
const source = await open(archive, 'r')
const provenance = []
let root
try {
  const header = Buffer.alloc(16)
  await source.read(header, 0, 16, 0)
  const jsonBytes = header.readUInt32LE(12)
  if (jsonBytes < 1 || jsonBytes > 32 * 1024 * 1024) throw new Error('Unsupported ASAR header')
  const raw = Buffer.alloc(jsonBytes)
  await source.read(raw, 0, jsonBytes, 16)
  const tree = JSON.parse(raw.toString('utf8'))
  const dataBase = 8 + header.readUInt32LE(4)
  root = await mkdtemp(join(tmpdir(), 'dsh-native-role-source-'))
  for (const name of names) {
    const entry = tree.files?.dsh?.files?.node_modules?.files?.['@deepseek-ai']?.files?.[name]
    if (!entry?.files) throw new Error('Public implementation not bundled: ' + name)
    const destination = join(root, name)
    async function extract(node, relative = '') {
      for (const [part, item] of Object.entries(node.files ?? {})) {
        if (!part || part === '.' || part === '..' || part.includes('/') || part.includes('\\')) throw new Error('Invalid archive component')
        const path = relative ? relative + '/' + part : part
        if (item.files) { await extract(item, path); continue }
        if (item.link || item.unpacked || !Number.isSafeInteger(item.size) || item.size > 8 * 1024 * 1024) throw new Error('Unsupported source archive entry')
        const bytes = Buffer.alloc(item.size)
        const offset = Number(item.offset)
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid source offset')
        const read = await source.read(bytes, 0, bytes.length, dataBase + offset)
        if (read.bytesRead !== bytes.length) throw new Error('Truncated source archive')
        await mkdir(dirname(join(destination, path)), { recursive: true })
        await writeFile(join(destination, path), bytes)
        provenance.push({ package: name, file: path, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
    await extract(entry)
    const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))
    if (manifest.name !== '@deepseek-ai/' + name || manifest.version !== target) throw new Error('Implementation identity/version mismatch')
    locations.set(manifest.name, destination)
  }
  for (const name of names) {
    const destination = join(root, name)
    const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      const target = locations.get(dependency)
      if (!target) throw new Error('Missing declared dependency: ' + dependency)
      const link = join(destination, 'node_modules', dependency)
      await mkdir(dirname(link), { recursive: true })
      await symlink(target, link)
    }
  }
  await writeFile(join(root, 'provenance.json'), JSON.stringify({ target, provenance }, null, 2) + '\n')
  console.log(JSON.stringify({ implementationRoot: root, target, source: 'desktop public implementation files; not a profile install', files: provenance.length }))
} finally { await source.close() }
