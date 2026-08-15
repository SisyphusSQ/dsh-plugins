/**
 * Lightweight recursive store watcher: fs.watch is non-recursive on macOS, so
 * we register watchers for the store dir and every plugin/skills/skill dir,
 * re-scanning the tree on each change so newly created plugin dirs get
 * watched too. Changes are debounced and coalesced into one `onChange` call.
 */
import { watch, type Dirent, type FSWatcher } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Watch one store directory tree.
 * @param storeDir - the store to watch (missing dir is tolerated).
 * @param onChange - debounced change callback.
 * @param debounceMs - coalescing window.
 * @returns disposer closing every watcher.
 */
export function watchStoreTree(storeDir: string, onChange: () => void, debounceMs = 200): () => void {
  const watchers = new Set<FSWatcher>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const fire = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void refresh().then(onChange)
    }, debounceMs)
  }

  const watchDir = (dir: string): void => {
    try {
      const w = watch(dir, { persistent: false }, () => fire())
      watchers.add(w)
    } catch {
      // directory disappeared or was never there; the next refresh re-checks
    }
  }

  const refresh = async (): Promise<void> => {
    watchDir(storeDir)
    let entries: Dirent[] = []
    try {
      entries = await readdir(storeDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(storeDir, entry.name)
      watchDir(pluginDir)
      const skillsDir = join(pluginDir, 'skills')
      watchDir(skillsDir)
      let skills: Dirent[] = []
      try {
        skills = await readdir(skillsDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const skill of skills) {
        if (skill.isDirectory()) watchDir(join(skillsDir, skill.name))
      }
    }
  }

  void refresh()

  return () => {
    if (timer !== undefined) clearTimeout(timer)
    for (const w of watchers) w.close()
    watchers.clear()
  }
}
