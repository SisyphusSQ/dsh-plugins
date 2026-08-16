import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  LOGIN_DOCK_ID,
  LOGIN_DOCK_ORDER,
  SETTINGS_SECTION_ID,
  SETTINGS_SECTION_ORDER,
} from '../protocol.js'
import { createCodexAuthClient } from './api.js'
import { createLoginDock } from './LoginDock.js'
import { CODEX_LOGIN_NS, en, zh } from './locales.js'
import type { ModelDirectoriesFace } from './model.js'
import { createSettingsSection } from './SettingsSection.js'

export const name = 'codex-login-dock'

export const inject = ['slots', 'conversation', 'connection', 'locale', 'modelDirectories']

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(CODEX_LOGIN_NS, { zh, en }),
    'dsh-codex-login-dock: dictionaries',
  )
  const connection = ctx.get('connection') as ConnectionHandle
  const directories = ctx.get('modelDirectories') as ModelDirectoriesFace
  const api = createCodexAuthClient(connection.rpc)
  const onAuthChange = (listener: () => void): (() => void) => {
    const remote = ctx.remote as { $on: (event: string, listener: () => void) => () => void }
    const stopCredentials = remote.$on('credentials/updated', listener)
    const stopReset = ctx.on('connection/reset', listener)
    return () => {
      stopCredentials()
      stopReset()
    }
  }
  const LoginDock = createLoginDock({
    api,
    directories,
    blocks: ctx.conversation.blocks,
    onAuthChange,
  })
  const SettingsSection = createSettingsSection({
    api,
    onAuthChange,
  })
  const t = ctx.locale.bind(CODEX_LOGIN_NS)
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: LOGIN_DOCK_ID,
    order: LOGIN_DOCK_ORDER,
    locale: CODEX_LOGIN_NS,
  }, LoginDock))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SETTINGS_SECTION_ID,
    order: SETTINGS_SECTION_ORDER,
    label: () => t('nav.label'),
    locale: CODEX_LOGIN_NS,
  }, SettingsSection))
}
