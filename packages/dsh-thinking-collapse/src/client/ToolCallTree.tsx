import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { toolCallName } from './activity.js'
import type { AtomicToolViewKit, ToolViewSlots } from './toolview.js'
import { AtomicToolView } from './toolview.js'
import css from './ToolCallTree.module.css'

export interface ToolCallTreeProps {
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  readonly block: ToolCallBlock
  readonly selectedCallId?: string | undefined
  readonly cwd?: string | undefined
  readonly openFile: (path: string) => void
  readonly inspectCall: (callId: string) => void
}

const ToolCall = memo(function ToolCall({
  slots,
  kit,
  callId,
  toolName,
  block,
  openFile,
  selected,
  cwd,
  inspectCall,
  children,
}: {
  readonly slots: ToolViewSlots
  readonly kit: AtomicToolViewKit
  readonly callId: string
  readonly toolName: string
  readonly block: ToolCallBlock
  readonly openFile: (path: string) => void
  readonly selected: boolean
  readonly cwd?: string | undefined
  readonly inspectCall: (callId: string) => void
  readonly children?: ReactNode
}) {
  const owner = useMemo<ToolCallOwnerProps>(() => ({
    callId,
    toolName,
    block,
    openFile,
    cwd,
    inspect: () => {
      inspectCall(callId)
    },
  }), [block, callId, cwd, inspectCall, openFile, toolName])

  return (
    <div
      className={css.callRow}
      data-chat-anchor-key={`call:${callId}`}
      data-chat-call-id={callId}
      data-selected={selected || undefined}
    >
      <AtomicToolView owner={owner} kit={kit} slots={slots} />
      {children}
    </div>
  )
})

const ToolCallBranch = memo(function ToolCallBranch({
  slots,
  kit,
  block,
  selectedCallId,
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
      openFile={openFile}
      selected={block.callId === selectedCallId}
      cwd={cwd}
      inspectCall={inspectCall}
    >
      {block.subCalls.length > 0
        ? (
            <div className={css.subCalls} data-subcalls>
              {block.subCalls.map(child => (
                <ToolCallBranch
                  key={child.callId}
                  slots={slots}
                  kit={kit}
                  block={child}
                  selectedCallId={selectedCallId}
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
