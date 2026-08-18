import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type OpenUrl = (url: string) => Promise<void>

export function assertHttpUrl(url: string): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`refusing to open a non-http authorization URL: ${parsed.protocol}`)
  }
  return parsed
}

export function createSystemUrlOpener(platform: NodeJS.Platform = process.platform): OpenUrl {
  return async (url) => {
    const parsed = assertHttpUrl(url)
    if (platform === 'darwin') {
      await execFileAsync('open', [parsed.toString()])
      return
    }
    if (platform === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', parsed.toString()])
      return
    }
    await execFileAsync('xdg-open', [parsed.toString()])
  }
}
