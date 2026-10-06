import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: `ctx.slots` is merged by the renderer package since 0.2.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the session/global standard prop kit (`sessionId`, `useSessions`).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: `settings.section` and the standard settings props are declared by
// the settings package since 0.2; the removed client-runtime barrel used to
// carry them into the program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
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
import { createMainSessionStore } from './session-store.js'
import { createSettingsSection } from './SettingsSection.js'

export const name = 'codex-login-dock'

export const inject = ['slots', 'conversation', 'connection', 'locale', 'modelDirectories', 'remote', 'uiSession']

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

  // 0.2 removed `SessionListState.current`, so the root-scoped Settings row
  // cannot read the selected Session from `useSessions`. Mirror the renderer's
  // main-view binding into a registered store instead; the binding key is the
  // Session id retained by the main view.
  const mainSession = createMainSessionStore()
  let boundMain: BoundActions<typeof mainSession> | undefined
  const syncMainSession = (): void => {
    const binding = ctx.uiSession.adapter.current.getSnapshot()
    boundMain?.sync(binding.key as SessionId | undefined)
  }
  ctx.effect(
    () => ctx.uiSession.adapter.current.subscribe(() => { syncMainSession() }),
    'dsh-codex-login-dock: main session binding',
  )

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
    store: mainSession,
    inject: (actions: BoundActions<typeof mainSession>) => {
      boundMain = actions
      // Re-sync on registration so a selection made before this row mounted
      // is not lost; the store's equality guard drops duplicates.
      syncMainSession()
      return {}
    },
  }, SettingsSection))
}
