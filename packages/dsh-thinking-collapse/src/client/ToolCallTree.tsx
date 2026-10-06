import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AssistantChatData, ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallCommonProps, ToolCallHookContext, ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { toolCallName } from './activity.js'
import type { AtomicToolViewKit, ToolViewSlots } from './toolview.js'
import { AtomicToolView } from './toolview.js'
import css from './ToolCallTree.module.css'

export interface ToolCallTreeProps {
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  readonly block: ToolCallBlock
  /** This call's Step assistant source; a preparing call streams its raw arguments from it. */
  readonly assistant?: HostObservable<Readonly<AssistantChatData> | undefined> | undefined
  readonly cwd?: string | undefined
  readonly openFile: ChatNodeViewProps['openFile']
  readonly inspectCall: ChatNodeViewProps['inspectCall']
}

/** Split one Tool lifecycle value into the stage-discriminated owner share. */
function toolCallOwner(block: ToolCallBlock, common: ToolCallCommonProps): ToolCallOwnerProps {
  if ('kind' in block) return { ...common, phase: 'result', block }
  return block.phase === 'preparing'
    ? { ...common, phase: 'preparing', block }
    : { ...common, phase: 'start', block }
}

const ToolCall = memo(function ToolCall({
  slots,
  kit,
  callId,
  toolName,
  block,
  assistant,
  openFile,
  cwd,
  inspectCall,
  children,
}: {
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  readonly callId: string
  readonly toolName: string
  readonly block: ToolCallBlock
  readonly assistant?: HostObservable<Readonly<AssistantChatData> | undefined> | undefined
  readonly openFile: ChatNodeViewProps['openFile']
  readonly cwd?: string | undefined
  readonly inspectCall: ChatNodeViewProps['inspectCall']
  readonly children?: ReactNode
}) {
  const preparing = !('kind' in block) && block.phase === 'preparing'
  const hookContext = useMemo<ToolCallHookContext>(
    () => ({ callId, assistant: preparing ? assistant : undefined }),
    [assistant, callId, preparing],
  )
  const owner = useMemo<ToolCallOwnerProps>(() => toolCallOwner(block, {
    useDisclosure: kit.useDisclosure,
    callId,
    toolName,
    cwd,
    openFile,
    loadImage: kit.loadImage,
    inspect: inspectCall === undefined ? undefined : () => {
      inspectCall(callId)
    },
  }), [block, callId, cwd, inspectCall, kit.loadImage, kit.useDisclosure, openFile, toolName])

  return (
    <div
      className={css.callRow}
      data-chat-anchor-key={`call:${callId}`}
      data-chat-call-id={callId}
    >
      <AtomicToolView owner={owner} kit={kit} slots={slots} hookContext={hookContext} />
      {children}
    </div>
  )
})

const ToolCallBranch = memo(function ToolCallBranch({
  slots,
  kit,
  block,
  assistant,
  cwd,
  openFile,
  inspectCall,
}: ToolCallTreeProps) {
  return (
    <ToolCall
      slots={slots}
      kit={kit}
      callId={block.callId}
      toolName={toolCallName(block)}
      block={block}
      assistant={assistant}
      openFile={openFile}
      cwd={cwd}
      inspectCall={inspectCall}
    >
      {block.subCalls.length > 0
        ? (
            <div className={css.subCalls} data-subcalls>
              {block.subCalls.map((child: ToolCallBlock) => (
                <ToolCallBranch
                  key={child.callId}
                  slots={slots}
                  kit={kit}
                  block={child}
                  assistant={assistant}
                  cwd={cwd}
                  openFile={openFile}
                  inspectCall={inspectCall}
                />
              ))}
            </div>
          )
        : null}
    </ToolCall>
  )
})

/**
 * Root/subcall Tool composition. Official ToolCallTree is not exported from
 * ui-tool/client, and this plugin cannot re-declare `tool.call.toolview`.
 */
export function ToolCallTree(props: ToolCallTreeProps) {
  return <ToolCallBranch {...props} />
}
