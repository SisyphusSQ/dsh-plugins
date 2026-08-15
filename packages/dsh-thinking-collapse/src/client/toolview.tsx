import { createElement, useSyncExternalStore } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { ClientContext, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeViewProps, ChatViewSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'

export type ToolViewSlots = Pick<ClientContext['slots'], 'entriesOfSlot' | 'subscribe' | 'getVersion'>

export type AtomicToolViewKit = {
  readonly t: ChatViewSlotProps['t']
  readonly sessionId: ChatNodeViewProps['sessionId']
  readonly useSession: ChatNodeViewProps['useSession']
  readonly useProjection: ChatNodeViewProps['useProjection']
  readonly useSessions: ChatNodeViewProps['useSessions']
  readonly useWorkspaces: ChatNodeViewProps['useWorkspaces']
  readonly useInput: ChatNodeViewProps['useInput']
  readonly inputActions: ChatNodeViewProps['inputActions']
}

export function atomicKitFromChatNode(props: ChatNodeViewProps): AtomicToolViewKit {
  return {
    t: props.t,
    sessionId: props.sessionId,
    useSession: props.useSession,
    useProjection: props.useProjection,
    useSessions: props.useSessions,
    useWorkspaces: props.useWorkspaces,
    useInput: props.useInput,
    inputActions: props.inputActions,
  }
}

export function UnknownToolFallback({
  toolName,
  block,
  t,
}: {
  readonly toolName: string
  readonly block: ToolCallBlock
  readonly t: ChatViewSlotProps['t']
}): ReactNode {
  const payload = 'kind' in block
    ? {
        name: toolName,
        args: block.call?.argsRaw ?? null,
        isError: block.isError,
        content: block.content,
      }
    : {
        name: toolName,
        args: block.argsRaw,
      }
  return (
    <JsonBlock
      label={toolName === '' ? t('message.unknownBlock') : toolName}
      payload={payload}
      truncatedLabel={total => t('json.truncated', { total })}
    />
  )
}

/**
 * Dispatch an already-declared `tool.call.toolview` entry without re-declaring
 * that child slot. Official ui-tool owns the declaration; duplicate children
 * fail loader apply.
 */
export function AtomicToolView({
  owner,
  kit,
  slots,
}: {
  readonly owner: ToolCallOwnerProps
  readonly kit: AtomicToolViewKit
  readonly slots: ToolViewSlots
}): ReactNode {
  const getVersion = (): number => slots.getVersion('tool.call.toolview')
  useSyncExternalStore(
    onStoreChange => slots.subscribe('tool.call.toolview', onStoreChange),
    getVersion,
    getVersion,
  )
  const entry = slots.entriesOfSlot('tool.call.toolview').find(
    item => item.options.key === owner.toolName,
  )
  const Comp = entry?.component
  if (Comp == null) {
    return <UnknownToolFallback toolName={owner.toolName} block={owner.block} t={kit.t} />
  }
  return createElement(Comp as ComponentType<object>, { ...kit, ...owner })
}
